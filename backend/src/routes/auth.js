const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const { body } = require('express-validator');
const { auditarLogin } = require('../middlewares/auditoria');
const { validar, validarEmail } = require('../middlewares/seguranca');
const { authUsuario } = require('../middlewares/authUsuario');
const { registrarHistorico } = require('../services/historico');
const { codigoValido, sessaoValida, RE_CODIGO } = require('../services/mfa');

// Historico do MFA no registro do proprio usuario (nunca o segredo)
function historicoMfa(db, usuario, diff, porUsuarioId = usuario.id) {
  return registrarHistorico(db, {
    organizacaoId: usuario.organizacaoId, entidade: 'USUARIO', registroId: usuario.id, acao: 'EDITAR', usuarioId: porUsuarioId, diff
  });
}

const router = express.Router();
const prisma = new PrismaClient();

const validadoresLogin = [
  validarEmail('email'),
  body('senha').isString().isLength({ min: 1, max: 200 }).withMessage('Senha obrigatória'),
  validar
];

const validadorCodigoMfa = body('codigo')
  .trim()
  .matches(/^\d{6}$/)
  .withMessage('Código deve ter 6 dígitos');

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
    modulosAtivos: usuario.organizacao.modulosAtivos,
    sv: usuario.sessaoVersao || 0
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

// Sessao completa (rejeita mfaPending e mfaSetup).
const authRequired = authUsuario;

// Aceita sessao completa OU o setupToken emitido no login quando a
// organizacao exige MFA e o usuario ainda nao configurou. Usado so em
// /mfa/configurar e /mfa/ativar.
async function authOuSetupMfa(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.mfaPending) return res.status(401).json({ erro: 'Sessão incompleta (MFA pendente)' });
    if (decoded.mfaSetup) {
      if (!decoded.userId) return res.status(401).json({ erro: 'Token inválido' });
      req.usuario = { id: decoded.userId };
      req.mfaSetup = true;
      return next();
    }
    if (!(await sessaoValida(prisma, decoded))) return res.status(401).json({ erro: 'Sessão encerrada. Entre novamente.' });
    req.usuario = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

router.post('/login', validadoresLogin, async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { organizacao: { select: { id: true, nome: true, ativo: true, plano: true, modulosAtivos: true, mfaObrigatorio: true } } }
    });
    if (!usuario || usuario.deletedAt) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', motivo: 'email_nao_encontrado' });
      return res.status(401).json({ erro: 'Email ou senha inválidos' });
    }
    if (!usuario.organizacao.ativo) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'organizacao_desativada' });
      return res.status(403).json({ erro: 'Organização desativada. Entre em contato com o administrador.' });
    }
    if (!usuario.ativo) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'usuario_desativado' });
      return res.status(403).json({ erro: 'Acesso desativado. Entre em contato com o gestor da sua organização.' });
    }
    const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaValida) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'senha_invalida' });
      return res.status(401).json({ erro: 'Email ou senha inválidos' });
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
        mensagem: 'Informe o código de 6 dígitos do seu autenticador'
      });
    }

    // Organizacao exige MFA e o usuario nao tem: nao emite sessao. O
    // setupToken (15 min) so serve para /mfa/configurar e /mfa/ativar;
    // a sessao real sai do /mfa/ativar.
    if (usuario.organizacao.mfaObrigatorio) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'mfa_setup_obrigatorio' });
      const setupToken = jwt.sign(
        { mfaSetup: true, userId: usuario.id },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      return res.json({
        mfaSetupObrigatorio: true,
        setupToken,
        mensagem: 'Sua organização exige autenticação em 2 etapas. Configure o autenticador para continuar.'
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
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.mfaPending || decoded.mfaSetup) return res.status(401).json({ erro: 'Sessão incompleta (MFA pendente)' });
    if (!(await sessaoValida(prisma, decoded))) return res.status(401).json({ erro: 'Sessão encerrada. Entre novamente.' });
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, nome: true, email: true, perfil: true, ativo: true, mfaAtivo: true, deletedAt: true,
        organizacaoId: true,
        organizacao: { select: { nome: true, slug: true, plano: true, modulosAtivos: true, mfaObrigatorio: true } }
      }
    });
    if (!usuario || usuario.deletedAt) return res.status(401).json({ erro: 'Sessão inválida' });
    delete usuario.deletedAt;
    const { organizacao, ...rest } = usuario;
    res.json({ ...rest, orgNome: organizacao.nome, orgSlug: organizacao.slug, plano: organizacao.plano, modulosAtivos: organizacao.modulosAtivos, mfaObrigatorioOrg: organizacao.mfaObrigatorio });
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
});

// ==================== MFA (TOTP / Google Authenticator) ====================

