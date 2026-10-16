// Historico generico por registro (model HistoricoRegistro).
//
// registrarHistorico() grava { campo: { antes, depois } } so com os
// campos que mudaram. Recebe o client do Prisma como argumento para
// poder rodar dentro de prisma.$transaction junto com a alteracao.

// Campos que nunca entram no diff: metadados, relacoes e conteudo
// binario/longo de documento.
const CAMPOS_IGNORADOS = new Set([
  'id', 'organizacaoId', 'criadoEm', 'atualizadoEm', '_count',
  'historico', 'evidencias', 'item', 'itemId', 'responsavel', 'organizacao',
  'evidenciaHash', 'hashSha256',
  'senha', 'senhaHash', 'novaSenha', 'mfaSecret', 'token',
  'conteudo', 'conteudoMd', 'arquivo'
]);

// Campos com dado pessoal do titular: registra que mudou, sem o valor.
// O historico vive mais que a anonimizacao de 5 anos do DSAR
// (cronJobs.jobAnonimizacaoDsarAntigo), entao o valor nao pode ficar aqui.
const CAMPOS_OMITIDOS = new Set(['titularNome', 'titularEmail', 'titularCpf']);
const OMITIDO = '[omitido]';

function normalizar(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return null;
  if (Array.isArray(v)) return v.map(normalizar);
  if (typeof v === 'object') {
    // Decimal do Prisma e afins
    if (typeof v.toJSON === 'function') return v.toJSON();
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizar(x)]));
  }
  return v;
}

function calcularDiff(antes, depois) {
  const a = antes || {};
  const d = depois || {};
  const chaves = new Set([...Object.keys(a), ...Object.keys(d)]);
  const diff = {};
  for (const k of chaves) {
    if (CAMPOS_IGNORADOS.has(k)) continue;
    const va = normalizar(a[k]);
    const vd = normalizar(d[k]);
    if (JSON.stringify(va) === JSON.stringify(vd)) continue;
    diff[k] = CAMPOS_OMITIDOS.has(k)
      ? { antes: va === null ? null : OMITIDO, depois: vd === null ? null : OMITIDO }
      : { antes: va, depois: vd };
  }
  return diff;
}

// acao: CRIAR | EDITAR | EXCLUIR | STATUS. Uma EDITAR que muda o campo
// status vira STATUS. Diff vazio em EDITAR/STATUS nao grava nada.
async function registrarHistorico(db, { organizacaoId, entidade, registroId, acao, usuarioId, antes, depois, diff }) {
  const d = diff || calcularDiff(antes, depois);
  const vazio = Object.keys(d).length === 0;
  if (vazio && (acao === 'EDITAR' || acao === 'STATUS')) return null;
  const acaoFinal = acao === 'EDITAR' && d.status ? 'STATUS' : acao;
  return db.historicoRegistro.create({
    data: {
      organizacaoId,
      entidade,
      registroId,
      acao: acaoFinal,
      usuarioId: usuarioId || null,
      diff: d
    }
  });
}

module.exports = { registrarHistorico, calcularDiff, CAMPOS_IGNORADOS, CAMPOS_OMITIDOS };
