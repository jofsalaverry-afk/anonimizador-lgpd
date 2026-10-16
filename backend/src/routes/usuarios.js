const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authUsuario);

// GET /usuarios — usuarios ativos da propria organizacao, para os
// seletores de responsavel. Nao expoe email nem dados de login.
router.get('/', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { organizacaoId: req.usuario.organizacaoId, ativo: true, deletedAt: null },
      select: { id: true, nome: true, perfil: true },
      orderBy: { nome: 'asc' }
    });
    res.json(usuarios);
  } catch (err) {
    console.error('[GET /usuarios]', err);
    res.status(500).json({ erro: 'Erro ao listar usuários' });
  }
});

module.exports = router;
