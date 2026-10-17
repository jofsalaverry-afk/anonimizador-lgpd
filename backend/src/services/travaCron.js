// Etapa 7a: trava das tarefas agendadas no Postgres, para nao rodarem em
// dobro com mais de uma instancia (ou na sobreposicao de um deploy).
//
// Usa pg_try_advisory_xact_lock dentro de uma transacao: a trava fica presa
// a UMA conexao (a da transacao) e e liberada sozinha quando ela termina.
// Com o pool de conexoes do Prisma, pg_try_advisory_lock + pg_advisory_unlock
// poderiam cair em conexoes diferentes e a trava nunca ser solta.
const crypto = require('crypto');

// nome da tarefa -> inteiro de 32 bits estavel (chave da advisory lock)
function chaveDaTrava(nome) {
  return crypto.createHash('sha256').update(`complidata:cron:${nome}`).digest().readInt32BE(0);
}

// Roda fn() so se esta instancia pegar a trava. Retorna { rodou, resultado }.
async function comTrava(db, nome, fn, { timeoutMs = 30 * 60 * 1000 } = {}) {
  let rodou = false;
  let resultado;
  await db.$transaction(async (tx) => {
    const [r] = await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock($1::int) AS ok', chaveDaTrava(nome));
    if (!r?.ok) {
      console.log(`[cron] ${nome}: outra instância está executando — pulado`);
      return;
    }
    rodou = true;
    resultado = await fn();
  }, { timeout: timeoutMs, maxWait: 10000 });
  return { rodou, resultado };
}

module.exports = { comTrava, chaveDaTrava };
