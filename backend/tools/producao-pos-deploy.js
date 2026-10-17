// Conferencias e correcoes pontuais de producao depois do deploy da PoC.
// Roda com "railway run" no servico de producao (as variaveis vem do Railway).
// Nunca imprime URL, senha nem valor de variavel.
//
//   railway run --service anonimizador-lgpd --environment production node tools/producao-pos-deploy.js migracoes
//   railway run --service anonimizador-lgpd --environment production node tools/producao-pos-deploy.js catalogo
//   railway run --service anonimizador-lgpd --environment production node tools/producao-pos-deploy.js catalogo --aplicar
//
// "migracoes": so leitura — quantas migracoes aplicadas e se faltam as da PoC.
// "catalogo": so leitura — mostra o fundamento legal atual de GOV-05, DSAR-02
//   e DSAR-03 (passos 5a, 5b e 5c do DEPLOY-PLANO.md).
// "catalogo --aplicar": troca os 3 fundamentos numa transacao so. Cada troca
//   exige exatamente 1 linha com o texto antigo; se qualquer uma falhar, nada
//   e gravado.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ESPERADO = 'ef0854a250'; // impressao digital do banco de producao (sha256 da URL, 10 primeiros)
const CORRECOES = [
  { passo: '5a', codigo: 'GOV-05', antigo: 'LGPD Art. 50, I, g', novo: 'LGPD, arts. 41, § 2º, III, e 46' },
  { passo: '5b', codigo: 'DSAR-02', antigo: 'LGPD Art. 19, paragrafo 1', novo: 'LGPD, art. 19, II' },
  { passo: '5c', codigo: 'DSAR-03', antigo: 'LGPD Art. 18, paragrafo 5', novo: 'LGPD, arts. 18 e 46' }
];

function conferirAmbiente() {
  const fp = crypto.createHash('sha256').update(process.env.DATABASE_URL || '').digest('hex').slice(0, 10);
  const teste = process.env.COMPLIDATA_TESTE_POC === '1' && process.env.RAILWAY_ENVIRONMENT_NAME === 'poc';
  if (!teste && (fp !== ESPERADO || process.env.RAILWAY_ENVIRONMENT_NAME !== 'production')) {
    console.log('PARE: não é o banco de produção esperado. Nada foi feito.');
    process.exit(2);
  }
  console.log(teste ? 'Ambiente: poc (modo de teste)' : 'Ambiente: produção conferida');
}

async function migracoes(db) {
  const pasta = path.join(__dirname, '..', 'prisma', 'migrations');
  const doCodigo = fs.readdirSync(pasta).filter(n => /^\d{14}_/.test(n)).sort();
  const linhas = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"');
  const aplicadas = new Set(linhas.filter(l => l.finished_at && !l.rolled_back_at).map(l => l.migration_name));
  const falharam = linhas.filter(l => !l.finished_at && !l.rolled_back_at).map(l => l.migration_name);
  const pendentes = doCodigo.filter(n => !aplicadas.has(n));
  console.log(`Migrações no código: ${doCodigo.length} | aplicadas no banco: ${aplicadas.size} | pendentes: ${pendentes.length}`);
  pendentes.forEach(n => console.log('  pendente:', n));
  falharam.forEach(n => console.log('  COM FALHA (não terminou):', n));
  console.log(pendentes.length === 0 && falharam.length === 0 ? 'RESULTADO: OK — todas aplicadas' : 'RESULTADO: ATENÇÃO — veja acima');
}

async function catalogo(db, aplicar) {
  const atual = async (tx, codigo) => tx.$queryRawUnsafe(
    'SELECT codigo, "fundamentoLegal" FROM "ItemChecklist" WHERE codigo = $1 AND "organizacaoId" IS NULL', codigo);
  console.log('ANTES:');
  let tudoComTextoAntigo = true;
  for (const c of CORRECOES) {
    const ls = await atual(db, c.codigo);
    const situacao = ls.length !== 1 ? `${ls.length} linha(s) — esperado 1`
      : ls[0].fundamentoLegal === c.antigo ? 'texto antigo (pode corrigir)'
      : ls[0].fundamentoLegal === c.novo ? 'JÁ CORRIGIDO'
      : 'texto DIFERENTE do esperado';
    if (situacao !== 'texto antigo (pode corrigir)') tudoComTextoAntigo = false;
    console.log(`  ${c.passo} ${c.codigo}: "${ls[0]?.fundamentoLegal ?? '-'}" → ${situacao}`);
  }
  if (!aplicar || !tudoComTextoAntigo) {
    console.log(tudoComTextoAntigo ? 'Nada foi gravado. Para corrigir, rode de novo com --aplicar.' : 'Nada foi gravado. Não rode --aplicar: algum item não está com o texto antigo.');
    if (aplicar) process.exitCode = 1;
    return;
  }
  try {
    await db.$transaction(async (tx) => {
      for (const c of CORRECOES) {
        const n = await tx.$executeRawUnsafe(
          'UPDATE "ItemChecklist" SET "fundamentoLegal" = $1 WHERE codigo = $2 AND "organizacaoId" IS NULL AND "fundamentoLegal" = $3',
          c.novo, c.codigo, c.antigo);
        if (n !== 1) throw new Error(`${c.passo} ${c.codigo}: esperada 1 linha, afetadas ${n}`);
        console.log(`  ${c.passo} ${c.codigo}: 1 linha alterada`);
      }
    });
  } catch (e) {
    console.log('ERRO:', e.message, '— a transação foi desfeita, NADA foi gravado.');
    process.exitCode = 1;
    return;
  }
  console.log('DEPOIS:');
  for (const c of CORRECOES) {
    const ls = await atual(db, c.codigo);
    console.log(`  ${c.passo} ${c.codigo}: "${ls[0]?.fundamentoLegal}" ${ls[0]?.fundamentoLegal === c.novo ? 'OK' : 'ATENÇÃO'}`);
  }
}

(async () => {
  const [acao, opcao] = process.argv.slice(2);
  if (!['migracoes', 'catalogo'].includes(acao)) { console.log('Uso: node tools/producao-pos-deploy.js migracoes | catalogo [--aplicar]'); process.exit(1); }
  conferirAmbiente();
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    if (acao === 'migracoes') await migracoes(db);
    else await catalogo(db, opcao === '--aplicar');
  } finally {
    await db.$disconnect();
  }
})().catch(e => { console.log('erro:', e.code || e.errorCode || String(e.message).trim().split('\n')[0] || e.name); process.exit(1); });
