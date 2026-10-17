const express = require('express');
const { authUsuario } = require('../middlewares/authUsuario');
const { ehGestorOuDpo } = require('../middlewares/requireModulo');
const { registrarHistorico } = require('../services/historico');
const { calcularIndicadores, gerarSnapshot, carregarMetas, INDICADORES_COM_META, METAS_PADRAO } = require('../services/indicadores');
const { responderExport, paraCsv, EXPORTADORES, linhaIndicador } = require('../services/exportadores');

const router = express.Router();
const { prisma } = require('../db');

// Painel transversal: qualquer usuario da organizacao ve os indicadores;
// metas e foto manual so Gestor/DPO.
router.use(authUsuario);

router.get('/', async (req, res) => {
  try {
    res.json(await calcularIndicadores(prisma, req.usuario.organizacaoId));
  } catch (err) {
    console.error('[GET /indicadores]', err);
    res.status(500).json({ erro: 'Erro ao calcular indicadores' });
  }
});

// GET /indicadores/export?formato=csv|json — indicadores do momento
router.get('/export', async (req, res) => {
  try {
    const r = await calcularIndicadores(prisma, req.usuario.organizacaoId);
    const data = new Date().toISOString().slice(0, 10);
    if (req.query.formato === 'csv') {
      const linhas = r.indicadores.map(i => linhaIndicador(i, { mesReferencia: r.mesReferencia, origem: 'ATUAL', geradoEm: r.geradoEm }));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="indicadores-${data}.csv"`);
      return res.send(paraCsv(EXPORTADORES.indicadores.colunas, linhas));
    }
    res.setHeader('Content-Disposition', `attachment; filename="indicadores-${data}.json"`);
    res.json(r);
  } catch (err) {
    console.error('[GET /indicadores/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar indicadores' });
  }
});

// ---------- Metas ----------

router.get('/metas', async (req, res) => {
  try {
    const { metas, personalizadas } = await carregarMetas(prisma, req.usuario.organizacaoId);
    res.json({ metas, padrao: METAS_PADRAO, personalizadas });
  } catch (err) {
    console.error('[GET /indicadores/metas]', err);
    res.status(500).json({ erro: 'Erro ao carregar metas' });
  }
});

// PUT /indicadores/metas { metas: { ROPA: 100, CONTRATOS: 90, ... } }
router.put('/metas', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem alterar metas' });
    const orgId = req.usuario.organizacaoId;
    const novas = req.body?.metas || {};
    for (const [k, v] of Object.entries(novas)) {
      if (!INDICADORES_COM_META.includes(k)) return res.status(400).json({ erro: `Indicador inválido: ${k}` });
      if (!Number.isInteger(v) || v < 0 || v > 100) return res.status(400).json({ erro: `Meta de ${k} deve ser inteiro entre 0 e 100` });
    }
    const antes = (await carregarMetas(prisma, orgId)).metas;
    await prisma.$transaction(async (tx) => {
      for (const [indicador, percentualMeta] of Object.entries(novas)) {
        await tx.metaIndicador.upsert({
          where: { organizacaoId_indicador: { organizacaoId: orgId, indicador } },
          create: { organizacaoId: orgId, indicador, percentualMeta, atualizadoPorId: req.usuario.id },
          update: { percentualMeta, atualizadoPorId: req.usuario.id }
        });
      }
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'METAS_INDICADORES', registroId: orgId, acao: 'EDITAR', usuarioId: req.usuario.id,
        antes: Object.fromEntries(Object.keys(novas).map(k => [`meta${k}`, antes[k]])),
        depois: Object.fromEntries(Object.entries(novas).map(([k, v]) => [`meta${k}`, v]))
      });
    });
    res.json(await carregarMetas(prisma, orgId));
  } catch (err) {
    console.error('[PUT /indicadores/metas]', err);
    res.status(500).json({ erro: 'Erro ao salvar metas' });
  }
});

// ---------- Fotos mensais ----------

router.get('/snapshots', async (req, res) => {
  try {
    const ss = await prisma.snapshotIndicadores.findMany({
      where: { organizacaoId: req.usuario.organizacaoId }, orderBy: { mesReferencia: 'desc' }
    });
    res.json(ss);
  } catch (err) {
    console.error('[GET /indicadores/snapshots]', err);
    res.status(500).json({ erro: 'Erro ao listar fotos' });
  }
});

router.get('/snapshots/export', async (req, res) => {
  try {
    await responderExport(res, prisma, 'indicadores', req.usuario.organizacaoId, req.query.formato);
  } catch (err) {
    console.error('[GET /indicadores/snapshots/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar fotos' });
  }
});

// POST /indicadores/snapshots — foto do mes corrente sob demanda
router.post('/snapshots', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem gerar a foto mensal' });
    const s = await gerarSnapshot(prisma, req.usuario.organizacaoId, { origem: 'MANUAL', usuarioId: req.usuario.id });
    res.status(201).json(s);
  } catch (err) {
    console.error('[POST /indicadores/snapshots]', err);
    res.status(500).json({ erro: 'Erro ao gerar foto dos indicadores' });
  }
});

module.exports = router;
