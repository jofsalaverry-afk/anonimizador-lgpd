// Pesquisa de Satisfação — lógica de domínio (PNTP TCE/RS 15.6).
//
// INVARIANTES (replicadas do model — ver schema.prisma):
// 1. Pesquisa é anônima. Não introduzir lookup/filtro por nome/email/CPF.
// 2. Métricas públicas exigem mínimo de 5 respostas no período.
// 3. Comentários NUNCA são expostos por endpoint público (nem snippets,
//    nem nuvem de palavras, nem agregação textual).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Gate mínimo para retorno de métricas públicas — proteção contra
// reidentificação de comentaristas em câmaras com pouco volume.
const MINIMO_RESPOSTAS_PUBLICO = 5;

// Verifica se o `setor` informado pelo titular pertence à lista de
// setoresPesquisa da organização. A lista é editável pelo gestor, então
// a validação é runtime (não enum). Retorna boolean — chamador decide
// status 400 ou continua.
async function validarSetor(organizacaoId, setor) {
  if (!organizacaoId || !setor) return false;
  const org = await prisma.organizacao.findUnique({
    where: { id: organizacaoId },
    select: { setoresPesquisa: true }
  });
  if (!org) return false;
  return org.setoresPesquisa.includes(setor);
}

// Agrega pesquisas em métricas. `pesquisas` deve vir já filtrado por
// organização + período. Retorna estrutura usada tanto pelo painel
// interno quanto pelo endpoint público (após gate de mínimo).
//
// NUNCA inclui comentários ou ids individuais — somente agregados.
function _agregar(pesquisas) {
  const total = pesquisas.length;
  if (total === 0) {
    return {
      total: 0,
      media: null,
      distribuicao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      porSetor: {},
      serieTemporal: []
    };
  }

  const soma = pesquisas.reduce((acc, p) => acc + p.avaliacao, 0);
  const media = Number((soma / total).toFixed(2));

  const distribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of pesquisas) distribuicao[p.avaliacao] = (distribuicao[p.avaliacao] || 0) + 1;

  // Agrupa por setor: { 'Protocolo': { total: 12, media: 4.2 }, ... }
  const setores = {};
  for (const p of pesquisas) {
    if (!setores[p.setor]) setores[p.setor] = { total: 0, soma: 0 };
    setores[p.setor].total += 1;
    setores[p.setor].soma += p.avaliacao;
  }
  const porSetor = {};
  for (const [s, v] of Object.entries(setores)) {
    porSetor[s] = { total: v.total, media: Number((v.soma / v.total).toFixed(2)) };
  }

  // Série temporal mensal (YYYY-MM). Útil pra gráfico de tendência.
  const meses = {};
  for (const p of pesquisas) {
    const ym = p.criadoEm.toISOString().slice(0, 7);
    if (!meses[ym]) meses[ym] = { total: 0, soma: 0 };
    meses[ym].total += 1;
    meses[ym].soma += p.avaliacao;
  }
  const serieTemporal = Object.entries(meses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, total: v.total, media: Number((v.soma / v.total).toFixed(2)) }));

  return { total, media, distribuicao, porSetor, serieTemporal };
}

// Métricas para painel interno (autenticado). Sem gate de mínimo —
// gestor enxerga 1 resposta se for o que tem.
async function calcularMetricas(organizacaoId, { dataInicio, dataFim } = {}) {
  const where = { organizacaoId };
  if (dataInicio || dataFim) {
    where.criadoEm = {};
    if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
    if (dataFim) where.criadoEm.lte = new Date(dataFim);
  }
  const pesquisas = await prisma.pesquisaSatisfacao.findMany({
    where,
    select: { avaliacao: true, setor: true, criadoEm: true }
  });
  return _agregar(pesquisas);
}

// Métricas para endpoint público — aplica gate de mínimo 5 respostas
// para proteger contra reidentificação em câmaras pequenas.
async function calcularMetricasPublicas(organizacaoId, { dataInicio, dataFim } = {}) {
  const where = { organizacaoId };
  if (dataInicio || dataFim) {
    where.criadoEm = {};
    if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
    if (dataFim) where.criadoEm.lte = new Date(dataFim);
  }
  const pesquisas = await prisma.pesquisaSatisfacao.findMany({
    where,
    select: { avaliacao: true, setor: true, criadoEm: true }
  });

  if (pesquisas.length < MINIMO_RESPOSTAS_PUBLICO) {
    return {
      insuficiente: true,
      minimoRequerido: MINIMO_RESPOSTAS_PUBLICO,
      totalAtual: pesquisas.length,
      mensagem: `Dados insuficientes para divulgação pública (mínimo ${MINIMO_RESPOSTAS_PUBLICO} respostas).`
    };
  }
  return _agregar(pesquisas);
}

module.exports = {
  MINIMO_RESPOSTAS_PUBLICO,
  validarSetor,
  calcularMetricas,
  calcularMetricasPublicas
};
