const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ---------- Middlewares ----------

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
};

// Alertas sao transversais — nao exigem modulo checklist.
// Apenas as rotas de checklist sao protegidas pelo modulo.
const requireChecklistModulo = async (req, res, next) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { modulosAtivos: true }
    });
    if (!org || !org.modulosAtivos.includes('checklist')) {
      return res.status(403).json({ erro: 'Módulo "checklist" não está ativo para sua organização.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar módulos' });
  }
};

router.use(authMiddleware);

// ==================== Checklist ====================

// GET /conformidade/checklist — lista todos os itens com a resposta da org
router.get('/checklist', requireChecklistModulo, async (req, res) => {
  try {
    const itens = await prisma.itemChecklist.findMany({
      orderBy: { codigo: 'asc' }
    });
    const respostas = await prisma.respostaChecklist.findMany({
      where: { organizacaoId: req.usuario.organizacaoId }
    });
    const respostaPorItem = Object.fromEntries(respostas.map(r => [r.itemId, r]));
    const resultado = itens.map(it => ({ ...it, resposta: respostaPorItem[it.id] || null }));
    res.json(resultado);
  } catch (err) {
    console.error('[GET /conformidade/checklist]', err);
    res.status(500).json({ erro: 'Erro ao carregar checklist' });
  }
});

// POST /conformidade/checklist/:itemId/responder — cria ou atualiza resposta
router.post('/checklist/:itemId/responder', requireChecklistModulo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para responder checklist' });
    }

    const { status, observacao, evidenciaUrl, proximaRevisao } = req.body;
    const STATUS_VALIDOS = ['CONFORME', 'PARCIAL', 'NAO_CONFORME', 'NAO_APLICAVEL'];
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: 'status inválido' });
    }

    const item = await prisma.itemChecklist.findUnique({ where: { id: req.params.itemId } });
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });

    // Hash de integridade da evidencia (se houver URL ou observacao)
    const conteudoHash = (evidenciaUrl || '') + (observacao || '') + new Date().toISOString();
    const evidenciaHash = evidenciaUrl || observacao
      ? crypto.createHash('sha256').update(conteudoHash).digest('hex')
      : null;

    const resposta = await prisma.respostaChecklist.upsert({
      where: {
        organizacaoId_itemId: {
          organizacaoId: req.usuario.organizacaoId,
          itemId: req.params.itemId
        }
      },
      create: {
        organizacaoId: req.usuario.organizacaoId,
        itemId: req.params.itemId,
        status, observacao: observacao || null,
        evidenciaUrl: evidenciaUrl || null,
        evidenciaHash,
        validadoPor: req.usuario.id,
        proximaRevisao: proximaRevisao ? new Date(proximaRevisao) : null
      },
      update: {
        status,
        observacao: observacao || null,
        evidenciaUrl: evidenciaUrl || null,
        evidenciaHash,
        validadoPor: req.usuario.id,
        ...(proximaRevisao && { proximaRevisao: new Date(proximaRevisao) })
      }
    });

    res.json(resposta);
  } catch (err) {
    console.error('[POST /conformidade/checklist/:itemId/responder]', err);
    res.status(500).json({ erro: 'Erro ao salvar resposta' });
  }
});

