// Exportacao padronizada (item XIII do TR). Cada exportador define:
//   arquivo   - nome base do arquivo (sem extensao)
//   titulo    - nome legivel (vai no dicionario de dados)
//   descricao - o que o arquivo contem
//   colunas   - [{ campo, descricao }] na ordem do CSV
//   gerar(db, organizacaoId, ctx) -> { linhas, json }
//     linhas: objetos planos (uma linha de CSV cada, chaves = colunas)
//     json:   estrutura completa (pode ter listas aninhadas)
// O mesmo exportador serve a rota do modulo e o pacote de portabilidade,
// e o dicionario-de-dados.md e montado a partir das colunas.

const { pendenciasMapeamento } = require('./indicadores');
const { documentoCsv } = require('./textoSeguro');
const R = require('./rotulos');
const { fmtData, fmtDataHora, fmtDataHoraCsv } = require('./datas');
const { rotuloBaseLegal, normalizarCategorias } = require('./basesLegais');

const { prazoComunicacao } = require('./incidentes');
const { codigosExibicao } = require('./checklistCodigos');
const { calcularSLA, identidadeDe } = require('./dsarService');

// Nas LINHAS (usadas tambem pelos PDFs): data-hora em ISO 8601, data pura
// AAAA-MM-DD e codigos. O CSV formata pela 3a posicao da coluna:
// 'datahora' (Brasilia), 'data' (dd/mm/aaaa) ou um mapa de rotulos;
// booleano vira Sim/Nao. O JSON mantem os codigos.
const iso = d => (d ? new Date(d).toISOString() : '');
const isoData = d => (d ? new Date(d).toISOString().slice(0, 10) : '');
const lista = arr => (arr || []).join('; ');

// Cache por exportacao: nomes de usuarios da org (resolve ids).
async function contexto(db, organizacaoId) {
  const usuarios = await db.usuario.findMany({ where: { organizacaoId }, select: { id: true, nome: true } });
  const nomes = Object.fromEntries(usuarios.map(u => [u.id, u.nome]));
  return { nome: id => (id ? nomes[id] || id : '') };
}

