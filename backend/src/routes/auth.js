const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const camara = await prisma.camara.findUnique({ where: { email } });
    if (!camara) return res.status(401).json({ erro: 'Email ou senha inválidos' });
    if (!camara.ativo) return res.status(403).json({ erro: 'Acesso desativado. Entre em contato com o administrador.' });
    const senhaValida = await bcrypt.compare(senha, camara.senhaHash);
    if (!senhaValida) return res.status(401).json({ erro: 'Email ou senha inválidos' });
    await prisma.camara.update({ where: { id: camara.id }, data: { ultimoAcesso: new Date() } });
    const token = jwt.sign({ id: camara.id, email: camara.email, nome: camara.nome }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, camara: { id: camara.id, nome: camara.nome, email: camara.email, plano: camara.plano } });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const camara = await prisma.camara.findUnique({ where: { id: decoded.id }, select: { id: true, nome: true, email: true, cnpj: true, plano: true, ativo: true } });
    res.json(camara);
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
});

module.exports = router;