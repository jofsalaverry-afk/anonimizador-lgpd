const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const ind = require('../src/services/indicadores');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

function chamar(token, metodo, caminho, body) {
  return fetch(`${srv.base}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) })
  });
}
const pega = (r, chave) => r.indicadores.find(i => i.chave === chave);
const TODOS = ['anonimizador', 'ropa', 'dsar', 'repositorio', 'treinamento', 'checklist', 'pesquisa', 'inventario', 'terceiros'];
// Referencia fixa: 20/10/2026 (mes 2026-10 em horario de Brasilia)
const REF = new Date('2026-10-20T15:00:00Z');

test('meses em horario de Brasilia', () => {
  assert.equal(ind.mesReferenciaDe(new Date('2026-11-01T02:59:00Z')), '2026-10', '23:59 BRT de 31/10 ainda e outubro');
  assert.equal(ind.mesReferenciaDe(new Date('2026-11-01T03:00:00Z')), '2026-11');
  assert.equal(ind.mesAnterior('2026-01'), '2025-12');
  const { inicio, fim } = ind.limitesDoMes('2026-10');
  assert.equal(inicio.toISOString(), '2026-10-01T03:00:00.000Z');
  assert.equal(fim.toISOString(), '2026-11-01T03:00:00.000Z');
});

test('borda: organizacao sem nenhum registro e sem meta', async () => {
  const org = await db.organizacao.create({ data: { nome: 'Câmara Vazia', cnpj: '9', ativo: true, modulosAtivos: TODOS } });
  await db.usuario.create({ data: { email: 'unico@teste.local', senhaHash: 'x', nome: 'Único', perfil: 'GESTOR', ativo: true, organizacaoId: org.id } });
  const r = await ind.calcularIndicadores(db, org.id, { referencia: REF, agora: REF });

  assert.deepEqual(pega(r, 'ROPA'), { ...pega(r, 'ROPA'), n: 0, total: 0, percentual: null, meta: 100, status: 'PENDENTE' });
  assert.equal(pega(r, 'CONTRATOS').status, 'OK', 'sem contrato crítico = nada pendente');
  assert.equal(pega(r, 'CONTRATOS').percentual, null);
  assert.deepEqual([pega(r, 'TREINAMENTOS').n, pega(r, 'TREINAMENTOS').total, pega(r, 'TREINAMENTOS').meta], [0, 1, 80]);
  assert.equal(pega(r, 'TREINAMENTOS').status, 'PENDENTE');
  assert.equal(pega(r, 'DSAR').status, 'OK', 'sem solicitação no mês');
  assert.equal(pega(r, 'DSAR').meta, 100);
  assert.equal(pega(r, 'INCIDENTES').incidentesReaisNoMes, 0);
  assert.equal(pega(r, 'INCIDENTES').ultimoSimulado, null);
  assert.equal(pega(r, 'INCIDENTES').status, 'PENDENTE', 'sem simulado');
  assert.deepEqual(r.metasPersonalizadas, {});
});

test('modulo desligado = INATIVO', async () => {
  const org = await db.organizacao.create({ data: { nome: 'Câmara Só ROPA', cnpj: '8', ativo: true, modulosAtivos: ['ropa'] } });
  const r = await ind.calcularIndicadores(db, org.id, { referencia: REF, agora: REF });
  assert.deepEqual(r.indicadores.map(i => [i.chave, i.status]), [
    ['ROPA', 'PENDENTE'], ['CONTRATOS', 'INATIVO'], ['TREINAMENTOS', 'INATIVO'], ['DSAR', 'INATIVO'], ['INCIDENTES', 'INATIVO']
  ]);
});

test('ROPA: regra de mapeado e meta personalizada (com historico)', async () => {
  const org = s.orgA.id;
  const setor = await db.setor.create({ data: { organizacaoId: org, nome: 'RH' } });
  const sis = await db.sistemaInventario.create({ data: { organizacaoId: org, nome: 'Folha', tipo: 'APLICACAO' } });
  const base = { organizacaoId: org, finalidade: 'x', baseLegal: 'OBRIGACAO_LEGAL', categoriasDados: ['Nome'], setorId: setor.id, responsavelId: s.dpoA.id, retencaoDias: 365, ativo: true };
  await db.tratamento.create({ data: { ...base, nome: 'Completo com papel', outrosMeios: 'Fichas' } });
  const comSistema = await db.tratamento.create({ data: { ...base, nome: 'Completo com sistema' } });
  await db.tratamentoSistema.create({ data: { tratamentoId: comSistema.id, sistemaId: sis.id } });
  await db.tratamento.create({ data: { ...base, nome: 'Sem setor', setorId: null, outrosMeios: 'x' } });
  await db.tratamento.create({ data: { ...base, nome: 'Inativo', ativo: false, outrosMeios: 'x' } });
  // + tratamentoA do seed (incompleto) => 2 mapeados / 4 ativos

  const r = await ind.calcularIndicadores(db, org, { referencia: REF, agora: REF });
  assert.deepEqual([pega(r, 'ROPA').n, pega(r, 'ROPA').total, pega(r, 'ROPA').percentual, pega(r, 'ROPA').status], [2, 4, 50, 'PENDENTE']);
  assert.deepEqual(pega(r, 'ROPA').link, { pagina: 'ropa', filtro: 'nao-mapeados' });

  // lista do ROPA traz a mesma regra (base do link "nao mapeados")
  const lista = await (await chamar(tokenDe(s.gestorA), 'GET', '/ropa/tratamentos')).json();
  assert.deepEqual(lista.find(t => t.nome === 'Sem setor').pendenciasMapeamento, ['setor']);
  assert.equal(lista.filter(t => t.ativo && t.mapeado).length, 2);

  assert.equal((await chamar(tokenDe(s.auditorA), 'PUT', '/indicadores/metas', { metas: { ROPA: 50 } })).status, 403);
  assert.equal((await chamar(tokenDe(s.gestorA), 'PUT', '/indicadores/metas', { metas: { ROPA: 150 } })).status, 400);
  assert.equal((await chamar(tokenDe(s.gestorA), 'PUT', '/indicadores/metas', { metas: { XPTO: 50 } })).status, 400);
  assert.equal((await chamar(tokenDe(s.gestorA), 'PUT', '/indicadores/metas', { metas: { ROPA: 50 } })).status, 200);
  const r2 = await ind.calcularIndicadores(db, org, { referencia: REF, agora: REF });
  assert.equal(pega(r2, 'ROPA').meta, 50);
  assert.equal(pega(r2, 'ROPA').status, 'OK', '50% atinge meta de 50%');
  const h = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'METAS_INDICADORES' && x.registroId === org);
  assert.deepEqual(h[0].diff.metaROPA, { antes: 100, depois: 50 });
});

test('contratos criticos com aditivo', async () => {
  const org = s.orgA.id;
  const t = (dados) => db.terceiro.create({ data: { organizacaoId: org, razaoSocial: 'T', ...dados } });
  await t({ contratoCritico: true, aditivoLgpdAssinado: true });
  await t({ contratoCritico: true, aditivoLgpdAssinado: true });
  await t({ contratoCritico: true, aditivoLgpdAssinado: false });
  await t({ contratoCritico: false, aditivoLgpdAssinado: false });
  await t({ contratoCritico: true, aditivoLgpdAssinado: false, ativo: false });
  const r = await ind.calcularIndicadores(db, org, { referencia: REF, agora: REF });
  assert.deepEqual([pega(r, 'CONTRATOS').n, pega(r, 'CONTRATOS').total, pega(r, 'CONTRATOS').percentual, pega(r, 'CONTRATOS').status], [2, 3, 67, 'PENDENTE']);
});

test('treinamento obrigatorio (nivel Basico) por servidor ativo', async () => {
  const org = s.orgA.id;
  assert.equal(ind.TRILHA_OBRIGATORIA.id, 'introducao-lgpd');
  const tr = ind.TRILHA_OBRIGATORIA.id;
  for (const m of ['o-que-e-lgpd', 'principios-lgpd']) {
    await db.progressoTreinamento.create({ data: { usuarioId: s.dpoA.id, organizacaoId: org, trilhaId: tr, moduloId: m } });
  }
  await db.progressoTreinamento.create({ data: { usuarioId: s.gestorA.id, organizacaoId: org, trilhaId: tr, moduloId: 'o-que-e-lgpd' } });
  // concluiu outra trilha: nao conta
  await db.progressoTreinamento.create({ data: { usuarioId: s.auditorA.id, organizacaoId: org, trilhaId: 'direitos-titulares', moduloId: 'direitos-do-titular' } });
  // excluido nao entra no total
  await db.usuario.create({ data: { email: 'ex@teste.local', senhaHash: 'x', nome: 'Ex', perfil: 'OPERADOR', ativo: false, deletedAt: new Date(), organizacaoId: org } });
  const r = await ind.calcularIndicadores(db, org, { referencia: REF, agora: REF });
  assert.deepEqual([pega(r, 'TREINAMENTOS').n, pega(r, 'TREINAMENTOS').total, pega(r, 'TREINAMENTOS').status], [1, 3, 'PENDENTE']);
  assert.equal(pega(r, 'TREINAMENTOS').link.filtro, 'obrigatoria-pendente');
});

test('DSAR no prazo no mes: pendente dentro do prazo e cancelada nao contam', async () => {
  const org = s.orgA.id;
  let n = 0;
  const sol = (dados) => db.solicitacaoTitular.create({ data: {
    organizacaoId: org, protocolo: `P-${++n}`, titularNome: 'T', titularEmail: 't@teste.local', tipoDireito: 'ACESSO', descricao: 'x', ...dados
  } });
  const d = iso => new Date(iso);
  await sol({ status: 'RESPONDIDA', dataRecebimento: d('2026-10-02T12:00Z'), dataLimite: d('2026-10-17T12:00Z'), dataResposta: d('2026-10-10T12:00Z') }); // no prazo
  await sol({ status: 'RESPONDIDA', dataRecebimento: d('2026-10-01T12:00Z'), dataLimite: d('2026-10-16T12:00Z'), dataResposta: d('2026-10-18T12:00Z') }); // atrasada
  await sol({ status: 'EM_ANALISE', dataRecebimento: d('2026-10-03T12:00Z'), dataLimite: d('2026-10-18T12:00Z') }); // vencida sem resposta
  await sol({ status: 'EM_ANALISE', dataRecebimento: d('2026-10-15T12:00Z'), dataLimite: d('2026-10-30T12:00Z') }); // dentro do prazo
  await sol({ status: 'AGUARDANDO_VERIFICACAO', dataRecebimento: d('2026-10-19T12:00Z') }); // prazo nao comecou
  await sol({ status: 'CANCELADA', dataRecebimento: d('2026-10-05T12:00Z'), dataLimite: d('2026-10-06T12:00Z') });
  await sol({ status: 'RESPONDIDA', dataRecebimento: d('2026-09-25T12:00Z'), dataLimite: d('2026-10-10T12:00Z'), dataResposta: d('2026-10-15T12:00Z') }); // mes anterior
  const r = await ind.calcularIndicadores(db, org, { referencia: REF, agora: REF });
  const x = pega(r, 'DSAR');
  assert.deepEqual([x.n, x.total, x.percentual, x.status, x.emAndamento], [1, 3, 33, 'PENDENTE', 2]);
  assert.deepEqual(x.link, { pagina: 'dsar', filtro: 'mes', mes: '2026-10' });
});

test('incidentes reais no mes e janela de 12 meses do simulado', async () => {
  const org = s.orgA.id;
  const inc = (dados) => db.incidente.create({ data: { organizacaoId: org, titulo: 'I', tipoIncidente: 'OUTRO', descricao: 'x', ...dados } });
  await inc({ tipoRegistro: 'REAL', dataOcorrencia: new Date('2026-10-05T12:00Z') });
  await inc({ tipoRegistro: 'REAL', dataOcorrencia: new Date('2026-10-19T12:00Z') });
  await inc({ tipoRegistro: 'REAL', dataOcorrencia: new Date('2026-09-30T12:00Z') });
  await inc({ tipoRegistro: 'SIMULADO', dataOcorrencia: new Date('2026-03-01T12:00Z') });
  // (incidenteA do seed: REAL em 2026-10-01 00:00Z = 30/09 21h BRT -> setembro)
  const r = await ind.calcularIndicadores(db, org, { referencia: REF, agora: REF });
  const x = pega(r, 'INCIDENTES');
  assert.equal(x.incidentesReaisNoMes, 2);
  assert.equal(new Date(x.ultimoSimulado).toISOString().slice(0, 10), '2026-03-01');
  assert.equal(x.status, 'OK');
  const depois = await ind.calcularIndicadores(db, org, { referencia: new Date('2027-04-10T12:00Z'), agora: new Date('2027-04-10T12:00Z') });
  assert.equal(pega(depois, 'INCIDENTES').status, 'PENDENTE', 'simulado com mais de 12 meses');
});

test('painel pela API: isolado por organizacao', async () => {
  const rA = await (await chamar(tokenDe(s.gestorA), 'GET', '/indicadores')).json();
  const rB = await (await chamar(tokenDe(s.gestorB), 'GET', '/indicadores')).json();
  assert.ok(pega(rA, 'ROPA').total >= 4);
  assert.equal(pega(rB, 'ROPA').total, 0);
  assert.equal(pega(rB, 'CONTRATOS').total, 0);
  assert.equal(pega(rB, 'TREINAMENTOS').total, 1, 'so o Gestor B');
  assert.equal(pega(rB, 'ROPA').meta, 100, 'meta da A nao vaza para B');
});

test('snapshot mensal: cron grava o mes anterior; manual faz upsert; isolado', async () => {
  const r = await ind.gerarSnapshotsMensais(db, new Date('2026-11-01T04:00:00Z'));
  assert.equal(r.mesReferencia, '2026-10');
  const snapA = db.__tabelas.snapshotIndicadores.find(x => x.organizacaoId === s.orgA.id && x.mesReferencia === '2026-10');
  assert.equal(snapA.origem, 'CRON');
  const dsar = snapA.valores.indicadores.find(i => i.chave === 'DSAR');
  // Foto do mes fechado olha 31/10 23:59 BRT: a solicitacao com prazo 30/10
  // ainda sem resposta ja esta atrasada (no meio do mes ela nao contava).
  assert.deepEqual([dsar.n, dsar.total], [1, 4], 'foto de outubro: corte no fim do mes');
  assert.ok(db.__tabelas.snapshotIndicadores.some(x => x.organizacaoId === s.orgB.id && x.mesReferencia === '2026-10'));

  // de novo: substitui, nao duplica
  await ind.gerarSnapshotsMensais(db, new Date('2026-11-01T05:00:00Z'));
  assert.equal(db.__tabelas.snapshotIndicadores.filter(x => x.organizacaoId === s.orgA.id && x.mesReferencia === '2026-10').length, 1);

  // exportacao das fotos — antes da foto manual: se o relogio da maquina
  // estiver em outubro/2026, a foto manual substitui a de outubro.
  const csv = await (await chamar(tokenDe(s.gestorA), 'GET', '/indicadores/snapshots/export?formato=csv')).text();
  const linhas = csv.split('\r\n');
  assert.ok(linhas[0].startsWith('mesReferencia,origem,geradoEm,indicador,n,total,percentual,meta,status'));
  assert.ok(linhas.some(l => l.startsWith('2026-10,CRON,') && l.includes(',DSAR,1,4,25,100,PENDENTE')));

  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', '/indicadores/snapshots')).status, 403);
  const man = await (await chamar(tokenDe(s.gestorA), 'POST', '/indicadores/snapshots')).json();
  assert.equal(man.origem, 'MANUAL');
  assert.equal(man.mesReferencia, ind.mesReferenciaDe(new Date()));

  const listaB = await (await chamar(tokenDe(s.gestorB), 'GET', '/indicadores/snapshots')).json();
  assert.ok(listaB.every(x => x.organizacaoId === s.orgB.id));
});
