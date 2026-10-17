// Painel de indicadores (item X do TR). Tudo calculado direto do banco.
//
// Cada indicador devolve: n, total, percentual, meta, ok, status
// (OK | PENDENTE | INATIVO), observacao e link (para a tela de origem).
// INATIVO = modulo de origem desligado para a organizacao.

const { TRILHAS_BASE } = require('../routes/treinamento');
const { temDadoSensivel, ART11 } = require('./basesLegais');

// Metas padrao (%) quando a organizacao nao cadastrou MetaIndicador.
// As metas definitivas vao no Plano de Trabalho.
const METAS_PADRAO = { ROPA: 100, CONTRATOS: 100, TREINAMENTOS: 80, DSAR: 100 };
const INDICADORES_COM_META = Object.keys(METAS_PADRAO);

// Trilha obrigatoria para o indicador de treinamento: a de nivel Basico
// (hoje "Introducao a LGPD"). Trocar aqui se o Plano de Trabalho definir outra.
const NIVEL_TRILHA_OBRIGATORIA = 'Básico';
const TRILHA_OBRIGATORIA = TRILHAS_BASE.find(t => t.nivel === NIVEL_TRILHA_OBRIGATORIA);

// Janela do simulado de incidente para o indicador ficar OK.
const JANELA_SIMULADO_DIAS = 365;
const DIA_MS = 24 * 60 * 60 * 1000;

// Meses no fuso de Brasilia. Desde 2019 nao ha horario de verao, entao o
// deslocamento e fixo em -03:00.
const OFFSET_BRT_MS = 3 * 60 * 60 * 1000;

function mesReferenciaDe(data) {
  const brt = new Date(new Date(data).getTime() - OFFSET_BRT_MS);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
}

// [inicio, fim) do mes "AAAA-MM" em horario de Brasilia, como instantes UTC.
function limitesDoMes(mesReferencia) {
  const [ano, mes] = mesReferencia.split('-').map(Number);
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1) + OFFSET_BRT_MS),
    fim: new Date(Date.UTC(ano, mes, 1) + OFFSET_BRT_MS)
  };
}

function mesAnterior(mesReferencia) {
  const [ano, mes] = mesReferencia.split('-').map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
}

// ROPA: "mapeado" = finalidade, base legal, >= 1 categoria de dados, setor,
// responsavel, retencao e (>= 1 sistema vinculado OU outrosMeios).
// Devolve a lista do que falta (a tela mostra).
function pendenciasMapeamento(t) {
  const falta = [];
  if (!t.finalidade || !String(t.finalidade).trim()) falta.push('finalidade');
  if (!t.baseLegal) falta.push('base legal');
  // Dado sensivel (art. 5, II) exige tambem uma hipotese do art. 11
  if (temDadoSensivel(t.categoriasDados) && !ART11.includes(t.baseLegalSensivel)) falta.push('base legal do art. 11 (dados sensíveis)');
  if (!(t.categoriasDados || []).length) falta.push('categorias de dados');
  if (!t.setorId) falta.push('setor');
  if (!t.responsavelId) falta.push('responsável');
  if (!t.retencaoDias) falta.push('retenção');
  const temSistema = (t.sistemas || []).length > 0;
  const temOutros = !!(t.outrosMeios && String(t.outrosMeios).trim());
  if (!temSistema && !temOutros) falta.push('sistemas ou outros meios');
  return falta;
}

// Etapa 7b: pendente por falta de setor ou de sistema (sem sistema do
// inventario e sem "outros meios") — o atalho do painel filtra esses.
function faltaSetorOuSistema(t) {
  const p = pendenciasMapeamento(t);
  return p.includes('setor') || p.includes('sistemas ou outros meios');
}

function percentual(n, total) {
  return total === 0 ? null : Math.round((n / total) * 100);
}

// n/total >= meta%, sem erro de arredondamento.
function atingiu(n, total, meta) {
  return n * 100 >= meta * total;
}

async function carregarMetas(db, organizacaoId) {
  const linhas = await db.metaIndicador.findMany({ where: { organizacaoId } });
  const metas = { ...METAS_PADRAO };
  const personalizadas = {};
  for (const l of linhas) {
    if (INDICADORES_COM_META.includes(l.indicador)) {
      metas[l.indicador] = l.percentualMeta;
      personalizadas[l.indicador] = true;
    }
  }
  return { metas, personalizadas };
}

function indicadorPercentual({ chave, titulo, n, total, meta, okSemTotal, observacao, link }) {
  const ok = total === 0 ? okSemTotal : atingiu(n, total, meta);
  return { chave, titulo, n, total, percentual: percentual(n, total), meta, ok, status: ok ? 'OK' : 'PENDENTE', observacao, link };
}

function inativo(chave, titulo, modulo) {
  return { chave, titulo, n: null, total: null, percentual: null, meta: null, ok: null, status: 'INATIVO', observacao: `Módulo "${modulo}" desligado`, link: null };
}