// GET /conformidade/score — percentual de conformidade da organizacao
router.get('/score', requireChecklistModulo, async (req, res) => {
  try {
    const itens = await prisma.itemChecklist.findMany();
    const respostas = await prisma.respostaChecklist.findMany({
      where: { organizacaoId: req.usuario.organizacaoId }
    });

    const pesos = { ALTA: 3, MEDIA: 2, BAIXA: 1 };
    const valor = { CONFORME: 1.0, PARCIAL: 0.5, NAO_CONFORME: 0, NAO_APLICAVEL: null };

    let totalPontos = 0;
    let pontosObtidos = 0;
    const porCategoria = {};
    const porStatus = { CONFORME: 0, PARCIAL: 0, NAO_CONFORME: 0, NAO_APLICAVEL: 0, SEM_RESPOSTA: 0 };
    const respostaPorItem = Object.fromEntries(respostas.map(r => [r.itemId, r]));

    for (const item of itens) {
      const peso = pesos[item.criticidade] || 1;
      const resp = respostaPorItem[item.id];
      if (!resp) {
        totalPontos += peso;
        porStatus.SEM_RESPOSTA++;
        porCategoria[item.categoria] = porCategoria[item.categoria] || { total: 0, obtidos: 0 };
        porCategoria[item.categoria].total += peso;
        continue;
      }
      porStatus[resp.status]++;
      // NAO_APLICAVEL nao conta nem no total nem nos obtidos
      if (resp.status === 'NAO_APLICAVEL') continue;
      const v = valor[resp.status];
      totalPontos += peso;
      pontosObtidos += peso * v;
      porCategoria[item.categoria] = porCategoria[item.categoria] || { total: 0, obtidos: 0 };
      porCategoria[item.categoria].total += peso;
      porCategoria[item.categoria].obtidos += peso * v;
    }

    const score = totalPontos === 0 ? 0 : Math.round((pontosObtidos / totalPontos) * 100);
    const scoreCategoria = Object.fromEntries(
      Object.entries(porCategoria).map(([k, v]) => [k, v.total === 0 ? 0 : Math.round((v.obtidos / v.total) * 100)])
    );

    res.json({
      score,
      totalItens: itens.length,
      porStatus,
      porCategoria: scoreCategoria
    });
  } catch (err) {
    console.error('[GET /conformidade/score]', err);
    res.status(500).json({ erro: 'Erro ao calcular score' });
  }
});

// ==================== Alertas (transversais — sem modulo) ====================

