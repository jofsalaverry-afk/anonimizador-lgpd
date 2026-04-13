const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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

router.post('/login', validadoresLogin, async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { organizacao: { select: { id: true, nome: true, ativo: true, plano: true, modulosAtivos: true } } }
    });
    if (!usuario) {
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
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });
    const token = jwt.sign({
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      perfil: usuario.perfil,
      organizacaoId: usuario.organizacaoId,
      orgNome: usuario.organizacao.nome,
      modulosAtivos: usuario.organizacao.modulosAtivos
    }, process.env.JWT_SECRET, { expiresIn: '8h' });
    auditarLogin(prisma, { req, sucesso: true, userType: 'usuario', userId: usuario.id });
    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        organizacaoId: usuario.organizacaoId,
        orgNome: usuario.organizacao.nome,
        plano: usuario.organizacao.plano,
        modulosAtivos: usuario.organizacao.modulosAtivos
      }
    });
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
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: { id: true, nome: true, email: true, perfil: true, ativo: true, organizacaoId: true, organizacao: { select: { nome: true, plano: true, modulosAtivos: true } } }
    });
    if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado' });
    const { organizacao, ...rest } = usuario;
    res.json({ ...rest, orgNome: organizacao.nome, plano: organizacao.plano, modulosAtivos: organizacao.modulosAtivos });
  } catch (err) {
    res.status(401).json({ erro: 'Token invalido' });
  }
});

module.exports = router;
