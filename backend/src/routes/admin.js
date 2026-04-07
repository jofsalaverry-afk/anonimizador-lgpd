const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const adminAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
};

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const senhaValida = await bcrypt.compare(senha, admin.senhaHash);
    if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const token = jwt.sign({ id: admin.id, email: admin.email, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/camaras', adminAuth, async (req, res) => {
  try {
    const camaras = await prisma.camara.findMany({
      select: { id: true, nome: true, cnpj: true, email: true, ativo: true, plano: true, criadoEm: true, ultimoAcesso: true, _count: { select: { documentos: true } } },
      orderBy: { criadoEm: 'desc' }
    });
    res.json(camaras);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/camaras/:id/toggle', adminAuth, async (req, res) => {
  try {
    const camara = await prisma.camara.findUnique({ where: { id: req.params.id } });
    if (!camara) return res.status(404).json({ erro: 'Câmara não encontrada' });
    const atualizada = await prisma.camara.update({ where: { id: req.params.id }, data: { ativo: !camara.ativo } });
    res.json({ id: atualizada.id, ativo: atualizada.ativo });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/camaras', adminAuth, async (req, res) => {
  try {
    const { nome, cnpj, email, senha, plano } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);
    const camara = await prisma.camara.create({ data: { nome, cnpj, email, senhaHash, plano: plano || 'basico' } });
    res.status(201).json({ id: camara.id, nome: camara.nome, email: camara.email });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalCamaras = await prisma.camara.count();
    const camarasAtivas = await prisma.camara.count({ where: { ativo: true } });
    const totalDocumentos = await prisma.documento.count();
    res.json({ totalCamaras, camarasAtivas, totalDocumentos });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

module.exports = router;