// GET /conformidade/alertas — gera alertas dinamicos + lista alertas persistidos
router.get('/alertas', async (req, res) => {
  try {
    const orgId = req.usuario.organizacaoId;
    const org = await prisma.organizacao.findUnique({
      where: { id: orgId },
      select: { modulosAtivos: true }
    });
    const modulos = org?.modulosAtivos || [];

    // Gera alertas dinamicos a partir do estado atual de outros modulos.
    // Idempotente: deduplica por (tipo, referenciaId).
    const alertasGerados = [];

    // DSAR_PRAZO: solicitacoes vencidas ou quase vencendo
    if (modulos.includes('dsar')) {
      const solicitacoes = await prisma.solicitacaoTitular.findMany({
        where: {
          organizacaoId: orgId,
          status: { in: ['RECEBIDA', 'EM_ANALISE'] }
        },
        select: { id: true, protocolo: true, dataLimite: true }
      });
      const agora = new Date();
      for (const s of solicitacoes) {
        const dias = Math.ceil((s.dataLimite - agora) / (1000 * 60 * 60 * 24));
        if (dias < 2) {
          alertasGerados.push({
            tipo: 'DSAR_PRAZO',
            criticidade: dias < 0 ? 'ALTA' : 'ALTA',
            mensagem: dias < 0
              ? `Solicitação ${s.protocolo} vencida há ${Math.abs(dias)} dia(s)`
              : `Solicitação ${s.protocolo} vence em ${dias} dia(s)`,
            referenciaId: s.id
          });
        } else if (dias <= 5) {
          alertasGerados.push({
            tipo: 'DSAR_PRAZO',
            criticidade: 'MEDIA',
            mensagem: `Solicitação ${s.protocolo} vence em ${dias} dias`,
            referenciaId: s.id
          });
        }
      }
    }

    // INCIDENTE_ABERTO: incidentes em aberto ou em investigacao
    if (modulos.includes('repositorio')) {
      const incidentes = await prisma.incidente.findMany({
        where: {
          organizacaoId: orgId,
          status: { in: ['ABERTO', 'EM_INVESTIGACAO'] }
        },
        select: { id: true, titulo: true, status: true }
      });
      for (const i of incidentes) {
        alertasGerados.push({
          tipo: 'INCIDENTE_ABERTO',
          criticidade: i.status === 'ABERTO' ? 'ALTA' : 'MEDIA',
          mensagem: `Incidente "${i.titulo}" em ${i.status === 'ABERTO' ? 'aberto' : 'investigação'}`,
          referenciaId: i.id
        });
      }
    }

    // CHECKLIST_REVISAO: itens com proximaRevisao vencida ou proxima
    if (modulos.includes('checklist')) {
      const revisoes = await prisma.respostaChecklist.findMany({
        where: {
          organizacaoId: orgId,
          proximaRevisao: { not: null, lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        },
        include: { item: { select: { codigo: true, titulo: true } } }
      });
      for (const r of revisoes) {
        const dias = Math.ceil((r.proximaRevisao - new Date()) / (1000 * 60 * 60 * 24));
        alertasGerados.push({
          tipo: 'CHECKLIST_REVISAO',
          criticidade: dias < 0 ? 'ALTA' : 'MEDIA',
          mensagem: dias < 0
            ? `Item ${r.item.codigo} precisa de revisão (vencido há ${Math.abs(dias)} dia(s))`
            : `Item ${r.item.codigo} precisa de revisão em ${dias} dia(s)`,
          referenciaId: r.id
        });
      }
    }

    // ROPA_DESATUALIZADO: tratamentos sem atualizacao ha mais de 365 dias
    if (modulos.includes('ropa')) {
      const umAno = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const tratamentosAntigos = await prisma.tratamento.findMany({
        where: {
          organizacaoId: orgId,
          ativo: true,
          atualizadoEm: { lt: umAno }
        },
        select: { id: true, nome: true }
      });
      for (const t of tratamentosAntigos) {
        alertasGerados.push({
          tipo: 'ROPA_DESATUALIZADO',
          criticidade: 'MEDIA',
          mensagem: `Tratamento "${t.nome}" não é atualizado há mais de 1 ano`,
          referenciaId: t.id
        });
      }
    }

    // Persiste alertas novos (idempotente — nao duplica)
    const existentes = await prisma.alertaConformidade.findMany({
      where: { organizacaoId: orgId, lido: false },
      select: { tipo: true, referenciaId: true }
    });
    const chaveExistente = new Set(existentes.map(e => `${e.tipo}:${e.referenciaId}`));

    for (const a of alertasGerados) {
      if (chaveExistente.has(`${a.tipo}:${a.referenciaId}`)) continue;
      await prisma.alertaConformidade.create({
        data: { ...a, organizacaoId: orgId }
      });
    }

    // Retorna lista final (ordenada por criticidade e data)
    const todos = await prisma.alertaConformidade.findMany({
      where: { organizacaoId: orgId },
      orderBy: [{ lido: 'asc' }, { criadoEm: 'desc' }],
      take: 100
    });

    const naoLidos = todos.filter(a => !a.lido).length;
    res.json({ alertas: todos, naoLidos });
  } catch (err) {
    console.error('[GET /conformidade/alertas]', err);
    res.status(500).json({ erro: 'Erro ao carregar alertas' });
  }
});

// PATCH /conformidade/alertas/:id/ler — marca alerta como lido
router.patch('/alertas/:id/ler', async (req, res) => {
  try {
    const existente = await prisma.alertaConformidade.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Alerta não encontrado' });

    const atualizado = await prisma.alertaConformidade.update({
      where: { id: req.params.id },
      data: { lido: true }
    });
    res.json(atualizado);
  } catch (err) {
    console.error('[PATCH /conformidade/alertas/:id/ler]', err);
    res.status(500).json({ erro: 'Erro ao marcar como lido' });
  }
});

module.exports = router;
