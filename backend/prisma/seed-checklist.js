// Carga manual do catalogo global do checklist. Hoje o src/seed.js ja faz
// isso a cada deploy; este script fica para uso pontual.
// Idempotente: so CRIA os itens que faltam, nunca altera os existentes
// (Etapa 6c — antes usava upsert e sobrescrevia o catalogo).
// Executar: node prisma/seed-checklist.js
const { PrismaClient } = require('@prisma/client');
const { garantirCatalogoChecklist } = require('../src/services/cargaInicial');

const prisma = new PrismaClient();
garantirCatalogoChecklist(prisma)
  .then(r => console.log(`Ok — ${r.criados.length} criado(s): ${r.criados.join(', ') || 'nenhum'}`))
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
