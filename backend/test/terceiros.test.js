const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const { calcularRisco, PERGUNTAS } = require('../src/services/questionarioTerceiro');

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
const todas = resposta => Object.keys(PERGUNTAS).map(perguntaId => ({ perguntaId, resposta }));

// ---------- Regra de risco (unidade) ----------

test('calcularRisco: faixas BAIXO / MEDIO / ALTO', () => {
  assert.equal(calcularRisco(todas('SIM')).risco, 'BAIXO');
  assert.equal(calcularRisco(todas('PARCIAL')).risco, 'ALTO', 'tudo parcial = indice 0,5 -> ALTO');
  assert.equal(calcularRisco(todas('NAO')).risco, 'ALTO');
  // 1 pergunta de peso 1 em NAO num questionario todo SIM: indice baixo
  const umNao = todas('SIM').map(r => r.perguntaId === 'SEG1' ? { ...r, resposta: 'NAO' } : r);
  assert.equal(calcularRisco(umNao).risco, 'BAIXO');
  // ~1/3 em NAO (peso misto) cai em MEDIO
  const ids = Object.keys(PERGUNTAS);
  const terco = todas('SIM').map((r, i) => (i % 3 === 0 && !PERGUNTAS[r.perguntaId].critica) ? { ...r, resposta: 'NAO' } : r);
  const av = calcularRisco(terco);
  assert.ok(av.indice >= 0.25 && av.indice < 0.5, `indice ${av.indice} deveria estar na faixa MEDIO`);
  assert.equal(av.risco, 'MEDIO');
  assert.equal(av.total, ids.length);
});

test('calcularRisco: agravantes elevam o minimo para MEDIO', () => {
  const criticaNao = todas('SIM').map(r => r.perguntaId === 'INC2' ? { ...r, resposta: 'NAO' } : r);
  const av = calcularRisco(criticaNao);
  assert.equal(av.risco, 'MEDIO');
  assert.ok(av.agravantes.some(a => a.includes('crítica')));

  const semAditivo = calcularRisco(todas('SIM'), { contratoCritico: true, aditivoLgpdAssinado: false });
  assert.equal(semAditivo.risco, 'MEDIO');
  assert.equal(calcularRisco(todas('SIM'), { contratoCritico: true, aditivoLgpdAssinado: true }).risco, 'BAIXO');
});

test('calcularRisco: sem respostas validas = nao avaliado; NA nao conta', () => {
  assert.equal(calcularRisco([]).risco, null);
  assert.equal(calcularRisco(todas('NA')).risco, null);
  const naMaisSim = todas('NA').map(r => r.perguntaId === 'SEG1' ? { ...r, resposta: 'SIM' } : r);
  assert.equal(calcularRisco(naMaisSim).risco, 'BAIXO');
  assert.equal(calcularRisco([{ perguntaId: 'INEXISTENTE', resposta: 'NAO' }]).risco, null);
});

// ---------- API ----------

test('questionario calcula risco, grava respostas com autor e historico', async () => {
  const tA = tokenDe(s.gestorA);
  const t = await (await chamar(tA, 'POST', '/terceiros', { razaoSocial: 'Nuvem Fictícia Ltda', papel: 'OPERADOR', contratoCritico: true })).json();
  assert.equal(t.risco, null, 'sem questionario = nao avaliado');

  const r = await chamar(tA, 'PUT', `/terceiros/${t.id}/questionario`, { respostas: todas('NAO') });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).risco, 'ALTO');

  const gravadas = db.__tabelas.respostaQuestionarioTerceiro.filter(x => x.terceiroId === t.id);
  assert.equal(gravadas.length, Object.keys(PERGUNTAS).length);
  assert.ok(gravadas.every(x => x.respondidoPorId === s.gestorA.id && x.respondidoEm instanceof Date));

  // Melhora tudo para SIM: contrato critico sem aditivo segura em MEDIO
  const r2 = await (await chamar(tA, 'PUT', `/terceiros/${t.id}/questionario`, { respostas: todas('SIM') })).json();
  assert.equal(r2.risco, 'MEDIO');
  // Aditivo assinado -> recalcula para BAIXO no PUT cadastral
  const r3 = await (await chamar(tA, 'PUT', `/terceiros/${t.id}`, { aditivoLgpdAssinado: true })).json();
  assert.equal(r3.risco, 'BAIXO');

  const hist = db.__tabelas.historicoRegistro.filter(h => h.entidade === 'TERCEIRO' && h.registroId === t.id);
  assert.deepEqual(hist.map(h => h.acao), ['CRIAR', 'EDITAR', 'EDITAR', 'EDITAR']);
  assert.deepEqual(hist[1].diff['questionario.SEG2'], { antes: null, depois: 'NAO' });
  assert.deepEqual(hist[1].diff.risco, { antes: null, depois: 'ALTO' });
  assert.deepEqual(hist[2].diff['questionario.SEG2'], { antes: 'NAO', depois: 'SIM' });
  assert.deepEqual(hist[3].diff.risco, { antes: 'MEDIO', depois: 'BAIXO' });
});

