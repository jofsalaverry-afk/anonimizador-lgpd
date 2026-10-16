const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { registrarHistorico } = require('../services/historico');
const { responsavelValido, idsDaOrganizacao } = require('../services/entidades');
const { calcularRetencao } = require('../services/retencao');

const router = express.Router();
const prisma = new PrismaClient();

// ---------- Middlewares ----------

// Auth compartilhado: rejeita tokens intermediarios de MFA (mfaPending/mfaSetup).
const authMiddleware = authUsuario;

const requireModulo = async (req, res, next) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { modulosAtivos: true }
    });
    if (!org || !org.modulosAtivos.includes('ropa')) {
      return res.status(403).json({ erro: 'Módulo "ropa" não está ativo para sua organização.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar módulos' });
  }
};

// Todas as rotas deste router exigem auth + modulo ropa
router.use(authMiddleware, requireModulo);

// ---------- Helpers ----------

// Grava snapshot do estado atual do tratamento no historico.
// Exige organizacaoId como argumento e usa findFirst escopado para
// defesa em profundidade: se algum caller futuro esquecer de verificar
// ownership antes de chamar este helper, o findFirst ainda protege
// contra IDOR retornando undefined silenciosamente.
async function gravarHistorico(tratamentoId, organizacaoId, alteradoPor) {
  const tratamento = await prisma.tratamento.findFirst({
    where: { id: tratamentoId, organizacaoId },
    include: { compartilhamentos: true }
  });
  if (!tratamento) return;
  await prisma.tratamentoHistorico.create({
    data: { tratamentoId, snapshot: tratamento, alteradoPor }
  });
}

// Select padrao para retornar tratamento com compartilhamentos, setor e
// sistemas do inventario.
const TRATAMENTO_INCLUDE = {
  compartilhamentos: { include: { terceiro: { select: { id: true, razaoSocial: true, risco: true } } } },
  setor: { select: { id: true, nome: true } },
  sistemas: { include: { sistema: { select: { id: true, nome: true, tipo: true } } } },
  _count: { select: { historico: true } }
};

// Forma do tratamento para o diff do HistoricoRegistro: compartilhamentos,
// setor e sistemas viram texto legivel (ids de relacao nao dizem nada na tela).
function paraHistorico(t) {
  if (!t) return null;
  const { compartilhamentos, setor, setorId, sistemas, ...resto } = t;
  return {
    ...resto,
    setor: setor?.nome || null,
    sistemas: (sistemas || []).map(v => v.sistema?.nome).filter(Boolean).sort(),
    compartilhamentos: (compartilhamentos || []).map(c =>
      `${c.terceiroNome}${c.terceiroCNPJ ? ` (${c.terceiroCNPJ})` : ''} — ${c.finalidadeCompartilhamento} — ${c.paisDestino}`
    )
  };
}

