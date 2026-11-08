// Lista e remove anexos da Câmara Municipal de Demonstração (só dela).
// Uso no Console do Railway (serviço backend):
//   node tools/anexos-demo.js listar
//   node tools/anexos-demo.js remover <id-do-anexo>
// Remover apaga o arquivo e a linha correspondente no histórico do registro.
// Serve para limpar arquivos enviados por engano em ensaios da demonstração;
// em organizações reais anexos são evidência e não se apagam.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const NOME_DEMO = 'Câmara Municipal de Demonstração';

async function main() {
  const [cmd, id] = process.argv.slice(2);
  const org = await prisma.organizacao.findFirst({ where: { nome: NOME_DEMO }, select: { id: true } });
  if (!org) throw new Error(`Organização "${NOME_DEMO}" não encontrada`);

  if (cmd === 'listar') {
    const anexos = await prisma.anexo.findMany({
      where: { organizacaoId: org.id },
      select: { id: true, nomeArquivo: true, entidade: true, criadoEm: true, enviadoPor: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' }
    });
    for (const a of anexos) {
      console.log(`${a.id}  ${a.criadoEm.toISOString().slice(0, 16).replace('T', ' ')}  ${a.enviadoPor?.nome || '-'}  ${a.entidade}  ${a.nomeArquivo}`);
    }
    console.log(`${anexos.length} anexo(s)`);
    return;
  }

  if (cmd === 'remover' && id) {
    const a = await prisma.anexo.findFirst({ where: { id, organizacaoId: org.id }, select: { id: true, nomeArquivo: true, entidade: true, registroId: true } });
    if (!a) throw new Error('Anexo não encontrado na Câmara de Demonstração');
    const hist = await prisma.historicoRegistro.findMany({
      where: { organizacaoId: org.id, entidade: a.entidade, registroId: a.registroId },
      select: { id: true, diff: true }
    });
    const doAnexo = hist.filter(h => typeof h.diff?.anexo?.depois === 'string' && h.diff.anexo.depois.startsWith(`${a.nomeArquivo} (SHA-256`));
    await prisma.$transaction([
      prisma.historicoRegistro.deleteMany({ where: { id: { in: doAnexo.map(h => h.id) } } }),
      prisma.anexo.delete({ where: { id: a.id } })
    ]);
    console.log(`OK - removido "${a.nomeArquivo}" e ${doAnexo.length} linha(s) de histórico.`);
    return;
  }

  console.log('Uso: node tools/anexos-demo.js listar | remover <id>');
}

main().catch(e => { console.error('ERRO:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