const EXPORTADORES = {
  ropa: {
    arquivo: 'ropa-tratamentos', titulo: 'ROPA — tratamentos de dados',
    descricao: 'Registro das operações de tratamento (art. 37 LGPD), com sistemas, setor, compartilhamentos e situação do mapeamento.',
    colunas: [
      ['id', 'Identificador do tratamento'], ['nome', 'Nome do processo'], ['finalidade', 'Finalidade'],
      ['baseLegal', 'Base legal (LGPD, art. 7º) — rótulo com o artigo'], ['baseLegalSensivel', 'Base legal para dados sensíveis (LGPD, art. 11), quando houver'], ['categoriasDados', 'Categorias de dados pessoais (separadas por "; ")'],
      ['categoriasTitulares', 'Categorias de titulares'], ['setor', 'Setor responsável'], ['responsavel', 'Responsável (nome)'],
      ['retencaoDias', 'Prazo de retenção (dias)'], ['formaDescarte', 'Forma de descarte'], ['medidasSeguranca', 'Medidas de segurança'],
      ['sistemas', 'Sistemas do inventário utilizados'], ['outrosMeios', 'Meios fora do inventário (papel, físico)'],
      ['compartilhamentos', 'Compartilhamentos: terceiro (CNPJ) — finalidade — país — hipótese do art. 33 (se exterior)'], ['mapeado', 'Mapeamento completo (Sim/Não)'],
      ['pendencias', 'Campos que faltam para o mapeamento completo'], ['ativo', 'Tratamento ativo'], ['criadoEm', 'Criação (data e hora de Brasília)', 'datahora'], ['atualizadoEm', 'Última alteração (data e hora de Brasília)', 'datahora']
    ],
    async gerar(db, org, ctx) {
      const ts = await db.tratamento.findMany({
        where: { organizacaoId: org },
        include: { compartilhamentos: true, setor: true, sistemas: { include: { sistema: { select: { nome: true } } } } },
        orderBy: { nome: 'asc' }
      });
      const linhas = ts.map(t => {
        const pend = pendenciasMapeamento(t);
        return {
          id: t.id, nome: t.nome, finalidade: t.finalidade, baseLegal: rotuloBaseLegal(t.baseLegal), baseLegalSensivel: rotuloBaseLegal(t.baseLegalSensivel),
          categoriasDados: lista(normalizarCategorias(t.categoriasDados)), categoriasTitulares: lista(normalizarCategorias(t.categoriasTitulares)),
          setor: t.setor?.nome || '', responsavel: ctx.nome(t.responsavelId), retencaoDias: t.retencaoDias ?? '',
          formaDescarte: t.formaDescarte || '', medidasSeguranca: t.medidasSeguranca || '',
          sistemas: lista((t.sistemas || []).map(v => v.sistema?.nome)), outrosMeios: t.outrosMeios || '',
          compartilhamentos: lista(t.compartilhamentos.map(c => `${c.terceiroNome}${c.terceiroCNPJ ? ` (${c.terceiroCNPJ})` : ''} — ${c.finalidadeCompartilhamento} — ${c.paisDestino}${c.baseLegalTransferencia ? ` — ${R.rotulo(R.HIPOTESE_ART33, c.baseLegalTransferencia)}` : ''}`)),
          mapeado: pend.length === 0, pendencias: lista(pend), ativo: t.ativo, criadoEm: iso(t.criadoEm), atualizadoEm: iso(t.atualizadoEm)
        };
      });
      return { linhas, json: ts.map((t, i) => ({ ...t, baseLegalRotulo: linhas[i].baseLegal, baseLegalSensivelRotulo: linhas[i].baseLegalSensivel || null, responsavelNome: linhas[i].responsavel, mapeado: linhas[i].mapeado })) };
    }
  },

  descartes: {
    arquivo: 'ropa-descartes', titulo: 'Registros de descarte',
    descricao: 'Descartes de dados por tratamento do ROPA (retenção e descarte). As evidências estão em anexos/DESCARTE/.',
    colunas: [
      ['id', 'Identificador do descarte'], ['tratamentoId', 'Tratamento (id em ropa-tratamentos)'], ['tratamento', 'Nome do tratamento'],
      ['dataDescarte', 'Data do descarte', 'data'], ['metodo', 'Método'], ['quantidade', 'Quantidade de registros'],
      ['descricao', 'Descrição'], ['responsavel', 'Responsável (nome)'], ['criadoEm', 'Registro no sistema (data e hora de Brasília)', 'datahora']
    ],
    async gerar(db, org, ctx) {
      const ds = await db.registroDescarte.findMany({ where: { organizacaoId: org }, orderBy: { dataDescarte: 'desc' } });
      const trats = await db.tratamento.findMany({ where: { organizacaoId: org }, select: { id: true, nome: true } });
      const nomeTrat = Object.fromEntries(trats.map(t => [t.id, t.nome]));
      const linhas = ds.map(d => ({
        id: d.id, tratamentoId: d.tratamentoId, tratamento: nomeTrat[d.tratamentoId] || '', dataDescarte: isoData(d.dataDescarte),
        metodo: d.metodo, quantidade: d.quantidade ?? '', descricao: d.descricao, responsavel: ctx.nome(d.responsavelId), criadoEm: iso(d.criadoEm)
      }));
      return { linhas, json: ds };
    }
  },

  dsar: {
    arquivo: 'dsar-solicitacoes', titulo: 'Solicitações de titulares (DSAR)',
    descricao: 'Pedidos de titulares (art. 18 LGPD), prazos, respostas e providências. Contém dados pessoais dos titulares.',
    colunas: [
      ['id', 'Identificador'], ['protocolo', 'Protocolo'], ['titularNome', 'Nome do titular'], ['titularEmail', 'E-mail do titular'],
      ['titularCpf', 'CPF do titular (se informado)'], ['tipoDireito', 'Direito solicitado', R.TIPO_DIREITO], ['descricao', 'Descrição do pedido'],
      ['status', 'Situação', R.STATUS], ['situacaoPrazo', 'Situação do prazo'], ['dataRecebimento', 'Recebimento (data e hora de Brasília)', 'datahora'], ['dataLimite', 'Prazo legal (data e hora de Brasília)', 'datahora'],
      ['identidade', 'Verificação de identidade'],
      ['dataResposta', 'Resposta (data e hora de Brasília)', 'datahora'], ['noPrazo', 'Respondida até o prazo (Sim/Não; vazio se pendente)'],
      ['respostaTexto', 'Texto da resposta'], ['responsavel', 'Responsável (nome)'], ['providencias', 'Providências registradas: tipo — descrição']
    ],
    async gerar(db, org, ctx) {
      const ss = await db.solicitacaoTitular.findMany({ where: { organizacaoId: org }, include: { evidencias: true }, orderBy: { dataRecebimento: 'desc' } });
      const linhas = ss.map(s => ({
        id: s.id, protocolo: s.protocolo, titularNome: s.titularNome, titularEmail: s.titularEmail, titularCpf: s.titularCpf || '',
        tipoDireito: s.tipoDireito, descricao: s.descricao, status: s.status, dataRecebimento: iso(s.dataRecebimento),
        dataLimite: iso(s.dataLimite), dataResposta: iso(s.dataResposta),
        noPrazo: s.dataResposta ? (!s.dataLimite || new Date(s.dataResposta) <= new Date(s.dataLimite)) : '',
        situacaoPrazo: calcularSLA(s).label,
        identidade: (() => { const i = identidadeDe(s); return i.verificada ? `Verificada${i.metodo ? ' por ' + R.rotulo(R.METODO_IDENTIDADE, i.metodo) : ''} em ${fmtDataHora(i.em)}${i.observacao ? ' — ' + i.observacao : ''}` : 'Não verificada'; })(),
        respostaTexto: s.respostaTexto || '', responsavel: ctx.nome(s.responsavelId),
        providencias: lista((s.evidencias || []).map(e => `${R.rotulo(R.PROVIDENCIA_DSAR, e.tipo)} — ${e.descricao}`))
      }));
      return { linhas, json: ss };
    }
  },

  incidentes: {
    arquivo: 'incidentes', titulo: 'Incidentes de segurança',
    descricao: 'Incidentes reais e simulados, com severidade, providências e responsáveis. Evidências em anexos/INCIDENTE/.',
    colunas: [
      ['id', 'Identificador'], ['titulo', 'Título'], ['tipoRegistro', 'Real ou simulado', R.TIPO_REGISTRO], ['tipoIncidente', 'Tipo', R.TIPO_INCIDENTE],
      ['severidade', 'Severidade', R.NIVEL], ['status', 'Situação', R.STATUS], ['dataOcorrencia', 'Ocorrência', 'data'],
      ['dataDescoberta', 'Registro no sistema (data e hora de Brasília)', 'datahora'], ['dataCiencia', 'Ciência pela câmara', 'data'],
      ['riscoRelevante', 'Pode acarretar risco ou dano relevante aos titulares', R.RISCO_INCIDENTE],
      ['prazoComunicacao', 'Prazo de comunicação à ANPD e aos titulares (3 dias úteis da ciência; só incidente real com risco relevante)', 'data'],
      ['dataComunicacaoANPD', 'Comunicação à ANPD', 'data'], ['dataComunicacaoTitulares', 'Comunicação aos titulares', 'data'],
      ['dadosAfetados', 'Dados afetados'], ['qtdTitulares', 'Titulares afetados'],
      ['notificadoANPD', 'Comunicado à ANPD'], ['descricao', 'Descrição'], ['planoAcao', 'Medidas para evitar recorrência'],
      ['responsavel', 'Responsável (nome)'], ['providencias', 'Providências: data — descrição (responsável)']
    ],
    async gerar(db, org, ctx) {
      const is = await db.incidente.findMany({ where: { organizacaoId: org }, include: { providencias: true }, orderBy: { dataOcorrencia: 'desc' } });
      const linhas = is.map(i => ({
        id: i.id, titulo: i.titulo, tipoRegistro: i.tipoRegistro, tipoIncidente: i.tipoIncidente, severidade: i.severidade || '',
        status: i.status, dataOcorrencia: isoData(i.dataOcorrencia), dataDescoberta: iso(i.dataDescoberta),
        dataCiencia: isoData(i.dataCiencia), riscoRelevante: i.riscoRelevante || '', prazoComunicacao: prazoComunicacao(i)?.prazo || '',
        dataComunicacaoANPD: isoData(i.dataComunicacaoANPD), dataComunicacaoTitulares: isoData(i.dataComunicacaoTitulares),
        dadosAfetados: lista(normalizarCategorias(i.dadosAfetados)),
        qtdTitulares: i.qtdTitulares, notificadoANPD: i.notificadoANPD, descricao: i.descricao, planoAcao: i.planoAcao || '',
        responsavel: ctx.nome(i.responsavelId),
        providencias: lista((i.providencias || []).map(p => `${fmtData(p.data)} — ${p.descricao}${p.responsavelId ? ` (${ctx.nome(p.responsavelId)})` : ''}`))
      }));
      return { linhas, json: is };
    }
  },

  checklist: {
    arquivo: 'checklist-conformidade', titulo: 'Checklist de conformidade',
    descricao: 'Itens do catálogo global e atividades próprias da organização, com situação, responsável, prazo e evidência. Evidências em anexos/CHECKLIST_ITEM/.',
    colunas: [
      ['itemId', 'Identificador do item'], ['codigo', 'Código (catálogo) ou AP-nnn (atividade própria)'], ['origem', 'Catálogo ou atividade própria', R.ORIGEM_ITEM_CHECKLIST],
      ['categoria', 'Categoria'], ['titulo', 'Atividade'], ['descricao', 'Descrição'], ['fundamentoLegal', 'Fundamento legal'],
      ['criticidade', 'Criticidade', R.NIVEL], ['responsavelAtividade', 'Responsável pela atividade própria'], ['prazoAtividade', 'Prazo da atividade própria', 'data'],
      ['status', 'Situação (vazio se não respondido)', R.STATUS], ['observacao', 'Observação'],
      ['evidenciaUrl', 'Evidência (link/referência)'], ['responsavelResposta', 'Responsável pela resposta'],
      ['proximaRevisao', 'Próxima revisão', 'data'], ['respondidoEm', 'Última resposta (data e hora de Brasília)', 'datahora']
    ],
    async gerar(db, org, ctx) {
      const itens = codigosExibicao(await db.itemChecklist.findMany({ where: { OR: [{ organizacaoId: null }, { organizacaoId: org }] }, orderBy: { codigo: 'asc' } }));
      const resps = await db.respostaChecklist.findMany({ where: { organizacaoId: org } });
      const porItem = Object.fromEntries(resps.map(r => [r.itemId, r]));
      const linhas = itens.map(it => {
        const r = porItem[it.id];
        return {
          itemId: it.id, codigo: it.codigoExibicao, origem: it.organizacaoId ? 'PROPRIA' : 'GLOBAL', categoria: it.categoria, titulo: it.titulo,
          descricao: it.descricao, fundamentoLegal: it.fundamentoLegal, criticidade: it.criticidade,
          responsavelAtividade: ctx.nome(it.responsavelId), prazoAtividade: isoData(it.prazo),
          status: r?.status || '', observacao: r?.observacao || '', evidenciaUrl: r?.evidenciaUrl || '',
          responsavelResposta: ctx.nome(r?.responsavelId), proximaRevisao: isoData(r?.proximaRevisao), respondidoEm: iso(r?.atualizadoEm)
        };
      });
      return { linhas, json: itens.map(it => ({ ...it, resposta: porItem[it.id] || null })) };
    }
  },

  inventario: {
    arquivo: 'inventario-sistemas', titulo: 'Inventário de sistemas',
    descricao: 'Sistemas, bancos, serviços em nuvem e arquivos físicos que tratam dados pessoais, com hospedagem e integrações.',
    colunas: [
      ['id', 'Identificador'], ['nome', 'Nome'], ['tipo', 'Tipo', R.TIPO_SISTEMA], ['finalidade', 'Finalidade'], ['responsavel', 'Responsável (nome)'],
      ['fornecedor', 'Fornecedor (terceiro)'], ['categoriasDados', 'Categorias de dados'], ['formasCompartilhamento', 'Compartilhamento'],
      ['integracoes', 'Sistemas integrados'], ['tipoHospedagem', 'Hospedagem', R.HOSPEDAGEM], ['paisHospedagem', 'País'], ['regiaoHospedagem', 'Região/local'],
      ['tratamentos', 'Tratamentos do ROPA que usam o sistema'], ['ativo', 'Em uso']
    ],
    async gerar(db, org, ctx) {
      const ss = await db.sistemaInventario.findMany({
        where: { organizacaoId: org },
        include: { terceiro: { select: { razaoSocial: true } }, integracoesSaida: true, integracoesEntrada: true },
        orderBy: { nome: 'asc' }
      });
      const nomeSis = Object.fromEntries(ss.map(s => [s.id, s.nome]));
      const vinc = ss.length === 0 ? [] : await db.tratamentoSistema.findMany({ where: { sistemaId: { in: ss.map(s => s.id) } } });
      const trats = await db.tratamento.findMany({ where: { organizacaoId: org }, select: { id: true, nome: true } });
      const nomeTrat = Object.fromEntries(trats.map(t => [t.id, t.nome]));
      const linhas = ss.map(s => {
        const integ = new Set([...(s.integracoesSaida || []).map(i => i.destinoId), ...(s.integracoesEntrada || []).map(i => i.origemId)]);
        return {
          id: s.id, nome: s.nome, tipo: s.tipo, finalidade: s.finalidade || '', responsavel: ctx.nome(s.responsavelId),
          fornecedor: s.terceiro?.razaoSocial || '', categoriasDados: lista(normalizarCategorias(s.categoriasDados)), formasCompartilhamento: s.formasCompartilhamento || '',
          integracoes: lista([...integ].map(id => nomeSis[id]).filter(Boolean)), tipoHospedagem: s.tipoHospedagem || '',
          paisHospedagem: s.paisHospedagem || '', regiaoHospedagem: s.regiaoHospedagem || '',
          tratamentos: lista(vinc.filter(v => v.sistemaId === s.id).map(v => nomeTrat[v.tratamentoId]).filter(Boolean)), ativo: s.ativo
        };
      });
      return { linhas, json: ss };
    }
  },

  terceiros: {
    arquivo: 'terceiros-operadores', titulo: 'Terceiros e operadores',
    descricao: 'Fornecedores/operadores com contrato, aditivo LGPD, risco, respostas do questionário e plano de ação. Evidências em anexos/TERCEIRO/.',
    colunas: [
      ['id', 'Identificador'], ['razaoSocial', 'Razão social'], ['cnpj', 'CNPJ'], ['contatoNome', 'Contato'], ['contatoEmail', 'E-mail de contato'],
      ['papel', 'Papel na LGPD', R.PAPEL_TERCEIRO], ['descricaoServico', 'Serviço prestado'], ['contratoVigente', 'Contrato vigente'], ['contratoCritico', 'Contrato crítico'],
      ['aditivoLgpdAssinado', 'Aditivo LGPD assinado'], ['dataAditivo', 'Data do aditivo', 'data'], ['risco', 'Risco (vazio se não avaliado)', R.RISCO_TERCEIRO],
      ['riscoManual', 'Risco definido manualmente'], ['riscoJustificativa', 'Justificativa do risco manual'],
      ['respostasQuestionario', 'Respostas do questionário: pergunta — resposta (texto das perguntas no JSON)'],
      ['planoAcao', 'Ações: descrição — situação — prazo — responsável'], ['ativo', 'Ativo']
    ],
    async gerar(db, org, ctx) {
      const ts = await db.terceiro.findMany({ where: { organizacaoId: org }, include: { respostas: true, acoes: true }, orderBy: { razaoSocial: 'asc' } });
      const linhas = ts.map(t => ({
        id: t.id, razaoSocial: t.razaoSocial, cnpj: t.cnpj || '', contatoNome: t.contatoNome || '', contatoEmail: t.contatoEmail || '',
        papel: t.papel, descricaoServico: t.descricaoServico || '', contratoVigente: t.contratoVigente, contratoCritico: t.contratoCritico,
        aditivoLgpdAssinado: t.aditivoLgpdAssinado, dataAditivo: isoData(t.dataAditivo), risco: t.risco || '', riscoManual: t.riscoManual,
        riscoJustificativa: t.riscoJustificativa || '',
        respostasQuestionario: lista([...(t.respostas || [])].sort((a, b) => a.perguntaId.localeCompare(b.perguntaId)).map(r => `${r.perguntaId} — ${R.rotulo(R.RESPOSTA_QUESTIONARIO, r.resposta)}`)),
        planoAcao: lista((t.acoes || []).map(a => `${a.descricao} — ${R.rotulo(R.SITUACAO_ACAO, a.situacao)} — ${a.prazo ? fmtData(a.prazo) : 'sem prazo'} — ${ctx.nome(a.responsavelId) || 'sem responsável'}`)),
        ativo: t.ativo
      }));
      const { BLOCOS } = require('./questionarioTerceiro');
      return { linhas, json: { questionario: BLOCOS, terceiros: ts } };
    }
  },

  setores: {
    arquivo: 'setores', titulo: 'Setores',
    descricao: 'Setores da organização usados no ROPA.',
    colunas: [['id', 'Identificador'], ['nome', 'Nome'], ['ativo', 'Ativo']],
    async gerar(db, org) {
      const ss = await db.setor.findMany({ where: { organizacaoId: org }, orderBy: { nome: 'asc' } });
      return { linhas: ss.map(s => ({ id: s.id, nome: s.nome, ativo: s.ativo })), json: ss };
    }
  },

  treinamento: {
    arquivo: 'treinamento-progresso', titulo: 'Progresso e certificados de treinamento',
    descricao: 'Módulos concluídos por servidor (uma linha por módulo). Os certificados emitidos estão no JSON.',
    colunas: [['usuario', 'Servidor (nome)'], ['usuarioId', 'Id do servidor (ver usuarios)'], ['trilhaId', 'Trilha'], ['moduloId', 'Módulo'], ['concluidoEm', 'Conclusão (data e hora de Brasília)', 'datahora']],
    async gerar(db, org, ctx) {
      const ps = await db.progressoTreinamento.findMany({ where: { organizacaoId: org }, orderBy: { concluidoEm: 'asc' } });
      const certs = await db.certificadoTreinamento.findMany({ where: { organizacaoId: org } });
      return {
        linhas: ps.map(p => ({ usuario: ctx.nome(p.usuarioId), usuarioId: p.usuarioId, trilhaId: p.trilhaId, moduloId: p.moduloId, concluidoEm: iso(p.concluidoEm) })),
        json: { progresso: ps, certificados: certs }
      };
    }
  },

  usuarios: {
    arquivo: 'usuarios', titulo: 'Usuários',
    descricao: 'Usuários da organização (para resolver os ids citados nos demais arquivos). Não inclui senha nem segredo de MFA.',
    colunas: [['id', 'Identificador'], ['nome', 'Nome'], ['email', 'E-mail'], ['perfil', 'Perfil de acesso', R.PERFIL], ['ativo', 'Ativo'], ['excluido', 'Excluído (mantido por rastreabilidade)']],
    async gerar(db, org) {
      const us = await db.usuario.findMany({
        where: { organizacaoId: org }, select: { id: true, nome: true, email: true, perfil: true, ativo: true, deletedAt: true, criadoEm: true }, orderBy: { nome: 'asc' }
      });
      return { linhas: us.map(u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo, excluido: !!u.deletedAt })), json: us };
    }
  },

  historico: {
    arquivo: 'historico-alteracoes', titulo: 'Histórico de alterações',
    descricao: 'Trilha de quem alterou o quê em cada registro (diff campo a campo em JSON).',
    colunas: [
      ['id', 'Identificador'], ['entidade', 'Tipo do registro', R.ENTIDADE], ['registroId', 'Id do registro'], ['acao', 'Operação', R.ACAO_HISTORICO],
      ['usuario', 'Quem fez (nome; vazio = canal público, sistema ou administrador)'], ['alteracoes', 'Alterações: campo: antes → depois (no JSON, o diff completo)'], ['criadoEm', 'Quando (data e hora de Brasília)', 'datahora']
    ],
    async gerar(db, org, ctx) {
      const hs = await db.historicoRegistro.findMany({ where: { organizacaoId: org }, orderBy: { criadoEm: 'asc' } });
      return {
        linhas: hs.map(h => ({ id: h.id, entidade: h.entidade, registroId: h.registroId, acao: h.acao, usuario: ctx.nome(h.usuarioId), alteracoes: diffLegivel(h, ctx), criadoEm: iso(h.criadoEm) })),
        json: hs
      };
    }
  },

  indicadores: {
    arquivo: 'indicadores-snapshots', titulo: 'Indicadores — fotos mensais',
    descricao: 'Fotos mensais do painel de indicadores (N/Total, %, meta e situação de cada indicador).',
    colunas: [
      ['mesReferencia', 'Mês (AAAA-MM)'], ['origem', 'Foto automática ou manual', R.ORIGEM_SNAPSHOT], ['geradoEm', 'Geração (data e hora de Brasília)', 'datahora'],
      ['indicador', 'Indicador', R.INDICADOR], ['n', 'Quantidade que atende'], ['total', 'Total considerado'], ['percentual', 'Percentual'],
      ['meta', 'Meta (%)'], ['status', 'Situação', R.STATUS_INDICADOR], ['incidentesReaisNoMes', 'Incidentes reais no mês (só no indicador de incidentes)'],
      ['ultimoSimulado', 'Último simulado (só no indicador de incidentes)', 'datahora'], ['observacao', 'Observação']
    ],
    async gerar(db, org) {
      const ss = await db.snapshotIndicadores.findMany({ where: { organizacaoId: org }, orderBy: { mesReferencia: 'desc' } });
      const linhas = [];
      for (const s of ss) for (const i of s.valores?.indicadores || []) linhas.push(linhaIndicador(i, s));
      return { linhas, json: ss };
    }
  }
};

