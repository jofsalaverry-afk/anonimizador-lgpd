const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');

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
const DIA = 24 * 60 * 60 * 1000;

// ---------- Incidentes ----------

test('incidente: severidade, simulado e filtros', async () => {
  const t = tokenDe(s.gestorA);
  const base = { titulo: 'Simulado de vazamento', dataOcorrencia: '2026-10-10', tipoIncidente: 'VAZAMENTO', descricao: 'Exercício anual' };
  assert.equal((await chamar(t, 'POST', '/repositorio/incidentes', { ...base, severidade: 'GRAVISSIMA' })).status, 400);
  assert.equal((await chamar(t, 'POST', '/repositorio/incidentes', { ...base, tipoRegistro: 'TREINO' })).status, 400);

  const sim = await (await chamar(t, 'POST', '/repositorio/incidentes', { ...base, severidade: 'ALTA', tipoRegistro: 'SIMULADO' })).json();
  assert.equal(sim.severidade, 'ALTA');
  assert.equal(sim.tipoRegistro, 'SIMULADO');
  const real = await (await chamar(t, 'POST', '/repositorio/incidentes', { ...base, titulo: 'Real', severidade: 'BAIXA' })).json();
  assert.equal(real.tipoRegistro, 'REAL', 'default REAL');

  const simulados = await (await chamar(t, 'GET', '/repositorio/incidentes?tipoRegistro=SIMULADO')).json();
  assert.deepEqual(simulados.map(i => i.id), [sim.id]);
  const altas = await (await chamar(t, 'GET', '/repositorio/incidentes?severidade=ALTA')).json();
  assert.ok(altas.every(i => i.severidade === 'ALTA') && altas.some(i => i.id === sim.id));

  const upd = await (await chamar(t, 'PUT', `/repositorio/incidentes/${real.id}`, { severidade: 'MEDIA' })).json();
  assert.equal(upd.severidade, 'MEDIA');
  const h = db.__tabelas.historicoRegistro.filter(x => x.registroId === real.id);
  assert.deepEqual(h[h.length - 1].diff.severidade, { antes: 'BAIXA', depois: 'MEDIA' });
});

test('providencias: lista com responsavel, historico e isolamento', async () => {
  const t = tokenDe(s.gestorA);
  const inc = s.incidenteA.id;
  assert.equal((await chamar(t, 'POST', `/repositorio/incidentes/${inc}/providencias`, { descricao: '' })).status, 400);
  assert.equal((await chamar(t, 'POST', `/repositorio/incidentes/${inc}/providencias`, { descricao: 'x', responsavelId: s.gestorB.id })).status, 400);
  assert.equal((await chamar(tokenDe(s.gestorB), 'POST', `/repositorio/incidentes/${inc}/providencias`, { descricao: 'Hack' })).status, 404);
  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', `/repositorio/incidentes/${inc}/providencias`, { descricao: 'x' })).status, 403);

  const p = await chamar(t, 'POST', `/repositorio/incidentes/${inc}/providencias`, { descricao: 'Senha do e-mail trocada', data: '2026-10-02', responsavelId: s.dpoA.id });
  assert.equal(p.status, 201);
  assert.equal((await p.json()).responsavel.nome, 'DPO A');

  const det = await (await chamar(t, 'GET', `/repositorio/incidentes/${inc}`)).json();
  assert.equal(det.providencias.length, 1);
  assert.equal(det.providencias[0].descricao, 'Senha do e-mail trocada');

  const h = db.__tabelas.historicoRegistro.filter(x => x.registroId === inc && x.diff.providencia);
  assert.equal(h[0].diff.providencia.depois, '02/10/2026 — Senha do e-mail trocada (DPO A)');
});

// ---------- Descarte e alerta de retencao ----------

