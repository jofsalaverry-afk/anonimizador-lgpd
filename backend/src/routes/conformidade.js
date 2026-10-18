const express = require('express');
const crypto = require('crypto');
const { authUsuario } = require('../middlewares/authUsuario');
const { registrarHistorico } = require('../services/historico');
const { responsavelValido } = require('../services/entidades');
const { calcularRetencao, ultimosDescartes } = require('../services/retencao');
const { responderExport } = require('../services/exportadores');
const { prazoComunicacao } = require('../services/incidentes');
const { dataPura, fmtData } = require('../services/datas');
const { codigosExibicao } = require('../services/checklistCodigos');
const { erroLinkEvidencia } = require('../services/textoSeguro');

// Itens visiveis para a organizacao: catalogo global (organizacaoId null)
// + atividades proprias dela. Atividade de outra org nunca aparece.
const itensDaOrg = (organizacaoId) => ({ OR: [{ organizacaoId: null }, { organizacaoId }] });
const CRITICIDADES = ['ALTA', 'MEDIA', 'BAIXA'];
const CATEGORIA_PROPRIA = 'Atividades próprias';

const router = express.Router();
const { prisma } = require('../db');

// ---------- Middlewares ----------

// Auth compartilhado: rejeita tokens intermediarios de MFA (mfaPending/mfaSetup).
const authMiddleware = authUsuario;

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
      where: itensDaOrg(req.usuario.organizacaoId),
      include: { responsavel: { select: { id: true, nome: true } } },
      orderBy: { codigo: 'asc' }
    });
    const respostas = await prisma.respostaChecklist.findMany({
      where: { organizacaoId: req.usuario.organizacaoId },
      include: { responsavel: { select: { id: true, nome: true } } }
    });
    const respostaPorItem = Object.fromEntries(respostas.map(r => [r.itemId, r]));
    // Catalogo pelo codigo; atividades proprias depois, como AP-001, AP-002...
    const resultado = codigosExibicao(itens)
      .map(it => ({ ...it, resposta: respostaPorItem[it.id] || null }))
      .sort((a, b) => (!!a.organizacaoId - !!b.organizacaoId) || a.codigoExibicao.localeCompare(b.codigoExibicao));
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
    let { responsavelId } = req.body;
    const STATUS_VALIDOS = ['CONFORME', 'PARCIAL', 'NAO_CONFORME', 'NAO_APLICAVEL'];
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: 'status inválido' });
    }
    // Etapa 7a: evidencia so com http/https (ou referencia em texto)
    const erroLink = erroLinkEvidencia(evidenciaUrl);
    if (erroLink) return res.status(400).json({ erro: erroLink });

    const item = await prisma.itemChecklist.findFirst({
      where: { id: req.params.itemId, ...itensDaOrg(req.usuario.organizacaoId) }
    });
    if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
    // Atividade propria tem UM responsavel (o da atividade, editado em
    // "Editar atividade"); a resposta herda dele. Item do catalogo: o
    // responsavel e o da resposta.
    if (item.organizacaoId) responsavelId = item.responsavelId || '';
    if (responsavelId !== undefined && !(await responsavelValido(prisma, responsavelId, req.usuario.organizacaoId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }
    const revisao = dataPura(proximaRevisao);
    if (revisao === undefined) return res.status(400).json({ erro: 'Próxima revisão inválida (use AAAA-MM-DD)' });

    const chave = {
      organizacaoId_itemId: {
        organizacaoId: req.usuario.organizacaoId,
        itemId: req.params.itemId
      }
    };
    const anterior = await prisma.respostaChecklist.findUnique({ where: chave });

    // Hash de integridade da evidencia (se houver URL ou observacao)
    const conteudoHash = (evidenciaUrl || '') + (observacao || '') + new Date().toISOString();
    const evidenciaHash = evidenciaUrl || observacao
      ? crypto.createHash('sha256').update(conteudoHash).digest('hex')
      : null;

    const resposta = await prisma.$transaction(async (tx) => {
      const salva = await tx.respostaChecklist.upsert({
        where: chave,
        create: {
          organizacaoId: req.usuario.organizacaoId,
          itemId: req.params.itemId,
          status, observacao: observacao || null,
          evidenciaUrl: evidenciaUrl || null,
          evidenciaHash,
          validadoPor: req.usuario.id,
          responsavelId: responsavelId || null,
          proximaRevisao: revisao
        },
        update: {
          status,
          observacao: observacao || null,
          evidenciaUrl: evidenciaUrl || null,
          evidenciaHash,
          validadoPor: req.usuario.id,
          ...(responsavelId !== undefined && { responsavelId: responsavelId || null }),
          ...(revisao && { proximaRevisao: revisao })
        },
        include: { responsavel: { select: { id: true, nome: true } } }
      });
      // registroId = id do item do catalogo (unico por org via organizacaoId)
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'CHECKLIST_ITEM', registroId: req.params.itemId,
        acao: anterior ? 'EDITAR' : 'CRIAR', usuarioId: req.usuario.id,
        antes: anterior, depois: salva
      });
      return salva;
    });

    res.json(resposta);
  } catch (err) {
    console.error('[POST /conformidade/checklist/:itemId/responder]', err);
    res.status(500).json({ erro: 'Erro ao salvar resposta' });
  }
});

