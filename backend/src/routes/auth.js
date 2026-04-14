const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const { body } = require('express-validator');
const { auditarLogin } = require('../middlewares/auditoria');
const { validar, validarEmail } = require('../middlewares/seguranca');

const router = express.Router();
const prisma = new PrismaClient();

const validadoresLogin = [
  validarEmail('email'),
  body('senha').isString().isLength({ min: 1, max: 200 }).withMessage('Senha obrigatoria'),
  validar
];

const validadorCodigoMfa = body('codigo')
  .trim()
  .matches(/^\d{6}$/)
  .withMessage('Codigo deve ter 6 digitos');

// Monta o JWT full da sessao + o payload de usuario retornado ao client.
// Usado pelo login direto (sem MFA) e pelo POST /mfa/verificar apos o
// challenge. Centralizar aqui evita drift entre os dois fluxos.
function emitirSessao(usuario) {
  const token = jwt.sign({
    id: usuario.id,
    email: usuario.email,
    nome: usuario.nome,
    perfil: usuario.perfil,
    organizacaoId: usuario.organizacaoId,
    orgNome: usuario.organizacao.nome,
    modulosAtivos: usuario.organizacao.modulosAtivos
  }, process.env.JWT_SECRET, { expiresIn: '8h' });
  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      organizacaoId: usuario.organizacaoId,
      orgNome: usuario.organizacao.nome,
      plano: usuario.organizacao.plano,
      modulosAtivos: usuario.organizacao.modulosAtivos,
      mfaAtivo: usuario.mfaAtivo
    }
  };
}

// Middleware de auth padrao das rotas abaixo (exceto as de login publico).
// Nao importa do dsar/documents pra evitar dependencia cruzada.
function authRequired(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token nao fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.mfaPending) return res.status(401).json({ erro: 'Sessao incompleta (MFA pendente)' });
    req.usuario = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token invalido' });
  }
}

router.post('/login', validadoresLogin, async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { organizacao: { select: { id: true, nome: true, ativo: true, plano: true, modulosAtivos: true } } }
    });
    if (!usuario || usuario.deletedAt) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', motivo: 'email_nao_encontrado' });
      return res.status(401).json({ erro: 'Email ou senha invalidos' });
    }
    if (!usuario.organizacao.ativo) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'organizacao_desativada' });
      return res.status(403).json({ erro: 'Organizacao desativada. Entre em contato com o administrador.' });
    }
    if (!usuario.ativo) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'usuario_desativado' });
      return res.status(403).json({ erro: 'Acesso desativado. Entre em contato com o gestor da sua organizacao.' });
    }
    const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaValida) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'senha_invalida' });
      return res.status(401).json({ erro: 'Email ou senha invalidos' });
    }

    // Se o usuario ja ativou MFA, nao emite o token de sessao ainda —
    // emite um tempToken de 5 minutos marcado com mfaPending que so
    // serve para POST /auth/mfa/verificar. A sessao real sai de la.
    if (usuario.mfaAtivo) {
      const tempToken = jwt.sign(
        { mfaPending: true, userId: usuario.id },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        mfaPendente: true,
        tempToken,
        mensagem: 'Informe o codigo de 6 digitos do seu autenticador'
      });
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });
    auditarLogin(prisma, { req, sucesso: true, userType: 'usuario', userId: usuario.id });
    // Sinaliza para perfis privilegiados que MFA e obrigatorio e deveria
    // ser configurado (soft warning — nao bloqueia o login).
    const mfaObrigatorio = ['ENCARREGADO_LGPD', 'GESTOR'].includes(usuario.perfil) && !usuario.mfaAtivo;
    const sessao = emitirSessao(usuario);
    res.json({ ...sessao, mfaObrigatorio });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token nao fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.mfaPending) return res.status(401).json({ erro: 'Sessao incompleta (MFA pendente)' });
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, nome: true, email: true, perfil: true, ativo: true, mfaAtivo: true, deletedAt: true,
        organizacaoId: true,
        organizacao: { select: { nome: true, plano: true, modulosAtivos: true } }
      }
    });
    if (!usuario || usuario.deletedAt) return res.status(401).json({ erro: 'Sessao invalida' });
    delete usuario.deletedAt;
    const { organizacao, ...rest } = usuario;
    res.json({ ...rest, orgNome: organizacao.nome, plano: organizacao.plano, modulosAtivos: organizacao.modulosAtivos });
  } catch (err) {
    res.status(401).json({ erro: 'Token invalido' });
  }
});

