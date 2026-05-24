// Script one-shot: migra registros antigos de "Pesquisa de Satisfação"
// que foram gravados em SolicitacaoTitular (tipoDireito='OUTRO' com
// prefixo [PESQUISA DE SATISFAÇÃO] na descrição) para o model dedicado
// PesquisaSatisfacao.
//
// IDEMPOTENTE — pode rodar várias vezes; registros já migrados são
// detectados pelo prefixo [MIGRADO PARA PESQUISA] na descrição da
// SolicitacaoTitular original e pulados.
//
// USO:
//   node migrar-pesquisas-antigas.js                # aplica
//   node migrar-pesquisas-antigas.js --dry-run      # só simula
//
// REQUISITO: migration 20260522120000_add_pesquisa_satisfacao já
// aplicada (model PesquisaSatisfacao existe no banco).
//
// NOTA OPERACIONAL: rodar em janela controlada, depois de backup do
// banco. A operação não é destrutiva — preserva SolicitacaoTitular
// original com prefixo de marcação e status ENCERRADA.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const MARCADOR_MIGRADO = '[MIGRADO PARA PESQUISA]';
const PREFIXO_ANTIGO = '[PESQUISA DE SATISFAÇÃO]';

// Parser tolerante. Formato esperado:
//   [PESQUISA DE SATISFAÇÃO]
//   Avaliação: N/5  [estrelas]
//   Setor atendido: <setor>
//   Nome: <nome ou Cidadão anônimo>
//   Email de contato: <email ou anonimo@pesquisa.local>
//
//   Comentário:
//   <texto livre, pode ter quebras de linha>
function parsearDescricao(desc) {
  if (!desc || !desc.startsWith(PREFIXO_ANTIGO)) return null;

  const matchAval = desc.match(/Avaliação:\s*(\d)\/5/);
  const matchSetor = desc.match(/Setor atendido:\s*([^\n]+)/);
  // Comentário vem depois de "Comentário:" e pega o resto.
  const matchComentario = desc.match(/Comentário:\s*\n([\s\S]*)$/);

  if (!matchAval || !matchSetor || !matchComentario) return null;

  const avaliacao = parseInt(matchAval[1], 10);
  if (!Number.isInteger(avaliacao) || avaliacao < 1 || avaliacao > 5) return null;

  const setor = matchSetor[1].trim();
  const comentario = matchComentario[1].trim();
  if (!setor || !comentario || comentario.length < 5) return null;

  return { avaliacao, setor, comentario };
}

async function main() {
  console.log(`[migrar-pesquisas] inicio ${DRY_RUN ? '(DRY RUN)' : ''}`);

  const candidatos = await prisma.solicitacaoTitular.findMany({
    where: {
      tipoDireito: 'OUTRO',
      descricao: { startsWith: PREFIXO_ANTIGO }
    },
    select: {
      id: true,
      organizacaoId: true,
      descricao: true,
      criadoEm: true,
      status: true
    }
  });

  console.log(`[migrar-pesquisas] ${candidatos.length} candidato(s) encontrado(s)`);

  let migrados = 0;
  let pulados = 0;
  let erros = 0;
  const erroDetalhes = [];

  for (const c of candidatos) {
    try {
      // Checagem extra de idempotência: alguma PesquisaSatisfacao já
      // existe para essa org com o MESMO criadoEm? (sinal de migração
      // anterior que deu errado em renomear a origem).
      const jaExiste = await prisma.pesquisaSatisfacao.findFirst({
        where: {
          organizacaoId: c.organizacaoId,
          criadoEm: c.criadoEm
        },
        select: { id: true }
      });
      if (jaExiste) {
        pulados += 1;
        continue;
      }

      const parsed = parsearDescricao(c.descricao);
      if (!parsed) {
        erros += 1;
        erroDetalhes.push({ id: c.id, motivo: 'parse-falhou' });
        continue;
      }

      if (DRY_RUN) {
        migrados += 1;
        continue;
      }

      // Cria PesquisaSatisfacao preservando criadoEm original e marca
      // a SolicitacaoTitular como migrada. Transação garante
      // consistência: ou os dois acontecem, ou nenhum.
      await prisma.$transaction([
        prisma.pesquisaSatisfacao.create({
          data: {
            organizacaoId: c.organizacaoId,
            avaliacao: parsed.avaliacao,
            setor: parsed.setor,
            comentario: parsed.comentario,
            criadoEm: c.criadoEm
          }
        }),
        prisma.solicitacaoTitular.update({
          where: { id: c.id },
          data: {
            descricao: `${MARCADOR_MIGRADO}\n${c.descricao}`,
            status: c.status === 'CANCELADA' ? c.status : 'ENCERRADA'
          }
        })
      ]);

      migrados += 1;
    } catch (err) {
      erros += 1;
      erroDetalhes.push({ id: c.id, motivo: err.message });
    }
  }

  console.log('[migrar-pesquisas] resumo:', {
    total: candidatos.length,
    migrados,
    pulados,
    erros
  });
  if (erroDetalhes.length) {
    console.log('[migrar-pesquisas] erros detalhados:');
    for (const e of erroDetalhes) console.log('  -', e.id, ':', e.motivo);
  }
  if (DRY_RUN) {
    console.log('[migrar-pesquisas] DRY RUN — nenhuma alteração foi aplicada.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[migrar-pesquisas] falha global:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
