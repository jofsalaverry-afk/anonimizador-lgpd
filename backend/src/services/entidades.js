// Entidades que aceitam anexos e historico genericos. Cada uma diz
// qual modulo precisa estar ativo e como confirmar que o registro
// pertence a organizacao do usuario (isolamento entre camaras).

const ENTIDADES = {
  TRATAMENTO: {
    modulo: 'ropa',
    buscar: (db, id, organizacaoId) => db.tratamento.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  },
  SOLICITACAO_DSAR: {
    modulo: 'dsar',
    buscar: (db, id, organizacaoId) => db.solicitacaoTitular.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  },
  INCIDENTE: {
    modulo: 'repositorio',
    buscar: (db, id, organizacaoId) => db.incidente.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  },
  // Itens do checklist: catalogo global (organizacaoId null) ou atividade
  // propria da org. O registro da org e a RespostaChecklist (unica por
  // org+item); usamos o id do item como registroId — o isolamento vem do
  // organizacaoId gravado no anexo/historico. Atividade de outra org = 404.
  CHECKLIST_ITEM: {
    modulo: 'checklist',
    buscar: (db, id, organizacaoId) => db.itemChecklist.findFirst({
      where: { id, OR: [{ organizacaoId: null }, { organizacaoId }] }, select: { id: true }
    })
  },
  DESCARTE: {
    modulo: 'ropa',
    buscar: (db, id, organizacaoId) => db.registroDescarte.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  },
  MODELO_DSAR: {
    modulo: 'dsar',
    buscar: (db, id, organizacaoId) => db.modeloRespostaDSAR.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  },
  SISTEMA: {
    modulo: 'inventario',
    buscar: (db, id, organizacaoId) => db.sistemaInventario.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  },
  TERCEIRO: {
    modulo: 'terceiros',
    buscar: (db, id, organizacaoId) => db.terceiro.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  },
  // Setor e cadastro transversal (sem modulo).
  SETOR: {
    modulo: null,
    buscar: (db, id, organizacaoId) => db.setor.findFirst({ where: { id, organizacaoId }, select: { id: true } })
  }
};

// Valida entidade + modulo ativo + registro da organizacao.
// Retorna { status, erro } quando falha, ou null quando ok.
async function verificarRegistro(db, { entidade, registroId, organizacaoId }) {
  const def = ENTIDADES[entidade];
  if (!def) return { status: 400, erro: 'Entidade inválida' };
  if (!registroId || typeof registroId !== 'string') return { status: 400, erro: 'registroId obrigatório' };
  const org = await db.organizacao.findUnique({ where: { id: organizacaoId }, select: { modulosAtivos: true } });
  if (!org) return { status: 403, erro: 'Organização não encontrada' };
  if (def.modulo && !org.modulosAtivos.includes(def.modulo)) {
    return { status: 403, erro: `Módulo "${def.modulo}" não está ativo para sua organização.` };
  }
  const registro = await def.buscar(db, registroId, organizacaoId);
  if (!registro) return { status: 404, erro: 'Registro não encontrado' };
  return null;
}

// responsavelId vazio = sem responsavel. Preenchido: precisa ser
// usuario ativo (nao excluido) da mesma organizacao.
async function responsavelValido(db, responsavelId, organizacaoId) {
  if (!responsavelId) return true;
  const u = await db.usuario.findFirst({
    where: { id: responsavelId, organizacaoId, deletedAt: null },
    select: { id: true }
  });
  return !!u;
}

// Confere que todos os ids pertencem a organizacao (setor, terceiro,
// sistemas...). Vazio/null passa. Retorna true/false.
async function idsDaOrganizacao(delegate, ids, organizacaoId) {
  const lista = [...new Set([].concat(ids || []).filter(Boolean))];
  if (lista.length === 0) return true;
  const achados = await delegate.findMany({ where: { id: { in: lista }, organizacaoId }, select: { id: true } });
  return achados.length === lista.length;
}

module.exports = { ENTIDADES, verificarRegistro, responsavelValido, idsDaOrganizacao };
