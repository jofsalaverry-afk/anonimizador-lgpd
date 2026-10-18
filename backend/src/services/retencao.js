// Prazo de retencao de um tratamento do ROPA. Conta a partir do ultimo
// descarte registrado (RegistroDescarte) ou, se nunca houve descarte,
// da criacao do tratamento. Sem retencaoDias = sem prazo definido.
const DIA_MS = 24 * 60 * 60 * 1000;

function calcularRetencao(tratamento, ultimoDescarte, agora = new Date()) {
  if (!tratamento.retencaoDias) return null;
  const base = ultimoDescarte ? new Date(ultimoDescarte.dataDescarte) : new Date(tratamento.criadoEm);
  const venceEm = new Date(base.getTime() + tratamento.retencaoDias * DIA_MS);
  const diasRestantes = Math.ceil((venceEm - agora) / DIA_MS);
  return {
    retencaoDias: tratamento.retencaoDias,
    contadoDesde: base,
    origem: ultimoDescarte ? 'ULTIMO_DESCARTE' : 'CRIACAO',
    venceEm,
    diasRestantes,
    vencido: venceEm <= agora
  };
}

// Mapa tratamentoId -> descarte mais recente, para varios tratamentos.
async function ultimosDescartes(db, tratamentoIds, organizacaoId) {
  if (tratamentoIds.length === 0) return {};
  const descartes = await db.registroDescarte.findMany({
    where: { tratamentoId: { in: tratamentoIds }, organizacaoId },
    orderBy: { dataDescarte: 'desc' }
  });
  const mapa = {};
  for (const d of descartes) if (!mapa[d.tratamentoId]) mapa[d.tratamentoId] = d;
  return mapa;
}

module.exports = { calcularRetencao, ultimosDescartes };