function linhaIndicador(i, snap = {}) {
  return {
    mesReferencia: snap.mesReferencia || '', origem: snap.origem || 'ATUAL', geradoEm: iso(snap.geradoEm || new Date()),
    indicador: i.chave, n: i.n ?? '', total: i.total ?? '', percentual: i.percentual ?? '', meta: i.meta ?? '', status: i.status,
    incidentesReaisNoMes: i.incidentesReaisNoMes ?? '', ultimoSimulado: iso(i.ultimoSimulado), observacao: i.observacao || ''
  };
}

// Historico em texto: "Campo: antes → depois" com rotulos (Etapa 7b)
function diffLegivel(h, ctx) {
  const v = (campo, x) => {
    if (x === null || x === undefined || x === '') return '—';
    if (['responsavelId', 'validadoPor', 'autorId', 'excluidoPorId'].includes(campo)) return ctx.nome(x) || 'usuário removido';
    if (typeof x === 'boolean') return x ? 'Sim' : 'Não';
    if (Array.isArray(x)) return x.map(y => v(campo, y)).join(', ') || '—';
    if (typeof x === 'object') return JSON.stringify(x);
    const r = campo === 'baseLegal' || campo === 'baseLegalSensivel' ? rotuloBaseLegal(x) : R.rotuloValorCampo(campo, x, h.entidade);
    if (r) return r;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x)) return /T00:00:00\.000Z$/.test(x) ? fmtData(x) : fmtDataHora(x);
    return String(x);
  };
  return Object.entries(h.diff || {}).map(([campo, d]) => {
    const nome = R.CAMPOS[campo] || (campo.startsWith('questionario.') ? `Questionário — ${campo.slice(13)}` : campo);
    return `${nome}: ${v(campo, d?.antes)} → ${v(campo, d?.depois)}`;
  }).join('; ');
}