// ==================== MFA (TOTP / Google Authenticator) ====================

// Gera um secret novo, grava no usuario (mfaAtivo continua false) e
// devolve o QR code em data URL pronto pra escanear. Se chamar 2x, o
// secret antigo e sobrescrito — so o ultimo vale.
router.post('/mfa/configurar', authRequired, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado' });

    const secret = speakeasy.generateSecret({
      length: 20,
      name: `LGPD (${usuario.email})`,
      issuer: 'Anonimizador LGPD'
    });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { mfaSecret: secret.base32, mfaAtivo: false }
    });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    res.json({
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCode
    });
  } catch (err) {
    console.error('[POST /auth/mfa/configurar]', err);
    res.status(500).json({ erro: 'Erro ao configurar MFA' });
  }
});

// Recebe o codigo de 6 digitos gerado pelo Authenticator e, se casar
// com o secret gravado no configurar, marca mfaAtivo=true.
router.post('/mfa/ativar', authRequired, validadorCodigoMfa, validar, async (req, res) => {
  try {
    const { codigo } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario || !usuario.mfaSecret) {
      return res.status(400).json({ erro: 'Configure o MFA antes de ativar' });
    }
    const ok = speakeasy.totp.verify({
      secret: usuario.mfaSecret,
      encoding: 'base32',
      token: codigo,
      window: 1
    });
    if (!ok) return res.status(400).json({ erro: 'Codigo invalido' });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { mfaAtivo: true }
    });
    res.json({ ok: true, mfaAtivo: true });
  } catch (err) {
    console.error('[POST /auth/mfa/ativar]', err);
    res.status(500).json({ erro: 'Erro ao ativar MFA' });
  }
});

// Segundo fator do login. Recebe tempToken (no body) + codigo TOTP.
// Valida o tempToken, confirma o codigo e devolve a sessao real.
router.post('/mfa/verificar', validadorCodigoMfa, validar, async (req, res) => {
  try {
    const { tempToken, codigo } = req.body;
    if (!tempToken) return res.status(400).json({ erro: 'tempToken obrigatorio' });
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ erro: 'Sessao expirada. Faca login novamente.' });
    }
    if (!payload.mfaPending || !payload.userId) {
      return res.status(401).json({ erro: 'Token invalido' });
    }
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      include: { organizacao: { select: { id: true, nome: true, ativo: true, plano: true, modulosAtivos: true } } }
    });
    if (!usuario || usuario.deletedAt || !usuario.mfaSecret || !usuario.mfaAtivo) {
      return res.status(400).json({ erro: 'MFA nao configurado' });
    }
    const ok = speakeasy.totp.verify({
      secret: usuario.mfaSecret,
      encoding: 'base32',
      token: codigo,
      window: 1
    });
    if (!ok) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'mfa_invalido' });
      return res.status(401).json({ erro: 'Codigo invalido' });
    }
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });
    auditarLogin(prisma, { req, sucesso: true, userType: 'usuario', userId: usuario.id });
    res.json(emitirSessao(usuario));
  } catch (err) {
    console.error('[POST /auth/mfa/verificar]', err);
    res.status(500).json({ erro: 'Erro ao verificar MFA' });
  }
});

// Desativa MFA. Requer um codigo TOTP valido atual para confirmar que
// e o proprio dono da conta (ninguem com token roubado pode desativar).
router.put('/mfa/desativar', authRequired, validadorCodigoMfa, validar, async (req, res) => {
  try {
    const { codigo } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario || !usuario.mfaSecret || !usuario.mfaAtivo) {
      return res.status(400).json({ erro: 'MFA nao esta ativo' });
    }
    const ok = speakeasy.totp.verify({
      secret: usuario.mfaSecret,
      encoding: 'base32',
      token: codigo,
      window: 1
    });
    if (!ok) return res.status(400).json({ erro: 'Codigo invalido' });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { mfaSecret: null, mfaAtivo: false }
    });
    res.json({ ok: true, mfaAtivo: false });
  } catch (err) {
    console.error('[PUT /auth/mfa/desativar]', err);
    res.status(500).json({ erro: 'Erro ao desativar MFA' });
  }
});

module.exports = router;