test('risco manual exige justificativa e nao e sobrescrito pelo questionario', async () => {
  const tA = tokenDe(s.dpoA);
  const t = await (await chamar(tA, 'POST', '/terceiros', { razaoSocial: 'Gráfica Exemplo' })).json();

  assert.equal((await chamar(tA, 'PUT', `/terceiros/${t.id}/risco`, { manual: true, risco: 'ALTO', justificativa: 'curta' })).status, 400);
  const manual = await (await chamar(tA, 'PUT', `/terceiros/${t.id}/risco`, { manual: true, risco: 'ALTO', justificativa: 'Histórico de vazamento em 2025 noticiado' })).json();
  assert.equal(manual.risco, 'ALTO');
  assert.equal(manual.riscoManual, true);

  const q = await (await chamar(tA, 'PUT', `/terceiros/${t.id}/questionario`, { respostas: todas('SIM') })).json();
  assert.equal(q.risco, 'ALTO', 'manual prevalece');
  assert.equal(q.avaliacao.risco, 'BAIXO', 'calculado continua visivel');

  const auto = await (await chamar(tA, 'PUT', `/terceiros/${t.id}/risco`, { manual: false })).json();
  assert.equal(auto.risco, 'BAIXO');
  assert.equal(auto.riscoManual, false);

  // Operador nao define risco manual
  assert.equal((await chamar(tokenDe(s.auditorA), 'PUT', `/terceiros/${t.id}/risco`, { manual: false })).status, 403);
});

test('plano de acao: responsavel da org, situacao e historico', async () => {
  const tA = tokenDe(s.gestorA);
  const t = await (await chamar(tA, 'POST', '/terceiros', { razaoSocial: 'Software de Folha SA' })).json();
  assert.equal((await chamar(tA, 'POST', `/terceiros/${t.id}/acoes`, { descricao: 'Assinar aditivo', responsavelId: s.gestorB.id })).status, 400);

  const acao = await (await chamar(tA, 'POST', `/terceiros/${t.id}/acoes`, { descricao: 'Assinar aditivo LGPD', responsavelId: s.dpoA.id, prazo: '2026-11-30' })).json();
  assert.equal(acao.situacao, 'PENDENTE');
  assert.equal(acao.responsavel.nome, 'DPO A');

  const upd = await chamar(tA, 'PUT', `/terceiros/${t.id}/acoes/${acao.id}`, { situacao: 'CONCLUIDA' });
  assert.equal((await upd.json()).situacao, 'CONCLUIDA');

  const hist = db.__tabelas.historicoRegistro.filter(h => h.registroId === t.id && h.diff.planoAcao);
  assert.equal(hist.length, 2);
  assert.match(hist[0].diff.planoAcao.depois, /Assinar aditivo LGPD — Pendente · prazo 30\/11\/2026 · DPO A/);
  assert.match(hist[1].diff.planoAcao.depois, /Concluída/);
  // na tela do historico o campo se chama "Plano de ação" (nao o rotulo do incidente)
  const tela = await (await chamar(tA, 'GET', `/historico?entidade=TERCEIRO&registroId=${t.id}`)).json();
  assert.equal(tela.rotulosCampos.planoAcao, 'Plano de ação');

  const lista = await (await chamar(tA, 'GET', '/terceiros')).json();
  assert.equal(lista.find(x => x.id === t.id).acoesPendentes, 0);
});

test('terceiros: isolamento entre organizacoes e filtro por risco', async () => {
  const tA = tokenDe(s.gestorA);
  const tB = tokenDe(s.gestorB);
  const t = await (await chamar(tA, 'POST', '/terceiros', { razaoSocial: 'Fornecedor Só da A' })).json();
  await chamar(tA, 'PUT', `/terceiros/${t.id}/questionario`, { respostas: todas('NAO') });

  assert.equal((await chamar(tB, 'GET', `/terceiros/${t.id}`)).status, 404);
  assert.equal((await chamar(tB, 'PUT', `/terceiros/${t.id}`, { razaoSocial: 'Hack' })).status, 404);
  assert.equal((await chamar(tB, 'PUT', `/terceiros/${t.id}/questionario`, { respostas: todas('SIM') })).status, 404);
  assert.equal((await chamar(tB, 'POST', `/terceiros/${t.id}/acoes`, { descricao: 'x' })).status, 404);
  assert.equal((await chamar(tB, 'DELETE', `/terceiros/${t.id}`)).status, 404);
  const listaB = await (await chamar(tB, 'GET', '/terceiros')).json();
  assert.ok(listaB.every(x => x.organizacaoId === s.orgB.id));
  assert.equal(listaB.length, 0);

  const altos = await (await chamar(tA, 'GET', '/terceiros?risco=ALTO')).json();
  assert.ok(altos.length >= 1 && altos.every(x => x.risco === 'ALTO'));
  const naoAvaliados = await (await chamar(tA, 'GET', '/terceiros?risco=NAO_AVALIADO')).json();
  assert.ok(naoAvaliados.every(x => x.risco === null));
});

test('terceiros: modulo desligado = 403', async () => {
  await db.organizacao.update({ where: { id: s.orgB.id }, data: { modulosAtivos: ['ropa'] } });
  assert.equal((await chamar(tokenDe(s.gestorB), 'GET', '/terceiros')).status, 403);
  await db.organizacao.update({ where: { id: s.orgB.id }, data: { modulosAtivos: s.orgA.modulosAtivos } });
});