// referencia: qualquer instante do mes a calcular (padrao: agora).
// agora: relogio usado para "vencido"/"ultimos 12 meses" (padrao: agora).
// O corte efetivo e o menor entre "agora" e o fim do mes de referencia —
// a foto de um mes fechado olha o mes como estava no ultimo instante dele.
async function calcularIndicadores(db, organizacaoId, { referencia = new Date(), agora } = {}) {
  const mesReferencia = mesReferenciaDe(referencia);
  const { inicio, fim } = limitesDoMes(mesReferencia);
  const corte = new Date(Math.min((agora || new Date()).getTime(), fim.getTime() - 1));
  const org = await db.organizacao.findUnique({ where: { id: organizacaoId }, select: { modulosAtivos: true } });
  const modulos = org?.modulosAtivos || [];
  const { metas, personalizadas } = await carregarMetas(db, organizacaoId);
  const indicadores = [];

  // a) ROPA — vazio conta como PENDENTE (nada mapeado)
  if (modulos.includes('ropa')) {
    const trats = await db.tratamento.findMany({
      where: { organizacaoId, ativo: true },
      include: { sistemas: true }
    });
    const n = trats.filter(t => pendenciasMapeamento(t).length === 0).length;
    const semSetorOuSistema = trats.filter(faltaSetorOuSistema).length;
    indicadores.push({
      ...indicadorPercentual({
        chave: 'ROPA', titulo: 'Processos mapeados no ROPA', n, total: trats.length, meta: metas.ROPA, okSemTotal: false,
        observacao: trats.length === 0 ? 'Nenhum tratamento ativo cadastrado' : `${trats.length - n} tratamento(s) com campos pendentes`,
        link: { pagina: 'ropa', filtro: 'nao-mapeados' }
      }),
      pendentesSetorSistema: semSetorOuSistema,
      linkSetorSistema: { pagina: 'ropa', filtro: 'sem-setor-sistema' }
    });
  } else indicadores.push(inativo('ROPA', 'Processos mapeados no ROPA', 'ropa'));

  // b) Contratos criticos com aditivo LGPD — sem contrato critico = OK
  if (modulos.includes('terceiros')) {
    const criticos = await db.terceiro.findMany({
      where: { organizacaoId, ativo: true, contratoCritico: true }, select: { aditivoLgpdAssinado: true }
    });
    const n = criticos.filter(t => t.aditivoLgpdAssinado).length;
    indicadores.push(indicadorPercentual({
      chave: 'CONTRATOS', titulo: 'Contratos críticos com aditivo LGPD', n, total: criticos.length, meta: metas.CONTRATOS, okSemTotal: true,
      observacao: criticos.length === 0 ? 'Nenhum contrato crítico cadastrado' : `${criticos.length - n} sem aditivo assinado`,
      link: { pagina: 'terceiros', filtro: 'criticos-sem-aditivo' }
    }));
  } else indicadores.push(inativo('CONTRATOS', 'Contratos críticos com aditivo LGPD', 'terceiros'));

  // c) Treinamento obrigatorio concluido
  if (modulos.includes('treinamento') && TRILHA_OBRIGATORIA) {
    const usuarios = await db.usuario.findMany({
      where: { organizacaoId, ativo: true, deletedAt: null }, select: { id: true }
    });
    const progressos = await db.progressoTreinamento.findMany({
      where: { organizacaoId, trilhaId: TRILHA_OBRIGATORIA.id }, select: { usuarioId: true, moduloId: true }
    });
    const modulosTrilha = new Set(TRILHA_OBRIGATORIA.modulos.map(m => m.moduloId));
    const feitos = {};
    for (const p of progressos) if (modulosTrilha.has(p.moduloId)) (feitos[p.usuarioId] = feitos[p.usuarioId] || new Set()).add(p.moduloId);
    const n = usuarios.filter(u => (feitos[u.id]?.size || 0) === modulosTrilha.size).length;
    indicadores.push(indicadorPercentual({
      chave: 'TREINAMENTOS', titulo: `Servidores com a trilha "${TRILHA_OBRIGATORIA.titulo}" concluída`, n, total: usuarios.length,
      meta: metas.TREINAMENTOS, okSemTotal: false,
      observacao: `${usuarios.length - n} servidor(es) sem concluir`,
      link: { pagina: 'treinamento', filtro: 'obrigatoria-pendente', trilhaId: TRILHA_OBRIGATORIA.id }
    }));
  } else indicadores.push(inativo('TREINAMENTOS', 'Servidores com treinamento obrigatório concluído', 'treinamento'));

  // d) DSAR no prazo no mes (por data de recebimento).
  //    No prazo = respondida ate a dataLimite (ou respondida antes de o
  //    prazo comecar a contar). Atrasada = respondida depois do prazo OU
  //    sem resposta com prazo ja vencido. Pendente dentro do prazo e
  //    canceladas ficam fora da conta. Sem solicitacoes no mes = OK.
  if (modulos.includes('dsar')) {
    const sols = await db.solicitacaoTitular.findMany({
      where: { organizacaoId, dataRecebimento: { gte: inicio, lt: fim } },
      select: { status: true, dataLimite: true, dataResposta: true }
    });
    let noPrazo = 0, atrasadas = 0, emAndamento = 0;
    for (const s of sols) {
      if (s.status === 'CANCELADA') continue;
      if (s.dataResposta) {
        if (!s.dataLimite || new Date(s.dataResposta) <= new Date(s.dataLimite)) noPrazo++;
        else atrasadas++;
      } else if (s.dataLimite && new Date(s.dataLimite) < corte) atrasadas++;
      else emAndamento++;
    }
    const total = noPrazo + atrasadas;
    const dsar = indicadorPercentual({
      chave: 'DSAR', titulo: 'Solicitações de titulares atendidas no prazo (mês)', n: noPrazo, total, meta: metas.DSAR, okSemTotal: true,
      observacao: `${atrasadas} atrasada(s); ${emAndamento} em andamento dentro do prazo (não contam)`,
      link: { pagina: 'dsar', filtro: 'mes', mes: mesReferencia }
    });
    // Nada a medir no mes: selo neutro (nem OK nem Pendente)
    if (total === 0) Object.assign(dsar, { ok: null, status: 'SEM_DADOS', observacao: emAndamento ? `Sem solicitações concluídas ou vencidas no mês; ${emAndamento} em andamento dentro do prazo` : 'Sem solicitações no mês' });
    indicadores.push({ ...dsar, emAndamento });
  } else indicadores.push(inativo('DSAR', 'Solicitações de titulares atendidas no prazo (mês)', 'dsar'));

  // e) Incidentes reais no mes + ultimo simulado. OK = simulado nos ultimos
  //    12 meses (ate o corte). Sem meta percentual.
  if (modulos.includes('repositorio')) {
    const [reais, simulados] = await Promise.all([
      db.incidente.count({ where: { organizacaoId, tipoRegistro: 'REAL', dataOcorrencia: { gte: inicio, lt: fim } } }),
      db.incidente.findMany({
        where: { organizacaoId, tipoRegistro: 'SIMULADO', dataOcorrencia: { lte: corte } },
        orderBy: { dataOcorrencia: 'desc' }, take: 1, select: { dataOcorrencia: true }
      })
    ]);
    const ultimoSimulado = simulados[0]?.dataOcorrencia || null;
    const ok = !!ultimoSimulado && new Date(ultimoSimulado).getTime() >= corte.getTime() - JANELA_SIMULADO_DIAS * DIA_MS;
    indicadores.push({
      chave: 'INCIDENTES', titulo: 'Incidentes no mês e último simulado',
      incidentesReaisNoMes: reais, ultimoSimulado, n: null, total: null, percentual: null, meta: null,
      ok, status: ok ? 'OK' : 'PENDENTE',
      observacao: ultimoSimulado ? (ok ? 'Simulado nos últimos 12 meses' : 'Último simulado há mais de 12 meses') : 'Nenhum simulado registrado',
      link: { pagina: 'incidentes', filtro: 'SIMULADO' }
    });
  } else indicadores.push(inativo('INCIDENTES', 'Incidentes no mês e último simulado', 'repositorio'));

  return { mesReferencia, geradoEm: new Date(), metasPersonalizadas: personalizadas, indicadores };
}