// Valida setor, sistemas e terceiros (todos da mesma organizacao) e monta
// os compartilhamentos. Compartilhamento com terceiroId herda nome/CNPJ
// do cadastro quando vierem vazios; os antigos (so nome/CNPJ) seguem iguais.
async function validarVinculos(body, organizacaoId) {
  const { setorId, sistemaIds, compartilhamentos } = body;
  if (setorId && !(await idsDaOrganizacao(prisma.setor, setorId, organizacaoId))) return { erro: 'Setor inválido' };
  if (sistemaIds !== undefined) {
    if (!Array.isArray(sistemaIds)) return { erro: 'sistemaIds deve ser uma lista' };
    if (!(await idsDaOrganizacao(prisma.sistemaInventario, sistemaIds, organizacaoId))) return { erro: 'Sistema inválido' };
  }
  let comps;
  if (Array.isArray(compartilhamentos)) {
    const ids = compartilhamentos.map(c => c.terceiroId).filter(Boolean);
    const terceiros = ids.length === 0 ? [] : await prisma.terceiro.findMany({
      where: { id: { in: ids }, organizacaoId }, select: { id: true, razaoSocial: true, cnpj: true }
    });
    const porId = Object.fromEntries(terceiros.map(t => [t.id, t]));
    comps = [];
    for (const c of compartilhamentos) {
      const t = c.terceiroId ? porId[c.terceiroId] : null;
      if (c.terceiroId && !t) return { erro: 'Terceiro inválido no compartilhamento' };
      const terceiroNome = (c.terceiroNome || '').trim() || t?.razaoSocial || '';
      if (!terceiroNome) return { erro: 'Informe o nome do terceiro no compartilhamento' };
      comps.push({
        terceiroNome,
        terceiroCNPJ: c.terceiroCNPJ || t?.cnpj || null,
        finalidadeCompartilhamento: c.finalidadeCompartilhamento,
        paisDestino: c.paisDestino || 'Brasil',
        baseLegalTransferencia: c.baseLegalTransferencia || null,
        terceiroId: t ? t.id : null
      });
    }
  }
  const sistemas = Array.isArray(sistemaIds) ? [...new Set(sistemaIds.filter(Boolean))] : undefined;
  return { compartilhamentos: comps, sistemaIds: sistemas };
}

// Tratamento.responsavelId nao tem FK (coluna legada); resolve o nome
// por lookup escopado na organizacao.
async function comNomeResponsavel(tratamentos, organizacaoId) {
  const ids = [...new Set(tratamentos.map(t => t.responsavelId).filter(Boolean))];
  const usuarios = ids.length === 0 ? [] : await prisma.usuario.findMany({
    where: { id: { in: ids }, organizacaoId },
    select: { id: true, nome: true }
  });
  const nomes = Object.fromEntries(usuarios.map(u => [u.id, u.nome]));
  return tratamentos.map(t => ({ ...t, responsavelNome: nomes[t.responsavelId] || null }));
}

// ---------- Rotas ----------

// GET /ropa/tratamentos — lista tratamentos da organizacao
router.get('/tratamentos', async (req, res) => {
  try {
    const tratamentos = await prisma.tratamento.findMany({
      where: { organizacaoId: req.usuario.organizacaoId },
      include: TRATAMENTO_INCLUDE,
      orderBy: { criadoEm: 'desc' }
    });
    res.json(await comNomeResponsavel(tratamentos, req.usuario.organizacaoId));
  } catch (err) {
    console.error('[GET /ropa/tratamentos]', err);
    res.status(500).json({ erro: 'Erro ao listar tratamentos' });
  }
});

