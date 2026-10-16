const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { requireModulo, ehGestorOuDpo } = require('../middlewares/requireModulo');
const { listarModelos, previa, gerar, ErroGerador } = require('../services/geradorDocumentos');

const router = express.Router();
const prisma = new PrismaClient();

// Gerador de minutas (modulo repositorio). Gera e salva so Gestor/DPO.
router.use(authUsuario, requireModulo(prisma, 'repositorio'));

router.get('/modelos', (req, res) => res.json(listarModelos()));

// POST /gerador/modelos/:id/previa { terceiroId } -> { titulo, texto, pendencias }
router.post('/modelos/:id/previa', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO geram documentos' });
    res.json(await previa(prisma, req.usuario.organizacaoId, req.params.id, { terceiroId: req.body?.terceiroId }));
  } catch (err) {
    if (err instanceof ErroGerador) return res.status(err.status).json({ erro: err.message });
    console.error('[POST /gerador/modelos/:id/previa]', err);
    res.status(500).json({ erro: 'Erro ao montar prévia' });
  }
});

// POST /gerador/modelos/:id/gerar { terceiroId } -> salva DOCX e PDF no repositorio
router.post('/modelos/:id/gerar', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO geram documentos' });
    const r = await gerar(prisma, req.usuario.organizacaoId, req.params.id, { terceiroId: req.body?.terceiroId, usuarioId: req.usuario.id });
    res.status(201).json(r);
  } catch (err) {
    if (err instanceof ErroGerador) return res.status(err.status).json({ erro: err.message });
    console.error('[POST /gerador/modelos/:id/gerar]', err);
    res.status(500).json({ erro: 'Erro ao gerar documento' });
  }
});

module.exports = router;
