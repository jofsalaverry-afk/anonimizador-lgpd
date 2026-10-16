const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { registrarHistorico } = require('../services/historico');
const { responsavelValido } = require('../services/entidades');

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

// Select padrao para retornar tratamento com compartilhamentos
const TRATAMENTO_INCLUDE = {
  compartilhamentos: true,
  _count: { select: { historico: true } }
};

// Forma do tratamento para o diff do HistoricoRegistro: compartilhamentos
// viram texto legivel (os ids mudam a cada edicao, pois sao recriados).
function paraHistorico(t) {
  if (!t) return null;
  const { compartilhamentos, ...resto } = t;
  return {
    ...resto,
    compartilhamentos: (compartilhamentos || []).map(c =>
      `${c.terceiroNome}${c.terceiroCNPJ ? ` (${c.terceiroCNPJ})` : ''} — ${c.finalidadeCompartilhamento} — ${c.paisDestino}`
    )
  };
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
      compartilhamentos
    } = req.body;

    if (!nome || !finalidade || !baseLegal) {
      return res.status(400).json({ erro: 'nome, finalidade e baseLegal são obrigatórios' });
    }
    if (!(await responsavelValido(prisma, responsavelId, req.usuario.organizacaoId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }

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
          compartilhamentos: {
            create: (compartilhamentos || []).map(c => ({
              terceiroNome: c.terceiroNome,
              terceiroCNPJ: c.terceiroCNPJ || null,
              finalidadeCompartilhamento: c.finalidadeCompartilhamento,
              paisDestino: c.paisDestino || 'Brasil',
              baseLegalTransferencia: c.baseLegalTransferencia || null
            }))
          }
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
      include: { compartilhamentos: true }
    });
    if (!existente) return res.status(404).json({ erro: 'Tratamento não encontrado' });

    const {
      nome, finalidade, baseLegal, categoriasDados, categoriasTitulares,
      retencaoDias, formaDescarte, responsavelId, medidasSeguranca, ativo,
      compartilhamentos
    } = req.body;

    if (responsavelId !== undefined && !(await responsavelValido(prisma, responsavelId, req.usuario.organizacaoId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }

    // Grava snapshot do estado ANTES da alteracao
    await gravarHistorico(req.params.id, req.usuario.organizacaoId, req.usuario.id);

    const tratamento = await prisma.$transaction(async (tx) => {
      // Atualiza compartilhamentos: deleta todos e recria (simples e correto)
      if (Array.isArray(compartilhamentos)) {
        await tx.compartilhamentoTratamento.deleteMany({ where: { tratamentoId: req.params.id } });
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
          ...(Array.isArray(compartilhamentos) && {
            compartilhamentos: {
              create: compartilhamentos.map(c => ({
                terceiroNome: c.terceiroNome,
                terceiroCNPJ: c.terceiroCNPJ || null,
                finalidadeCompartilhamento: c.finalidadeCompartilhamento,
                paisDestino: c.paisDestino || 'Brasil',
                baseLegalTransferencia: c.baseLegalTransferencia || null
              }))
            }
          })
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
      include: { compartilhamentos: true }
    }), req.usuario.organizacaoId);

    if (formato === 'csv') {
      // "responsavel" entra no fim para nao deslocar colunas de planilhas existentes
      const header = 'nome,finalidade,baseLegal,categoriasDados,categoriasTitulares,retencaoDias,formaDescarte,medidasSeguranca,ativo,criadoEm,compartilhamentos,responsavel';
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
          `"${(t.responsavelNome || '').replace(/"/g, '""')}"`
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