// POST /ropa/tratamentos — cria novo tratamento + compartilhamentos
router.post('/tratamentos', async (req, res) => {
  try {
    // Apenas GESTOR, ENCARREGADO_LGPD e OPERADOR podem criar
    if (req.usuario.perfil === 'AUDITOR' || req.usuario.perfil === 'TREINANDO') {
      return res.status(403).json({ erro: 'Sem permissão para criar tratamentos' });
    }

    const {
      nome, finalidade, baseLegal, categoriasDados, categoriasTitulares,
      retencaoDias, formaDescarte, responsavelId, medidasSeguranca,
      setorId, outrosMeios
    } = req.body;

    if (!nome || !finalidade || !baseLegal) {
      return res.status(400).json({ erro: 'nome, finalidade e baseLegal são obrigatórios' });
    }
    if (!(await responsavelValido(prisma, responsavelId, req.usuario.organizacaoId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }
    const vinc = await validarVinculos(req.body, req.usuario.organizacaoId);
    if (vinc.erro) return res.status(400).json({ erro: vinc.erro });

    const tratamento = await prisma.$transaction(async (tx) => {
      const criado = await tx.tratamento.create({
        data: {
          organizacaoId: req.usuario.organizacaoId,
          nome, finalidade, baseLegal,
          categoriasDados: categoriasDados || [],
          categoriasTitulares: categoriasTitulares || [],
          retencaoDias: retencaoDias || null,
          formaDescarte: formaDescarte || null,
          responsavelId: responsavelId || null,
          medidasSeguranca: medidasSeguranca || null,
          setorId: setorId || null,
          outrosMeios: outrosMeios || null,
          compartilhamentos: { create: vinc.compartilhamentos || [] },
          sistemas: { create: (vinc.sistemaIds || []).map(sistemaId => ({ sistemaId })) }
        },
        include: TRATAMENTO_INCLUDE
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'TRATAMENTO', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null, depois: paraHistorico(criado)
      });
      return criado;
    });

    // Registra snapshot inicial no historico legado (TratamentoHistorico)
    await gravarHistorico(tratamento.id, req.usuario.organizacaoId, req.usuario.id);

    res.status(201).json(tratamento);
  } catch (err) {
    console.error('[POST /ropa/tratamentos]', err);
    res.status(500).json({ erro: 'Erro ao criar tratamento' });
  }
});

// PUT /ropa/tratamentos/:id — atualiza tratamento (grava historico antes)
router.put('/tratamentos/:id', async (req, res) => {
  try {
    if (req.usuario.perfil === 'AUDITOR' || req.usuario.perfil === 'TREINANDO') {
      return res.status(403).json({ erro: 'Sem permissão para editar tratamentos' });
    }

    const existente = await prisma.tratamento.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId },
      include: TRATAMENTO_INCLUDE
    });
    if (!existente) return res.status(404).json({ erro: 'Tratamento não encontrado' });

    const {
      nome, finalidade, baseLegal, categoriasDados, categoriasTitulares,
      retencaoDias, formaDescarte, responsavelId, medidasSeguranca, ativo,
      setorId, outrosMeios
    } = req.body;

    if (responsavelId !== undefined && !(await responsavelValido(prisma, responsavelId, req.usuario.organizacaoId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }
    const vinc = await validarVinculos(req.body, req.usuario.organizacaoId);
    if (vinc.erro) return res.status(400).json({ erro: vinc.erro });

    // Grava snapshot do estado ANTES da alteracao
    await gravarHistorico(req.params.id, req.usuario.organizacaoId, req.usuario.id);

    const tratamento = await prisma.$transaction(async (tx) => {
      // Atualiza compartilhamentos: deleta todos e recria (simples e correto)
      if (vinc.compartilhamentos) {
        await tx.compartilhamentoTratamento.deleteMany({ where: { tratamentoId: req.params.id } });
      }
      if (vinc.sistemaIds) {
        await tx.tratamentoSistema.deleteMany({ where: { tratamentoId: req.params.id } });
      }

      const atualizado = await tx.tratamento.update({
        where: { id: req.params.id },
        data: {
          ...(nome !== undefined && { nome }),
          ...(finalidade !== undefined && { finalidade }),
          ...(baseLegal !== undefined && { baseLegal }),
          ...(categoriasDados !== undefined && { categoriasDados }),
          ...(categoriasTitulares !== undefined && { categoriasTitulares }),
          ...(retencaoDias !== undefined && { retencaoDias }),
          ...(formaDescarte !== undefined && { formaDescarte }),
          ...(responsavelId !== undefined && { responsavelId: responsavelId || null }),
          ...(medidasSeguranca !== undefined && { medidasSeguranca }),
          ...(ativo !== undefined && { ativo }),
          ...(setorId !== undefined && { setorId: setorId || null }),
          ...(outrosMeios !== undefined && { outrosMeios: outrosMeios || null }),
          ...(vinc.compartilhamentos && { compartilhamentos: { create: vinc.compartilhamentos } }),
          ...(vinc.sistemaIds && { sistemas: { create: vinc.sistemaIds.map(sistemaId => ({ sistemaId })) } })
        },
        include: TRATAMENTO_INCLUDE
      });

      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'TRATAMENTO', registroId: req.params.id,
        acao: 'EDITAR', usuarioId: req.usuario.id,
        antes: paraHistorico(existente), depois: paraHistorico(atualizado)
      });
      return atualizado;
    });

    res.json(tratamento);
  } catch (err) {
    console.error('[PUT /ropa/tratamentos/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar tratamento' });
  }
});