// Grava (ou substitui) a foto do mes. origem: CRON | MANUAL.
async function gerarSnapshot(db, organizacaoId, { referencia = new Date(), agora, origem = 'MANUAL', usuarioId = null } = {}) {
  const resultado = await calcularIndicadores(db, organizacaoId, { referencia, agora });
  const dados = { valores: resultado, origem, geradoPorId: usuarioId, geradoEm: new Date() };
  return db.snapshotIndicadores.upsert({
    where: { organizacaoId_mesReferencia: { organizacaoId, mesReferencia: resultado.mesReferencia } },
    create: { organizacaoId, mesReferencia: resultado.mesReferencia, ...dados },
    update: dados
  });
}

// Cron do dia 1: foto do mes ANTERIOR para todas as organizacoes ativas.
async function gerarSnapshotsMensais(db, agora = new Date()) {
  const mes = mesAnterior(mesReferenciaDe(agora));
  const { fim } = limitesDoMes(mes);
  const referencia = new Date(fim.getTime() - 1);
  const orgs = await db.organizacao.findMany({ where: { ativo: true }, select: { id: true } });
  const gerados = [];
  for (const o of orgs) {
    try {
      gerados.push(await gerarSnapshot(db, o.id, { referencia, agora, origem: 'CRON' }));
    } catch (err) {
      console.error(`[indicadores] falha snapshot org ${o.id}:`, err.message);
    }
  }
  return { mesReferencia: mes, gerados: gerados.length };
}

module.exports = {
  faltaSetorOuSistema,
  METAS_PADRAO, INDICADORES_COM_META, NIVEL_TRILHA_OBRIGATORIA, TRILHA_OBRIGATORIA,
  calcularIndicadores, gerarSnapshot, gerarSnapshotsMensais, carregarMetas,
  pendenciasMapeamento, mesReferenciaDe, limitesDoMes, mesAnterior
};
