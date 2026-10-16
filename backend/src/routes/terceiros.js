const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { requireModulo, podeEscrever, ehGestorOuDpo } = require('../middlewares/requireModulo');
const { registrarHistorico } = require('../services/historico');
const { responsavelValido } = require('../services/entidades');
const { BLOCOS, PERGUNTAS, calcularRisco } = require('../services/questionarioTerceiro');
const { responderExport } = require('../services/exportadores');
const { dataPura } = require('../services/datas');

const router = express.Router();
const prisma = new PrismaClient();

const PAPEIS = ['OPERADOR', 'CONTROLADOR_CONJUNTO', 'SUBOPERADOR'];
const RISCOS = ['BAIXO', 'MEDIO', 'ALTO'];
const RESPOSTAS = ['SIM', 'PARCIAL', 'NAO', 'NA'];
const SITUACOES = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA'];
const SITUACAO_LABEL = { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída' };

router.use(authUsuario, requireModulo(prisma, 'terceiros'));

async function buscarDaOrg(id, organizacaoId) {
  return prisma.terceiro.findFirst({ where: { id, organizacaoId } });
}

// Recalcula o risco pelo questionario. Se o risco for manual, mantem o
// valor gravado e so devolve o calculado para exibicao.
async function recalcularRisco(db, terceiro) {
  const respostas = await db.respostaQuestionarioTerceiro.findMany({ where: { terceiroId: terceiro.id } });
  const avaliacao = calcularRisco(respostas, terceiro);
  if (!terceiro.riscoManual && avaliacao.risco !== terceiro.risco) {
    await db.terceiro.update({ where: { id: terceiro.id }, data: { risco: avaliacao.risco } });
  }
  return avaliacao;
}

function resumoAcao(a) {
  const prazo = a.prazo ? ` · prazo ${new Date(a.prazo).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : '';
  const resp = a.responsavel?.nome ? ` · ${a.responsavel.nome}` : '';
  return `${a.descricao} — ${SITUACAO_LABEL[a.situacao] || a.situacao}${prazo}${resp}`;
}

// Valida campos cadastrais. parcial=true no PUT.
function lerDados(b, { parcial }) {
  const data = {};
  if (!parcial || b.razaoSocial !== undefined) {
    const r = typeof b.razaoSocial === 'string' ? b.razaoSocial.trim() : '';
    if (!r) return { erro: 'Razão social é obrigatória' };
    data.razaoSocial = r.slice(0, 200);
  }
  if (b.papel !== undefined) {
    if (!PAPEIS.includes(b.papel)) return { erro: 'Papel inválido' };
    data.papel = b.papel;
  }
  if (b.contatoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contatoEmail)) return { erro: 'E-mail de contato inválido' };
  for (const campo of ['cnpj', 'contatoNome', 'contatoEmail', 'descricaoServico']) {
    if (b[campo] !== undefined) data[campo] = b[campo] ? String(b[campo]).trim() : null;
  }
  for (const campo of ['contratoVigente', 'contratoCritico', 'aditivoLgpdAssinado']) {
    if (b[campo] !== undefined) data[campo] = !!b[campo];
  }
  if (b.dataAditivo !== undefined) {
    const d = dataPura(b.dataAditivo);
    if (d === undefined) return { erro: 'Data do aditivo inválida (use AAAA-MM-DD)' };
    data.dataAditivo = d;
  }
  return { data };
}

// ---------- Leitura ----------

router.get('/questionario', (req, res) => {
  res.json({ blocos: BLOCOS });
});

// GET /terceiros?risco=ALTO|MEDIO|BAIXO|NAO_AVALIADO
router.get('/', async (req, res) => {
  try {
    const where = { organizacaoId: req.usuario.organizacaoId };
    if (RISCOS.includes(req.query.risco)) where.risco = req.query.risco;
    if (req.query.risco === 'NAO_AVALIADO') where.risco = null;
    const terceiros = await prisma.terceiro.findMany({ where, orderBy: { razaoSocial: 'asc' } });
    const ids = terceiros.map(t => t.id);
    const acoes = ids.length === 0 ? [] : await prisma.acaoTerceiro.findMany({
      where: { terceiroId: { in: ids }, situacao: { not: 'CONCLUIDA' } }, select: { terceiroId: true }
    });
    const pend = {};
    for (const a of acoes) pend[a.terceiroId] = (pend[a.terceiroId] || 0) + 1;
    res.json(terceiros.map(t => ({ ...t, acoesPendentes: pend[t.id] || 0 })));
  } catch (err) {
    console.error('[GET /terceiros]', err);
    res.status(500).json({ erro: 'Erro ao listar terceiros' });
  }
});

// GET /terceiros/export?formato=csv|json (com respostas e plano de acao)
router.get('/export', async (req, res) => {
  try {
    await responderExport(res, prisma, 'terceiros', req.usuario.organizacaoId, req.query.formato);
  } catch (err) {
    console.error('[GET /terceiros/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar terceiros' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const orgId = req.usuario.organizacaoId;
    const t = await buscarDaOrg(req.params.id, orgId);
    if (!t) return res.status(404).json({ erro: 'Terceiro não encontrado' });
    const [respostas, acoes, sistemas, compartilhamentos] = await Promise.all([
      prisma.respostaQuestionarioTerceiro.findMany({
        where: { terceiroId: t.id }, include: { respondidoPor: { select: { id: true, nome: true } } }
      }),
      prisma.acaoTerceiro.findMany({
        where: { terceiroId: t.id }, include: { responsavel: { select: { id: true, nome: true } } }, orderBy: { criadoEm: 'asc' }
      }),
      prisma.sistemaInventario.findMany({ where: { terceiroId: t.id, organizacaoId: orgId }, select: { id: true, nome: true, tipo: true, ativo: true } }),
      prisma.compartilhamentoTratamento.findMany({ where: { terceiroId: t.id }, select: { tratamentoId: true } })
    ]);
    const tratamentos = compartilhamentos.length === 0 ? [] : await prisma.tratamento.findMany({
      where: { id: { in: [...new Set(compartilhamentos.map(c => c.tratamentoId))] }, organizacaoId: orgId },
      select: { id: true, nome: true, ativo: true }
    });
    res.json({ ...t, respostas, acoes, sistemas, tratamentos, avaliacao: calcularRisco(respostas, t) });
  } catch (err) {
    console.error('[GET /terceiros/:id]', err);
    res.status(500).json({ erro: 'Erro ao buscar terceiro' });
  }
});

// ---------- Cadastro ----------

router.post('/', async (req, res) => {
  try {
    if (!podeEscrever(req)) return res.status(403).json({ erro: 'Sem permissão para cadastrar terceiros' });
    const lido = lerDados(req.body || {}, { parcial: false });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const terceiro = await prisma.$transaction(async (tx) => {
      const criado = await tx.terceiro.create({ data: { ...lido.data, organizacaoId: req.usuario.organizacaoId } });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'TERCEIRO', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null, depois: criado
      });
      return criado;
    });
    res.status(201).json(terceiro);
  } catch (err) {
    console.error('[POST /terceiros]', err);
    res.status(500).json({ erro: 'Erro ao cadastrar terceiro' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!podeEscrever(req)) return res.status(403).json({ erro: 'Sem permissão para editar terceiros' });
    const existente = await buscarDaOrg(req.params.id, req.usuario.organizacaoId);
    if (!existente) return res.status(404).json({ erro: 'Terceiro não encontrado' });
    const lido = lerDados(req.body || {}, { parcial: true });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const terceiro = await prisma.$transaction(async (tx) => {
      let atualizado = await tx.terceiro.update({ where: { id: existente.id }, data: lido.data });
      // contrato critico / aditivo entram na regra de risco
      await recalcularRisco(tx, atualizado);
      atualizado = await tx.terceiro.findFirst({ where: { id: existente.id } });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'TERCEIRO', registroId: existente.id,
        acao: 'EDITAR', usuarioId: req.usuario.id, antes: existente, depois: atualizado
      });
      return atualizado;
    });
    res.json(terceiro);
  } catch (err) {
    console.error('[PUT /terceiros/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar terceiro' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem desativar terceiros' });
    const existente = await buscarDaOrg(req.params.id, req.usuario.organizacaoId);
    if (!existente) return res.status(404).json({ erro: 'Terceiro não encontrado' });
    await prisma.$transaction(async (tx) => {
      await tx.terceiro.update({ where: { id: existente.id }, data: { ativo: false } });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'TERCEIRO', registroId: existente.id,
        acao: 'EXCLUIR', usuarioId: req.usuario.id, diff: { ativo: { antes: existente.ativo, depois: false } }
      });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /terceiros/:id]', err);
    res.status(500).json({ erro: 'Erro ao desativar terceiro' });
  }
});

// ---------- Questionario e risco ----------

// PUT /terceiros/:id/questionario  { respostas: [{ perguntaId, resposta, observacao }] }
// Grava/atualiza as respostas enviadas (as demais ficam como estao) e
// recalcula o risco.
router.put('/:id/questionario', async (req, res) => {
  try {
    if (!podeEscrever(req)) return res.status(403).json({ erro: 'Sem permissão para responder o questionário' });
    const orgId = req.usuario.organizacaoId;
    const terceiro = await buscarDaOrg(req.params.id, orgId);
    if (!terceiro) return res.status(404).json({ erro: 'Terceiro não encontrado' });
    const lista = Array.isArray(req.body?.respostas) ? req.body.respostas : null;
    if (!lista || lista.length === 0) return res.status(400).json({ erro: 'Envie ao menos uma resposta' });
    for (const r of lista) {
      if (!PERGUNTAS[r.perguntaId]) return res.status(400).json({ erro: `Pergunta inválida: ${r.perguntaId}` });
      if (!RESPOSTAS.includes(r.resposta)) return res.status(400).json({ erro: `Resposta inválida em ${r.perguntaId}` });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const anteriores = await tx.respostaQuestionarioTerceiro.findMany({ where: { terceiroId: terceiro.id } });
      const porPergunta = Object.fromEntries(anteriores.map(a => [a.perguntaId, a]));
      const diff = {};
      for (const r of lista) {
        const ant = porPergunta[r.perguntaId];
        const observacao = r.observacao ? String(r.observacao).slice(0, 1000) : null;
        if (ant && ant.resposta === r.resposta && (ant.observacao || null) === observacao) continue;
        await tx.respostaQuestionarioTerceiro.upsert({
          where: { terceiroId_perguntaId: { terceiroId: terceiro.id, perguntaId: r.perguntaId } },
          create: {
            organizacaoId: orgId, terceiroId: terceiro.id, perguntaId: r.perguntaId,
            resposta: r.resposta, observacao, respondidoPorId: req.usuario.id, respondidoEm: new Date()
          },
          update: { resposta: r.resposta, observacao, respondidoPorId: req.usuario.id, respondidoEm: new Date() }
        });
        diff[`questionario.${r.perguntaId}`] = { antes: ant ? ant.resposta : null, depois: r.resposta };
      }
      const avaliacao = await recalcularRisco(tx, terceiro);
      if (!terceiro.riscoManual && avaliacao.risco !== terceiro.risco) {
        diff.risco = { antes: terceiro.risco, depois: avaliacao.risco };
      }
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'TERCEIRO', registroId: terceiro.id,
        acao: 'EDITAR', usuarioId: req.usuario.id, diff
      });
      return avaliacao;
    });

    const atualizado = await buscarDaOrg(terceiro.id, orgId);
    res.json({ risco: atualizado.risco, riscoManual: atualizado.riscoManual, avaliacao: resultado });
  } catch (err) {
    console.error('[PUT /terceiros/:id/questionario]', err);
    res.status(500).json({ erro: 'Erro ao salvar questionário' });
  }
});

// PUT /terceiros/:id/risco
//   { manual: true, risco: 'ALTO', justificativa: '...' }  -> define manualmente
//   { manual: false }                                       -> volta ao calculado
router.put('/:id/risco', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem definir o risco manualmente' });
    const orgId = req.usuario.organizacaoId;
    const terceiro = await buscarDaOrg(req.params.id, orgId);
    if (!terceiro) return res.status(404).json({ erro: 'Terceiro não encontrado' });
    const { manual, risco, justificativa } = req.body || {};
    let data;
    if (manual) {
      if (!RISCOS.includes(risco)) return res.status(400).json({ erro: 'Risco inválido' });
      const just = typeof justificativa === 'string' ? justificativa.trim() : '';
      if (just.length < 10) return res.status(400).json({ erro: 'Justifique a classificação manual (mínimo 10 caracteres)' });
      data = { risco, riscoManual: true, riscoJustificativa: just.slice(0, 2000) };
    } else {
      const respostas = await prisma.respostaQuestionarioTerceiro.findMany({ where: { terceiroId: terceiro.id } });
      data = { risco: calcularRisco(respostas, terceiro).risco, riscoManual: false, riscoJustificativa: null };
    }
    const atualizado = await prisma.$transaction(async (tx) => {
      const novo = await tx.terceiro.update({ where: { id: terceiro.id }, data });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'TERCEIRO', registroId: terceiro.id,
        acao: 'EDITAR', usuarioId: req.usuario.id, antes: terceiro, depois: novo
      });
      return novo;
    });
    res.json(atualizado);
  } catch (err) {
    console.error('[PUT /terceiros/:id/risco]', err);
    res.status(500).json({ erro: 'Erro ao definir risco' });
  }
});

// ---------- Plano de acao ----------

async function lerAcao(b, orgId, { parcial }) {
  const data = {};
  if (!parcial || b.descricao !== undefined) {
    const d = typeof b.descricao === 'string' ? b.descricao.trim() : '';
    if (!d) return { erro: 'Descrição da ação é obrigatória' };
    data.descricao = d.slice(0, 1000);
  }
  if (b.situacao !== undefined) {
    if (!SITUACOES.includes(b.situacao)) return { erro: 'Situação inválida' };
    data.situacao = b.situacao;
  }
  if (b.prazo !== undefined) {
    const p = dataPura(b.prazo);
    if (p === undefined) return { erro: 'Prazo inválido (use AAAA-MM-DD)' };
    data.prazo = p;
  }
  if (b.responsavelId !== undefined) {
    if (!(await responsavelValido(prisma, b.responsavelId, orgId))) return { erro: 'Responsável inválido' };
    data.responsavelId = b.responsavelId || null;
  }
  return { data };
}

router.post('/:id/acoes', async (req, res) => {
  try {
    if (!podeEscrever(req)) return res.status(403).json({ erro: 'Sem permissão' });
    const orgId = req.usuario.organizacaoId;
    const terceiro = await buscarDaOrg(req.params.id, orgId);
    if (!terceiro) return res.status(404).json({ erro: 'Terceiro não encontrado' });
    const lido = await lerAcao(req.body || {}, orgId, { parcial: false });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const acao = await prisma.$transaction(async (tx) => {
      const criada = await tx.acaoTerceiro.create({
        data: { ...lido.data, organizacaoId: orgId, terceiroId: terceiro.id },
        include: { responsavel: { select: { id: true, nome: true } } }
      });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'TERCEIRO', registroId: terceiro.id, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { planoAcao: { antes: null, depois: resumoAcao(criada) } }
      });
      return criada;
    });
    res.status(201).json(acao);
  } catch (err) {
    console.error('[POST /terceiros/:id/acoes]', err);
    res.status(500).json({ erro: 'Erro ao criar ação' });
  }
});

router.put('/:id/acoes/:acaoId', async (req, res) => {
  try {
    if (!podeEscrever(req)) return res.status(403).json({ erro: 'Sem permissão' });
    const orgId = req.usuario.organizacaoId;
    const existente = await prisma.acaoTerceiro.findFirst({
      where: { id: req.params.acaoId, terceiroId: req.params.id, organizacaoId: orgId },
      include: { responsavel: { select: { id: true, nome: true } } }
    });
    if (!existente) return res.status(404).json({ erro: 'Ação não encontrada' });
    const lido = await lerAcao(req.body || {}, orgId, { parcial: true });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const acao = await prisma.$transaction(async (tx) => {
      const atualizada = await tx.acaoTerceiro.update({
        where: { id: existente.id }, data: lido.data,
        include: { responsavel: { select: { id: true, nome: true } } }
      });
      const antes = resumoAcao(existente);
      const depois = resumoAcao(atualizada);
      if (antes !== depois) {
        await registrarHistorico(tx, {
          organizacaoId: orgId, entidade: 'TERCEIRO', registroId: existente.terceiroId, acao: 'EDITAR', usuarioId: req.usuario.id,
          diff: { planoAcao: { antes, depois } }
        });
      }
      return atualizada;
    });
    res.json(acao);
  } catch (err) {
    console.error('[PUT /terceiros/:id/acoes/:acaoId]', err);
    res.status(500).json({ erro: 'Erro ao atualizar ação' });
  }
});

module.exports = router;
