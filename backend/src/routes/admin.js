const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { auditarLogin } = require('../middlewares/auditoria');

const router = express.Router();
const prisma = new PrismaClient();

const adminAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token nao fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token invalido' });
  }
};

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'admin', motivo: 'email_nao_encontrado' });
      return res.status(401).json({ erro: 'Credenciais invalidas' });
    }
    const senhaValida = await bcrypt.compare(senha, admin.senhaHash);
    if (!senhaValida) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'admin', userId: admin.id, motivo: 'senha_invalida' });
      return res.status(401).json({ erro: 'Credenciais invalidas' });
    }
    const token = jwt.sign({ id: admin.id, email: admin.email, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '8h' });
    auditarLogin(prisma, { req, sucesso: true, userType: 'admin', userId: admin.id });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Organizacoes (antigo "camaras") ----------

router.get('/camaras', adminAuth, async (req, res) => {
  try {
    const orgs = await prisma.organizacao.findMany({
      select: {
        id: true, nome: true, cnpj: true, ativo: true, plano: true, criadoEm: true, modulosAtivos: true,
        _count: { select: { documentos: true, usuarios: true } },
        usuarios: { select: { id: true, email: true, perfil: true, ativo: true, ultimoAcesso: true }, orderBy: { criadoEm: 'asc' } }
      },
      orderBy: { criadoEm: 'desc' }
    });
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/camaras', adminAuth, async (req, res) => {
  try {
    const { nome, cnpj, email, senha, plano } = req.body;
    const nomeNormalizado = nome ? nome.normalize('NFC') : nome;
    const senhaHash = await bcrypt.hash(senha, 10);
    // Cria organizacao + primeiro usuario (GESTOR) em transacao
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organizacao.create({
        data: { nome: nomeNormalizado, cnpj, plano: plano || 'basico' }
      });
      const usuario = await tx.usuario.create({
        data: { email, senhaHash, nome: nomeNormalizado, perfil: 'GESTOR', organizacaoId: org.id }
      });
      return { org, usuario };
    });
    res.status(201).json({ id: result.org.id, nome: result.org.nome, email: result.usuario.email });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ erro: 'CNPJ ou email ja cadastrado' });
    }
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/camaras/:id/toggle', adminAuth, async (req, res) => {
  try {
    const org = await prisma.organizacao.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ erro: 'Organizacao nao encontrada' });
    const atualizada = await prisma.organizacao.update({ where: { id: req.params.id }, data: { ativo: !org.ativo } });
    res.json({ id: atualizada.id, ativo: atualizada.ativo });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Modulos por organizacao ----------

router.patch('/camaras/:id/modulos', adminAuth, async (req, res) => {
  try {
    const { modulosAtivos } = req.body;
    const MODULOS_VALIDOS = ['anonimizador', 'ropa', 'dsar', 'repositorio', 'treinamento', 'checklist'];
    const validos = (modulosAtivos || []).filter(m => MODULOS_VALIDOS.includes(m));
    const org = await prisma.organizacao.update({
      where: { id: req.params.id },
      data: { modulosAtivos: validos },
      select: { id: true, nome: true, modulosAtivos: true }
    });
    res.json(org);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Organizacao nao encontrada' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Usuarios dentro de organizacoes ----------

router.post('/camaras/:id/usuarios', adminAuth, async (req, res) => {
  try {
    const { email, nome, senha, perfil } = req.body;
    const org = await prisma.organizacao.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ erro: 'Organizacao nao encontrada' });
    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({
      data: {
        email, senhaHash,
        nome: (nome || org.nome).normalize('NFC'),
        perfil: perfil || 'OPERADOR',
        organizacaoId: org.id
      },
      select: { id: true, email: true, nome: true, perfil: true }
    });
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Email ja cadastrado' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/usuarios/:id/toggle', adminAuth, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado' });
    const atualizado = await prisma.usuario.update({ where: { id: req.params.id }, data: { ativo: !usuario.ativo } });
    res.json({ id: atualizado.id, ativo: atualizado.ativo });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/usuarios/:id/perfil', adminAuth, async (req, res) => {
  try {
    const { perfil } = req.body;
    const PERFIS_VALIDOS = ['ENCARREGADO_LGPD', 'GESTOR', 'OPERADOR', 'AUDITOR', 'TREINANDO'];
    if (!PERFIS_VALIDOS.includes(perfil)) return res.status(400).json({ erro: 'Perfil invalido' });
    const atualizado = await prisma.usuario.update({
      where: { id: req.params.id },
      data: { perfil },
      select: { id: true, email: true, perfil: true }
    });
    res.json(atualizado);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuario nao encontrado' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Stats ----------

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalOrgs, orgsAtivas, totalDocumentos, totalUsuarios] = await Promise.all([
      prisma.organizacao.count(),
      prisma.organizacao.count({ where: { ativo: true } }),
      prisma.documento.count(),
      prisma.usuario.count()
    ]);
    res.json({ totalCamaras: totalOrgs, camarasAtivas: orgsAtivas, totalDocumentos, totalUsuarios });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

module.exports = router;
