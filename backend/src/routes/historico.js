const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { verificarRegistro } = require('../services/entidades');

const router = express.Router();
const prisma = new PrismaClient();

// Campos do diff cujo valor e um id de usuario — a tela mostra o nome.
const CAMPOS_USUARIO = ['responsavelId', 'validadoPor', 'autorId'];

router.use(authUsuario);

// GET /historico?entidade=TRATAMENTO&registroId=...
// Retorna { itens, usuarios } — usuarios mapeia id -> nome para quem
// fez a acao e para ids que aparecem nos campos de responsavel.
router.get('/', async (req, res) => {
  try {
    const entidade = String(req.query.entidade || '');
    const registroId = String(req.query.registroId || '');
    const organizacaoId = req.usuario.organizacaoId;
    const falha = await verificarRegistro(prisma, { entidade, registroId, organizacaoId });
    if (falha) return res.status(falha.status).json({ erro: falha.erro });

    const itens = await prisma.historicoRegistro.findMany({
      where: { organizacaoId, entidade, registroId },
      orderBy: { criadoEm: 'desc' },
      take: 200
    });

    const ids = new Set();
    for (const h of itens) {
      if (h.usuarioId) ids.add(h.usuarioId);
      for (const campo of CAMPOS_USUARIO) {
        const d = h.diff?.[campo];
        if (d?.antes) ids.add(d.antes);
        if (d?.depois) ids.add(d.depois);
      }
    }
    const usuarios = ids.size === 0 ? [] : await prisma.usuario.findMany({
      where: { id: { in: [...ids] }, organizacaoId },
      select: { id: true, nome: true }
    });

    res.json({
      itens,
      usuarios: Object.fromEntries(usuarios.map(u => [u.id, u.nome]))
    });
  } catch (err) {
    console.error('[GET /historico]', err);
    res.status(500).json({ erro: 'Erro ao buscar histórico' });
  }
});

module.exports = router;
