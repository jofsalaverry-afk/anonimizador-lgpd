const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token nao fornecido' });
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ erro: 'Token invalido' }); }
};

router.get('/perfil', auth, async (req, res) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { id: true, nome: true, cnpj: true, municipio: true, cabecalho: true, logoBase64: true, plano: true }
    });
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { id: true, nome: true, email: true, perfil: true }
    });
    res.json({ ...org, usuario });
  } catch { res.status(500).json({ erro: 'Erro ao buscar perfil' }); }
});

router.put('/perfil', auth, async (req, res) => {
  try {
    // Apenas GESTOR e ENCARREGADO_LGPD podem alterar perfil da organizacao
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissao para alterar perfil da organizacao' });
    }
    const { municipio, cabecalho, logoBase64 } = req.body;
    const org = await prisma.organizacao.update({
      where: { id: req.usuario.organizacaoId },
      data: { municipio, cabecalho, logoBase64 },
      select: { id: true, nome: true, cnpj: true, municipio: true, cabecalho: true, logoBase64: true, plano: true }
    });
    res.json(org);
  } catch { res.status(500).json({ erro: 'Erro ao salvar perfil' }); }
});

module.exports = router;