// GET /conformidade/checklist/export?formato=csv|json (catalogo + atividades proprias)
router.get('/checklist/export', requireChecklistModulo, async (req, res) => {
  try {
    await responderExport(res, prisma, 'checklist', req.usuario.organizacaoId, req.query.formato);
  } catch (err) {
    console.error('[GET /conformidade/checklist/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar checklist' });
  }
});

// ==================== Atividades proprias (Etapa 3 PoC) ====================
// A organizacao cadastra atividades alem do catalogo global. Ficam em
// ItemChecklist com organizacaoId preenchido; respondem pelo mesmo fluxo
// (/checklist/:itemId/responder) e aceitam <Anexos> como evidencia.

async function lerAtividade(b, orgId, { parcial }) {
  const data = {};
  if (!parcial || b.titulo !== undefined) {
    const t = typeof b.titulo === 'string' ? b.titulo.trim() : '';
    if (!t) return { erro: 'Título é obrigatório' };
    data.titulo = t.slice(0, 200);
  }
  if (!parcial || b.descricao !== undefined) data.descricao = typeof b.descricao === 'string' ? b.descricao.trim().slice(0, 2000) : '';
  if (b.criticidade !== undefined) {
    if (!CRITICIDADES.includes(b.criticidade)) return { erro: 'Criticidade inválida' };
    data.criticidade = b.criticidade;
  }
  if (b.prazo !== undefined) {
    const prazo = dataPura(b.prazo);
    if (prazo === undefined) return { erro: 'Prazo inválido (use AAAA-MM-DD)' };
    data.prazo = prazo;
  }
  if (b.responsavelId !== undefined) {
    if (!(await responsavelValido(prisma, b.responsavelId, orgId))) return { erro: 'Responsável inválido' };
    data.responsavelId = b.responsavelId || null;
  }
  return { data };
}