// Gera um secret novo e devolve o QR code em data URL.
// - MFA ainda nao ativo: grava em mfaSecret (mfaAtivo continua false).
// - MFA ja ativo (troca de aparelho): EXIGE o codigo atual valido (Etapa
//   6d). Sem ele, recusa e nao altera nada. Com ele, o segredo novo fica em
//   mfaSecretPendente; o MFA atual segue valendo ate o novo ser confirmado
//   em /mfa/ativar.
router.post('/mfa/configurar', authOuSetupMfa, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (usuario.mfaAtivo && !codigoValido(usuario.mfaSecret, req.body?.codigo)) {
      return res.status(400).json({ erro: 'O MFA já está ativo: informe o código atual do autenticador para trocar de aparelho' });
    }

    const secret = speakeasy.generateSecret({
      length: 20,
      name: `LGPD (${usuario.email})`,
      issuer: 'Anonimizador LGPD'
    });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: usuario.mfaAtivo
        ? { mfaSecretPendente: secret.base32 }
        : { mfaSecret: secret.base32, mfaSecretPendente: null, mfaAtivo: false }
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
router.post('/mfa/ativar', authOuSetupMfa, validadorCodigoMfa, validar, async (req, res) => {
  try {
    const { codigo } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    // Troca de aparelho: confirma o segredo pendente; senao, o da configuracao
    const troca = !!(usuario?.mfaAtivo && usuario.mfaSecretPendente);
    const alvo = troca ? usuario.mfaSecretPendente : usuario?.mfaSecret;
    if (!usuario || !alvo || (usuario.mfaAtivo && !troca)) {
      return res.status(400).json({ erro: usuario?.mfaAtivo ? 'O MFA já está ativo' : 'Configure o MFA antes de ativar' });
    }
    if (!codigoValido(alvo, codigo)) return res.status(400).json({ erro: 'Código inválido' });
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuario.id },
        data: troca ? { mfaSecret: alvo, mfaSecretPendente: null, mfaAtivo: true } : { mfaAtivo: true }
      });
      await historicoMfa(tx, usuario, { mfa: troca ? { antes: 'ativo', depois: 'ativo (autenticador trocado)' } : { antes: 'inativo', depois: 'ativo' } });
    });

    // Veio do login com MFA obrigatorio: conclui o login aqui.
    if (req.mfaSetup) {
      const completo = await prisma.usuario.findUnique({
        where: { id: usuario.id },
        include: { organizacao: { select: { id: true, nome: true, ativo: true, plano: true, modulosAtivos: true, mfaObrigatorio: true } } }
      });
      if (!completo || completo.deletedAt || !completo.ativo || !completo.organizacao.ativo) {
        return res.status(403).json({ erro: 'Acesso desativado' });
      }
      await prisma.usuario.update({ where: { id: completo.id }, data: { ultimoAcesso: new Date() } });
      auditarLogin(prisma, { req, sucesso: true, userType: 'usuario', userId: completo.id });
      return res.json({ ok: true, mfaAtivo: true, ...emitirSessao(completo) });
    }

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
    if (!tempToken) return res.status(400).json({ erro: 'tempToken obrigatório' });
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    if (!payload.mfaPending || !payload.userId) {
      return res.status(401).json({ erro: 'Token inválido' });
    }
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      include: { organizacao: { select: { id: true, nome: true, ativo: true, plano: true, modulosAtivos: true, mfaObrigatorio: true } } }
    });
    if (!usuario || usuario.deletedAt || !usuario.mfaSecret || !usuario.mfaAtivo) {
      return res.status(400).json({ erro: 'MFA não configurado' });
    }
    const ok = speakeasy.totp.verify({
      secret: usuario.mfaSecret,
      encoding: 'base32',
      token: codigo,
      window: 1
    });
    if (!ok) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'usuario', userId: usuario.id, motivo: 'mfa_invalido' });
      return res.status(401).json({ erro: 'Código inválido' });
    }
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });
    auditarLogin(prisma, { req, sucesso: true, userType: 'usuario', userId: usuario.id });
    res.json(emitirSessao(usuario));
  } catch (err) {
    console.error('[POST /auth/mfa/verificar]', err);
    res.status(500).json({ erro: 'Erro ao verificar MFA' });
  }
});

// Desativa MFA. Requer o codigo TOTP atual OU a senha (Etapa 6d) para
// confirmar que e o proprio dono da conta. Sempre responde com mensagem.
router.put('/mfa/desativar', authRequired, async (req, res) => {
  try {
    const { codigo, senha } = req.body || {};
    if (!codigo && !senha) return res.status(400).json({ erro: 'Informe o código do autenticador ou a sua senha' });
    if (codigo && !RE_CODIGO.test(String(codigo))) return res.status(400).json({ erro: 'Código deve ter 6 dígitos' });
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      include: { organizacao: { select: { mfaObrigatorio: true } } }
    });
    if (!usuario || !usuario.mfaSecret || !usuario.mfaAtivo) {
      return res.status(400).json({ erro: 'MFA não está ativo' });
    }
    if (usuario.organizacao.mfaObrigatorio) {
      return res.status(403).json({ erro: 'Sua organização exige MFA. Não é possível desativar.' });
    }
    const ok = codigo
      ? codigoValido(usuario.mfaSecret, codigo)
      : (typeof senha === 'string' && senha.length <= 200 && await bcrypt.compare(senha, usuario.senhaHash));
    if (!ok) return res.status(400).json({ erro: codigo ? 'Código inválido' : 'Senha incorreta' });
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { mfaSecret: null, mfaSecretPendente: null, mfaAtivo: false }
      });
      await historicoMfa(tx, usuario, { mfa: { antes: 'ativo', depois: 'inativo' }, confirmadoCom: { antes: null, depois: codigo ? 'código do autenticador' : 'senha' } });
    });
    res.json({ ok: true, mfaAtivo: false, mensagem: 'MFA desativado.' });
  } catch (err) {
    console.error('[PUT /auth/mfa/desativar]', err);
    res.status(500).json({ erro: 'Erro ao desativar MFA' });
  }
});

module.exports = router;