// DELETE /ropa/tratamentos/:id — soft delete (ativo=false) + historico
router.delete('/tratamentos/:id', async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem excluir tratamentos' });
    }

    const existente = await prisma.tratamento.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Tratamento não encontrado' });

    await gravarHistorico(req.params.id, req.usuario.organizacaoId, req.usuario.id);

    await prisma.$transaction(async (tx) => {
      await tx.tratamento.update({
        where: { id: req.params.id },
        data: { ativo: false }
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'TRATAMENTO', registroId: req.params.id,
        acao: 'EXCLUIR', usuarioId: req.usuario.id,
        diff: { ativo: { antes: existente.ativo, depois: false } }
      });
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /ropa/tratamentos/:id]', err);
    res.status(500).json({ erro: 'Erro ao excluir tratamento' });
  }
});

// ==================== Descarte (Etapa 3 PoC) ====================

const DESCARTE_INCLUDE = { responsavel: { select: { id: true, nome: true } } };

function resumoDescarte(d) {
  const data = new Date(d.dataDescarte).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  return `${data} — ${d.metodo}${d.quantidade != null ? ` — ${d.quantidade} registro(s)` : ''} — ${d.descricao}`;
}

// GET /ropa/tratamentos/:id/descartes — lista + situacao do prazo de retencao
router.get('/tratamentos/:id/descartes', async (req, res) => {
  try {
    const orgId = req.usuario.organizacaoId;
    const t = await prisma.tratamento.findFirst({ where: { id: req.params.id, organizacaoId: orgId } });
    if (!t) return res.status(404).json({ erro: 'Tratamento não encontrado' });
    const descartes = await prisma.registroDescarte.findMany({
      where: { tratamentoId: t.id, organizacaoId: orgId }, include: DESCARTE_INCLUDE, orderBy: { dataDescarte: 'desc' }
    });
    res.json({ descartes, retencao: calcularRetencao(t, descartes[0]) });
  } catch (err) {
    console.error('[GET /ropa/tratamentos/:id/descartes]', err);
    res.status(500).json({ erro: 'Erro ao listar descartes' });
  }
});

// POST /ropa/tratamentos/:id/descartes { dataDescarte, descricao, quantidade, metodo, responsavelId }
router.post('/tratamentos/:id/descartes', async (req, res) => {
  try {
    if (req.usuario.perfil === 'AUDITOR' || req.usuario.perfil === 'TREINANDO') {
      return res.status(403).json({ erro: 'Sem permissão para registrar descarte' });
    }
    const orgId = req.usuario.organizacaoId;
    const t = await prisma.tratamento.findFirst({ where: { id: req.params.id, organizacaoId: orgId } });
    if (!t) return res.status(404).json({ erro: 'Tratamento não encontrado' });

    const { dataDescarte, descricao, quantidade, metodo, responsavelId } = req.body || {};
    const data = new Date(dataDescarte);
    if (!dataDescarte || isNaN(data)) return res.status(400).json({ erro: 'Data do descarte inválida' });
    if (data.getTime() > Date.now() + 24 * 60 * 60 * 1000) return res.status(400).json({ erro: 'Data do descarte não pode ser futura' });
    const desc = typeof descricao === 'string' ? descricao.trim() : '';
    const met = typeof metodo === 'string' ? metodo.trim() : '';
    if (!desc || !met) return res.status(400).json({ erro: 'Descrição e método são obrigatórios' });
    let qtd = null;
    if (quantidade !== undefined && quantidade !== null && quantidade !== '') {
      qtd = Number(quantidade);
      if (!Number.isInteger(qtd) || qtd < 0) return res.status(400).json({ erro: 'Quantidade inválida' });
    }
    if (!(await responsavelValido(prisma, responsavelId, orgId))) return res.status(400).json({ erro: 'Responsável inválido' });

    const descarte = await prisma.$transaction(async (tx) => {
      const criado = await tx.registroDescarte.create({
        data: {
          organizacaoId: orgId, tratamentoId: t.id, dataDescarte: data, descricao: desc.slice(0, 2000),
          quantidade: qtd, metodo: met.slice(0, 200), responsavelId: responsavelId || null, criadoPorId: req.usuario.id
        },
        include: DESCARTE_INCLUDE
      });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'DESCARTE', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null,
        depois: {
          tratamento: t.nome, dataDescarte: criado.dataDescarte, descricao: criado.descricao,
          quantidade: criado.quantidade, metodo: criado.metodo, responsavelId: criado.responsavelId
        }
      });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'TRATAMENTO', registroId: t.id, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { descarte: { antes: null, depois: resumoDescarte(criado) } }
      });
      return criado;
    });
    res.status(201).json(descarte);
  } catch (err) {
    console.error('[POST /ropa/tratamentos/:id/descartes]', err);
    res.status(500).json({ erro: 'Erro ao registrar descarte' });
  }
});