// POST /conformidade/atividades { titulo, descricao, responsavelId, prazo, criticidade }
router.post('/atividades', requireChecklistModulo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para cadastrar atividades' });
    }
    const orgId = req.usuario.organizacaoId;
    const lido = await lerAtividade(req.body || {}, orgId, { parcial: false });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const qtd = await prisma.itemChecklist.count({ where: { organizacaoId: orgId } });
    const item = await prisma.$transaction(async (tx) => {
      const criado = await tx.itemChecklist.create({
        data: {
          ...lido.data,
          organizacaoId: orgId,
          // codigo e unico global: prefixo da org + sequencial + sufixo aleatorio
          codigo: `ORG-${orgId.slice(-5).toUpperCase()}-${String(qtd + 1).padStart(3, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
          categoria: CATEGORIA_PROPRIA,
          fundamentoLegal: '',
          obrigatorio: false,
          criticidade: lido.data.criticidade || 'MEDIA',
          evidenciaRequerida: 'DOCUMENTO'
        },
        include: { responsavel: { select: { id: true, nome: true } } }
      });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'CHECKLIST_ITEM', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null,
        depois: { titulo: criado.titulo, descricao: criado.descricao, responsavelId: criado.responsavelId, prazo: criado.prazo, criticidade: criado.criticidade }
      });
      return criado;
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('[POST /conformidade/atividades]', err);
    res.status(500).json({ erro: 'Erro ao cadastrar atividade' });
  }
});

// PUT /conformidade/atividades/:id — so atividades da propria org (nao o catalogo global)
router.put('/atividades/:id', requireChecklistModulo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para editar atividades' });
    }
    const orgId = req.usuario.organizacaoId;
    const existente = await prisma.itemChecklist.findFirst({ where: { id: req.params.id, organizacaoId: orgId } });
    if (!existente) return res.status(404).json({ erro: 'Atividade não encontrada' });
    const lido = await lerAtividade(req.body || {}, orgId, { parcial: true });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const item = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.itemChecklist.update({
        where: { id: existente.id }, data: lido.data,
        include: { responsavel: { select: { id: true, nome: true } } }
      });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'CHECKLIST_ITEM', registroId: existente.id,
        acao: 'EDITAR', usuarioId: req.usuario.id, antes: existente, depois: atualizado
      });
      return atualizado;
    });
    res.json(item);
  } catch (err) {
    console.error('[PUT /conformidade/atividades/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar atividade' });
  }
});

// GET /conformidade/score — percentual de conformidade da organizacao
router.get('/score', requireChecklistModulo, async (req, res) => {
  try {
    const itens = await prisma.itemChecklist.findMany({ where: itensDaOrg(req.usuario.organizacaoId) });
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
      // "X de Y itens respondidos"
      respondidos: itens.length - porStatus.SEM_RESPOSTA,
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

    // INCIDENTE_COMUNICACAO: 3 dias uteis da ciencia (Res. CD/ANPD 15/2024).
    // Um alerta por etapa (vespera, dia, vencido): referenciaId = id:ETAPA.
    if (modulos.includes('repositorio')) {
      const reais = await prisma.incidente.findMany({
        where: { organizacaoId: orgId, tipoRegistro: 'REAL', riscoRelevante: 'SIM', dataCiencia: { not: null } },
        select: { id: true, titulo: true, tipoRegistro: true, riscoRelevante: true, dataCiencia: true, dataComunicacaoANPD: true, dataComunicacaoTitulares: true }
      });
      const vigentes = [];
      for (const i of reais) {
        const p = prazoComunicacao(i);
        if (!p || !['VESPERA', 'HOJE', 'VENCIDO'].includes(p.situacao)) continue;
        const quando = fmtData(p.prazo);
        const texto = { VESPERA: `vence no próximo dia útil (${quando})`, HOJE: `vence hoje (${quando})`, VENCIDO: `venceu em ${quando}` }[p.situacao];
        const referenciaId = `${i.id}:${p.situacao}`;
        vigentes.push(referenciaId);
        alertasGerados.push({
          tipo: 'INCIDENTE_COMUNICACAO',
          criticidade: 'ALTA',
          mensagem: `Incidente "${i.titulo}": comunicação à ANPD e aos titulares ${texto}`,
          referenciaId
        });
      }
      // Comunicado (ou fora do caso): alertas antigos deixam de valer
      await prisma.alertaConformidade.updateMany({
        where: { organizacaoId: orgId, tipo: 'INCIDENTE_COMUNICACAO', lido: false, referenciaId: { notIn: vigentes } },
        data: { lido: true }
      });
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

    // CHECKLIST_REVISAO tambem para atividades proprias com prazo vencido
    // ou nos proximos 7 dias e ainda nao concluidas (CONFORME/NAO_APLICAVEL).
    if (modulos.includes('checklist')) {
      const proprias = await prisma.itemChecklist.findMany({
        where: { organizacaoId: orgId, prazo: { not: null, lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
        select: { id: true, codigo: true, titulo: true, prazo: true }
      });
      const resps = proprias.length === 0 ? [] : await prisma.respostaChecklist.findMany({
        where: { organizacaoId: orgId, itemId: { in: proprias.map(p => p.id) } }, select: { itemId: true, status: true }
      });
      const statusPorItem = Object.fromEntries(resps.map(r => [r.itemId, r.status]));
      for (const it of proprias) {
        if (['CONFORME', 'NAO_APLICAVEL'].includes(statusPorItem[it.id])) continue;
        const dias = Math.ceil((it.prazo - new Date()) / (1000 * 60 * 60 * 24));
        alertasGerados.push({
          tipo: 'CHECKLIST_REVISAO',
          criticidade: dias < 0 ? 'ALTA' : 'MEDIA',
          mensagem: dias < 0
            ? `Atividade "${it.titulo}" com prazo vencido há ${Math.abs(dias)} dia(s)`
            : `Atividade "${it.titulo}" vence em ${dias} dia(s)`,
          referenciaId: it.id
        });
      }
    }

    // RETENCAO_VENCIDA: prazo de retencao do tratamento venceu, contado
    // da criacao ou do ultimo descarte registrado (services/retencao.js).
    const retencaoVencidaIds = new Set();
    if (modulos.includes('ropa')) {
      const comRetencao = await prisma.tratamento.findMany({
        where: { organizacaoId: orgId, ativo: true, retencaoDias: { not: null } },
        select: { id: true, nome: true, retencaoDias: true, criadoEm: true }
      });
      const ultimos = await ultimosDescartes(prisma, comRetencao.map(t => t.id), orgId);
      for (const t of comRetencao) {
        const r = calcularRetencao(t, ultimos[t.id]);
        if (!r || !r.vencido) continue;
        retencaoVencidaIds.add(t.id);
        alertasGerados.push({
          tipo: 'RETENCAO_VENCIDA',
          criticidade: 'ALTA',
          mensagem: `Prazo de retenção do tratamento "${t.nome}" venceu em ${fmtData(r.venceEm)} — registre o descarte`,
          referenciaId: t.id
        });
      }
      // Descarte registrado depois do alerta: o alerta deixa de valer.
      await prisma.alertaConformidade.updateMany({
        where: { organizacaoId: orgId, tipo: 'RETENCAO_VENCIDA', lido: false, referenciaId: { notIn: [...retencaoVencidaIds] } },
        data: { lido: true }
      });
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
