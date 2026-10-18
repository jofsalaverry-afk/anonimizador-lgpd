// Conferencias e correcoes pontuais de producao depois do deploy da PoC.
// Roda com "railway run" no servico de producao (as variaveis vem do Railway).
// Nunca imprime URL, senha nem valor de variavel.
//
//   railway run --service anonimizador-lgpd --environment production node tools/producao-pos-deploy.js migracoes
//   railway run --service anonimizador-lgpd --environment production node tools/producao-pos-deploy.js catalogo
//   railway run --service anonimizador-lgpd --environment production node tools/producao-pos-deploy.js catalogo --aplicar
//
// "migracoes": so leitura — quantas migracoes aplicadas e se faltam as da PoC.
// "catalogo": so leitura — mostra a situacao das correcoes do catalogo global:
//   fundamento legal de GOV-05, DSAR-02 e DSAR-03 (passos 5a, 5b e 5c do
//   DEPLOY-PLANO.md) e acentos de titulos/descricoes (item 6 pos-Ensaio 1,
//   lista em tools/dados/catalogo-acentos.js).
// "catalogo --aplicar": grava, numa transacao so, as correcoes cujo campo
//   ainda esta com o texto antigo. As que ja estao corrigidas ficam como estao.
//   Se algum campo estiver com texto DIFERENTE do antigo e do novo (ou o item
//   nao existir), nada e gravado.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const ACENTOS = require('./dados/catalogo-acentos');

const ESPERADO = 'ef0854a250'; // impressao digital do banco de producao (sha256 da URL, 10 primeiros)
const CORRECOES = [
  { passo: '5a', codigo: 'GOV-05', campo: 'fundamentoLegal', antigo: 'LGPD Art. 50, I, g', novo: 'LGPD, arts. 41, § 2º, III, e 46' },
  { passo: '5b', codigo: 'DSAR-02', campo: 'fundamentoLegal', antigo: 'LGPD Art. 19, paragrafo 1', novo: 'LGPD, art. 19, II' },
  { passo: '5c', codigo: 'DSAR-03', campo: 'fundamentoLegal', antigo: 'LGPD Art. 18, paragrafo 5', novo: 'LGPD, arts. 18 e 46' },
  ...ACENTOS.map(a => ({ passo: 'acento', ...a }))
];
// Nome da coluna no banco (so estas tres podem ser alteradas)
const COLUNA = { fundamentoLegal: '"fundamentoLegal"', titulo: 'titulo', descricao: 'descricao' };

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

const PODE = 'texto antigo (pode corrigir)';
const JA = 'JÁ CORRIGIDO';

async function catalogo(db, aplicar, log = console.log) {
  const atual = async (tx, codigo) => tx.$queryRawUnsafe(
    'SELECT codigo, titulo, descricao, "fundamentoLegal" FROM "ItemChecklist" WHERE codigo = $1 AND "organizacaoId" IS NULL', codigo);
  log('ANTES:');
  const aFazer = [];
  let bloqueado = false;
  let jaCorrigidos = 0;
  for (const c of CORRECOES) {
    const ls = await atual(db, c.codigo);
    const valor = ls[0]?.[c.campo];
    const situacao = ls.length !== 1 ? `${ls.length} linha(s) — esperado 1`
      : valor === c.antigo ? PODE
      : valor === c.novo ? JA
      : 'texto DIFERENTE do esperado';
    if (situacao === PODE) aFazer.push(c);
    else if (situacao === JA) jaCorrigidos++;
    else bloqueado = true;
    // acentos ja corrigidos nao poluem a saida
    if (situacao !== JA || c.passo !== 'acento') log(`  ${c.passo} ${c.codigo} ${c.campo}: "${valor ?? '-'}" → ${situacao}`);
  }
  log(`Resumo: ${aFazer.length} a corrigir, ${jaCorrigidos} já corrigido(s)${bloqueado ? ', e há item com texto inesperado' : ''}.`);
  if (!aplicar || bloqueado || aFazer.length === 0) {
    log(bloqueado ? 'Nada foi gravado. Não rode --aplicar: algum item não está nem com o texto antigo nem com o novo.'
      : aFazer.length === 0 ? 'Nada a gravar: tudo já corrigido.'
      : 'Nada foi gravado. Para corrigir, rode de novo com --aplicar.');
    if (aplicar && bloqueado) process.exitCode = 1;
    return { aplicadas: 0, bloqueado };
  }
  try {
    await db.$transaction(async (tx) => {
      for (const c of aFazer) {
        const col = COLUNA[c.campo];
        const n = await tx.$executeRawUnsafe(
          `UPDATE "ItemChecklist" SET ${col} = $1 WHERE codigo = $2 AND "organizacaoId" IS NULL AND ${col} = $3`,
          c.novo, c.codigo, c.antigo);
        if (n !== 1) throw new Error(`${c.passo} ${c.codigo} ${c.campo}: esperada 1 linha, afetadas ${n}`);
      }
    });
  } catch (e) {
    log('ERRO:', e.message, '— a transação foi desfeita, NADA foi gravado.');
    process.exitCode = 1;
    return { aplicadas: 0, bloqueado: true };
  }
  log(`${aFazer.length} campo(s) alterado(s). DEPOIS:`);
  let ok = 0;
  for (const c of aFazer) {
    const ls = await atual(db, c.codigo);
    if (ls[0]?.[c.campo] === c.novo) ok++;
    else log(`  ${c.passo} ${c.codigo} ${c.campo}: ATENÇÃO — "${ls[0]?.[c.campo]}"`);
  }
  log(`  ${ok} de ${aFazer.length} conferido(s) com o texto novo.`);
  return { aplicadas: aFazer.length, bloqueado: false };
}

if (require.main === module) {
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
}

module.exports = { catalogo, CORRECOES };