// Etapa 7b: valor da celula — data/hora em Brasilia, rotulo no lugar do
// codigo, Sim/Nao no lugar de true/false.
function valorCsv(v, tipo) {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'datahora') return fmtDataHoraCsv(v);
  if (tipo === 'data') return fmtData(v);
  if (tipo && typeof tipo === 'object') return tipo[v] || v;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return v;
}

// CSV: UTF-8 com BOM (Excel), separador ";", cabecalho legivel (a
// descricao da coluna; a chave do JSON esta no dicionario de dados).
// Celulas neutralizadas contra formula (Etapa 7a).
function paraCsv(colunas, linhas) {
  const cab = colunas.map(([c, desc]) => desc || c);
  const corpo = linhas.map(l => colunas.map(([c, , tipo]) => valorCsv(l[c], tipo)));
  return documentoCsv(cab, corpo);
}

async function gerarExport(db, nome, organizacaoId, ctx) {
  const ex = EXPORTADORES[nome];
  const c = ctx || await contexto(db, organizacaoId);
  const { linhas, json } = await ex.gerar(db, organizacaoId, c);
  return { ex, linhas, json, csv: paraCsv(ex.colunas, linhas) };
}

// Responde ?formato=csv|json (padrao json) com download.
async function responderExport(res, db, nome, organizacaoId, formato) {
  const { ex, json, csv } = await gerarExport(db, nome, organizacaoId);
  const data = new Date().toISOString().slice(0, 10);
  if (formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ex.arquivo}-${data}.csv"`);
    return res.send(csv);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${ex.arquivo}-${data}.json"`);
  return res.json(json);
}

module.exports = { EXPORTADORES, paraCsv, valorCsv, diffLegivel, gerarExport, responderExport, contexto, linhaIndicador };