test('descarte: registra com evidencia e historico; isolamento', async () => {
  const t = tokenDe(s.gestorA);
  const trat = s.tratamentoA.id;
  const amanha2 = new Date(Date.now() + 3 * DIA).toISOString();
  assert.equal((await chamar(t, 'POST', `/ropa/tratamentos/${trat}/descartes`, { dataDescarte: amanha2, descricao: 'x', metodo: 'y' })).status, 400, 'data futura');
  assert.equal((await chamar(t, 'POST', `/ropa/tratamentos/${trat}/descartes`, { dataDescarte: '2026-10-01', descricao: 'x' })).status, 400, 'sem metodo');
  assert.equal((await chamar(tokenDe(s.gestorB), 'POST', `/ropa/tratamentos/${trat}/descartes`, { dataDescarte: '2026-10-01', descricao: 'x', metodo: 'y' })).status, 404);

  const r = await chamar(t, 'POST', `/ropa/tratamentos/${trat}/descartes`, {
    dataDescarte: '2026-10-01', descricao: 'Fichas de 2019 trituradas', quantidade: 120, metodo: 'Trituração', responsavelId: s.dpoA.id
  });
  assert.equal(r.status, 201);
  const d = await r.json();

  // evidencia via <Anexos> (entidade DESCARTE)
  const fd = new FormData();
  fd.append('entidade', 'DESCARTE');
  fd.append('registroId', d.id);
  fd.append('arquivo', new Blob([Buffer.from('%PDF-1.4 termo de descarte')], { type: 'application/pdf' }), 'termo.pdf');
  const up = await fetch(`${srv.base}/anexos`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd });
  assert.equal(up.status, 201);
  assert.equal((await chamar(tokenDe(s.gestorB), 'GET', `/anexos?entidade=DESCARTE&registroId=${d.id}`)).status, 404);

  const lista = await (await chamar(t, 'GET', `/ropa/tratamentos/${trat}/descartes`)).json();
  assert.equal(lista.descartes.length, 1);
  assert.equal(lista.descartes[0].responsavel.nome, 'DPO A');

  const hDesc = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'DESCARTE' && x.registroId === d.id);
  assert.deepEqual(hDesc.map(x => x.acao), ['CRIAR', 'EDITAR'], 'criacao + anexo');
  assert.equal(hDesc[0].diff.tratamento.depois, 'Folha de pagamento');
  const hTrat = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'TRATAMENTO' && x.diff.descarte);
  assert.match(hTrat[0].diff.descarte.depois, /^01\/10\/2026 — Trituração — 120 registro\(s\)/);
});

test('alerta de retencao: vence pela criacao e some apos novo descarte', async () => {
  const t = tokenDe(s.gestorA);
  const trat = await db.tratamento.create({
    data: {
      organizacaoId: s.orgA.id, nome: 'Câmeras de segurança', finalidade: 'Vigilância', baseLegal: 'INTERESSE_PUBLICO',
      retencaoDias: 30, ativo: true, criadoEm: new Date(Date.now() - 60 * DIA)
    }
  });
  const info = await (await chamar(t, 'GET', `/ropa/tratamentos/${trat.id}/descartes`)).json();
  assert.equal(info.retencao.vencido, true);
  assert.equal(info.retencao.origem, 'CRIACAO');

  let alertas = (await (await chamar(t, 'GET', '/conformidade/alertas')).json()).alertas;
  const doTrat = a => a.tipo === 'RETENCAO_VENCIDA' && a.referenciaId === trat.id;
  assert.equal(alertas.filter(a => doTrat(a) && !a.lido).length, 1);
  // idempotente
  alertas = (await (await chamar(t, 'GET', '/conformidade/alertas')).json()).alertas;
  assert.equal(alertas.filter(doTrat).length, 1);
  // outra org nao ve
  const alertasB = (await (await chamar(tokenDe(s.gestorB), 'GET', '/conformidade/alertas')).json()).alertas;
  assert.ok(!alertasB.some(doTrat));

  await chamar(t, 'POST', `/ropa/tratamentos/${trat.id}/descartes`, { dataDescarte: new Date().toISOString(), descricao: 'Gravações apagadas', metodo: 'Exclusão definitiva' });
  const info2 = await (await chamar(t, 'GET', `/ropa/tratamentos/${trat.id}/descartes`)).json();
  assert.equal(info2.retencao.vencido, false);
  assert.equal(info2.retencao.origem, 'ULTIMO_DESCARTE');
  alertas = (await (await chamar(t, 'GET', '/conformidade/alertas')).json()).alertas;
  assert.equal(alertas.filter(a => doTrat(a) && !a.lido).length, 0, 'alerta resolvido pelo descarte');
});
