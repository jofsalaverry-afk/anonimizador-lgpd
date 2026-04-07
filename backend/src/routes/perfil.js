const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token nao fornecido' });
    req.camara = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ erro: 'Token invalido' }); }
};

router.get('/perfil', auth, async (req, res) => {
  try {
    const camara = await prisma.camara.findUnique({ where: { id: req.camara.id }, select: { id: true, nome: true, cnpj: true, email: true, municipio: true, cabecalho: true, logoBase64: true, plano: true } });
    res.json(camara);
  } catch { res.status(500).json({ erro: 'Erro ao buscar perfil' }); }
});

router.put('/perfil', auth, async (req, res) => {
  try {
    const { municipio, cabecalho, logoBase64 } = req.body;
    const camara = await prisma.camara.update({ where: { id: req.camara.id }, data: { municipio, cabecalho, logoBase64 }, select: { id: true, nome: true, cnpj: true, email: true, municipio: true, cabecalho: true, logoBase64: true, plano: true } });
    res.json(camara);
  } catch { res.status(500).json({ erro: 'Erro ao salvar perfil' }); }
});

module.exports = router;