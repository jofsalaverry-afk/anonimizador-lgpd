const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const { calcularDiff } = require('../src/services/historico');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const put = (token, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
const get = (token, caminho) => fetch(`${srv.base}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });

test('calcularDiff: so campos alterados, sem metadados nem campos sensiveis', () => {
  const antes = {
    id: '1', atualizadoEm: new Date('2026-01-01'), status: 'ABERTO', titulo: 'X',
    categorias: ['a', 'b'], senhaHash: 'h1', conteudo: Buffer.from('a'), titularCpf: '11122233344',
    dataOcorrencia: new Date('2026-10-01T00:00:00Z')
  };
  const depois = {
    id: '1', atualizadoEm: new Date('2026-02-01'), status: 'RESOLVIDO', titulo: 'X',
    categorias: ['a', 'c'], senhaHash: 'h2', conteudo: Buffer.from('b'), titularCpf: '99988877766',
    dataOcorrencia: new Date('2026-10-01T00:00:00Z')
  };
  const diff = calcularDiff(antes, depois);
  assert.deepEqual(Object.keys(diff).sort(), ['categorias', 'status', 'titularCpf']);
  assert.deepEqual(diff.status, { antes: 'ABERTO', depois: 'RESOLVIDO' });
  assert.deepEqual(diff.categorias, { antes: ['a', 'b'], depois: ['a', 'c'] });
  assert.deepEqual(diff.titularCpf, { antes: '[omitido]', depois: '[omitido]' }, 'CPF nao vai para o historico');
});

test('PUT incidente grava diff campo a campo e o GET /historico devolve nomes', async () => {
  const tA = tokenDe(s.gestorA);
  const r = await put(tA, `/repositorio/incidentes/${s.incidenteA.id}`, {
    status: 'EM_INVESTIGACAO', responsavelId: s.dpoA.id, titulo: s.incidenteA.titulo
  });
  assert.equal(r.status, 200);
  const inc = await r.json();
  assert.equal(inc.responsavel.nome, 'DPO A');

  const linhas = db.__tabelas.historicoRegistro.filter(h => h.entidade === 'INCIDENTE' && h.registroId === s.incidenteA.id);
  assert.equal(linhas.length, 1);
  const h = linhas[0];
  assert.equal(h.acao, 'STATUS', 'mudanca de status vira acao STATUS');
  assert.equal(h.usuarioId, s.gestorA.id);
  assert.equal(h.organizacaoId, s.orgA.id);
  assert.deepEqual(h.diff.status, { antes: 'ABERTO', depois: 'EM_INVESTIGACAO' });
  assert.deepEqual(h.diff.responsavelId, { antes: null, depois: s.dpoA.id });
  assert.equal(h.diff.titulo, undefined, 'campo nao alterado fica fora');
  assert.equal(h.diff.atualizadoEm, undefined);

  const resp = await (await get(tA, `/historico?entidade=INCIDENTE&registroId=${s.incidenteA.id}`)).json();
  assert.equal(resp.itens.length, 1);
  assert.equal(resp.usuarios[s.gestorA.id], 'Gestora A', 'quem alterou');
  assert.equal(resp.usuarios[s.dpoA.id], 'DPO A', 'responsavel designado');
});

test('PUT sem mudanca real nao grava historico', async () => {
  const tA = tokenDe(s.gestorA);
  const antes = db.__tabelas.historicoRegistro.length;
  const r = await put(tA, `/repositorio/incidentes/${s.incidenteA.id}`, { status: 'EM_INVESTIGACAO' });
  assert.equal(r.status, 200);
  assert.equal(db.__tabelas.historicoRegistro.length, antes);
});

test('responsavel de outra organizacao e recusado', async () => {
  const r = await put(tokenDe(s.gestorA), `/repositorio/incidentes/${s.incidenteA.id}`, { responsavelId: s.gestorB.id });
  assert.equal(r.status, 400);
});

test('historico de registro de outra organizacao retorna 404', async () => {
  const r = await get(tokenDe(s.gestorB), `/historico?entidade=INCIDENTE&registroId=${s.incidenteA.id}`);
  assert.equal(r.status, 404);
});

test('ROPA: criar e editar gravam CRIAR e EDITAR com o diff', async () => {
  const tA = tokenDe(s.gestorA);
  const criar = await fetch(`${srv.base}/ropa/tratamentos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Protocolo', finalidade: 'Atender cidadão', baseLegal: 'OBRIGACAO_LEGAL', categoriasDados: ['nome'], responsavelId: s.dpoA.id })
  });
  assert.equal(criar.status, 201);
  const t = await criar.json();

  const editar = await put(tA, `/ropa/tratamentos/${t.id}`, {
    finalidade: 'Atender o cidadão no protocolo', compartilhamentos: [{ terceiroNome: 'Correios', finalidadeCompartilhamento: 'Envio', paisDestino: 'Brasil' }]
  });
  assert.equal(editar.status, 200);

  const hs = db.__tabelas.historicoRegistro.filter(h => h.registroId === t.id);
  assert.deepEqual(hs.map(h => h.acao), ['CRIAR', 'EDITAR']);
  assert.deepEqual(hs[0].diff.responsavelId, { antes: null, depois: s.dpoA.id });
  assert.deepEqual(hs[1].diff.finalidade, { antes: 'Atender cidadão', depois: 'Atender o cidadão no protocolo' });
  assert.deepEqual(hs[1].diff.compartilhamentos, { antes: [], depois: ['Correios — Envio — Brasil'] });
});
