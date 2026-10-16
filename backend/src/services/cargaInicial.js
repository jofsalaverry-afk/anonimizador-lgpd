// Cargas iniciais idempotentes: so CRIAM o que falta, nunca alteram o que
// existe. Rodam no seed (a cada deploy) e na criacao de organizacao.
const CATALOGO = require('../data/catalogoChecklist');
const MODELOS_DSAR = require('../data/modelosDsar');

// Catalogo global do checklist: cria os codigos que nao existem.
async function garantirCatalogoChecklist(db) {
  const existentes = await db.itemChecklist.findMany({ where: { codigo: { in: CATALOGO.map(i => i.codigo) } }, select: { codigo: true } });
  const tem = new Set(existentes.map(e => e.codigo));
  const faltam = CATALOGO.filter(i => !tem.has(i.codigo));
  for (const item of faltam) {
    try {
      await db.itemChecklist.create({ data: { ...item, organizacaoId: null } });
    } catch (err) {
      if (err.code !== 'P2002') throw err; // criado em paralelo: ok
    }
  }
  return { criados: faltam.map(i => i.codigo), existentes: tem.size };
}

// Modelos padrao de resposta DSAR de uma organizacao: cria o modelo
// padrao dos direitos que ainda nao tem um.
async function garantirModelosDsar(db, organizacaoId) {
  const atuais = await db.modeloRespostaDSAR.findMany({ where: { organizacaoId, padrao: true }, select: { tipoDireito: true } });
  const tem = new Set(atuais.map(m => m.tipoDireito));
  const faltam = MODELOS_DSAR.filter(m => !tem.has(m.tipoDireito));
  for (const m of faltam) {
    await db.modeloRespostaDSAR.create({ data: { ...m, organizacaoId, padrao: true } });
  }
  return faltam.map(m => m.tipoDireito);
}

async function garantirModelosDsarTodas(db) {
  const orgs = await db.organizacao.findMany({ select: { id: true } });
  let criados = 0;
  for (const o of orgs) criados += (await garantirModelosDsar(db, o.id)).length;
  return { organizacoes: orgs.length, criados };
}

module.exports = { garantirCatalogoChecklist, garantirModelosDsar, garantirModelosDsarTodas };