// GET /ropa/tratamentos/:id/historico — versoes anteriores
router.get('/tratamentos/:id/historico', async (req, res) => {
  try {
    const existente = await prisma.tratamento.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Tratamento não encontrado' });

    const historico = await prisma.tratamentoHistorico.findMany({
      where: { tratamentoId: req.params.id },
      orderBy: { criadoEm: 'desc' }
    });
    res.json(historico);
  } catch (err) {
    console.error('[GET /ropa/tratamentos/:id/historico]', err);
    res.status(500).json({ erro: 'Erro ao buscar histórico' });
  }
});

// GET /ropa/export?formato=csv|json — exporta todos os tratamentos
router.get('/export', async (req, res) => {
  try {
    const formato = req.query.formato || 'json';
    const tratamentos = await comNomeResponsavel(await prisma.tratamento.findMany({
      where: { organizacaoId: req.usuario.organizacaoId },
      include: TRATAMENTO_INCLUDE
    }), req.usuario.organizacaoId);

    if (formato === 'csv') {
      // Colunas novas entram no fim para nao deslocar planilhas existentes
      const header = 'nome,finalidade,baseLegal,categoriasDados,categoriasTitulares,retencaoDias,formaDescarte,medidasSeguranca,ativo,criadoEm,compartilhamentos,responsavel,setor,sistemas,outrosMeios';
      const q = v => `"${String(v || '').replace(/"/g, '""')}"`;
      const rows = tratamentos.map(t => {
        const comp = t.compartilhamentos.map(c => `${c.terceiroNome}(${c.paisDestino})`).join('; ');
        return [
          `"${(t.nome || '').replace(/"/g, '""')}"`,
          `"${(t.finalidade || '').replace(/"/g, '""')}"`,
          t.baseLegal,
          `"${(t.categoriasDados || []).join('; ')}"`,
          `"${(t.categoriasTitulares || []).join('; ')}"`,
          t.retencaoDias || '',
          `"${(t.formaDescarte || '').replace(/"/g, '""')}"`,
          `"${(t.medidasSeguranca || '').replace(/"/g, '""')}"`,
          t.ativo,
          t.criadoEm.toISOString(),
          `"${comp}"`,
          `"${(t.responsavelNome || '').replace(/"/g, '""')}"`,
          q(t.setor?.nome),
          q((t.sistemas || []).map(v => v.sistema?.nome).filter(Boolean).join('; ')),
          q(t.outrosMeios)
        ].join(',');
      });
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=ropa-tratamentos.csv');
      return res.send('\uFEFF' + csv); // BOM para Excel abrir UTF-8 correto
    }

    // Default: JSON
    res.json(tratamentos);
  } catch (err) {
    console.error('[GET /ropa/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar tratamentos' });
  }
});

module.exports = router;
