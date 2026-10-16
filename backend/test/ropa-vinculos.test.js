const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');

let srv, s, setorA, sisA, sisA2, fornA, sisB, setorB, fornB;
before(async () => {
  srv = await subir();
  s = await semear();
  const tA = tokenDe(s.gestorA);
  const tB = tokenDe(s.gestorB);
  setorA = await (await chamar(tA, 'POST', '/setores', { nome: 'Gabinete' })).json();
  sisA = await (await chamar(tA, 'POST', '/inventario/sistemas', { nome: 'Sistema de Protocolo', tipo: 'APLICACAO' })).json();
  sisA2 = await (await chamar(tA, 'POST', '/inventario/sistemas', { nome: 'E-mail institucional', tipo: 'NUVEM' })).json();
  fornA = await (await chamar(tA, 'POST', '/terceiros', { razaoSocial: 'Correios Fictícios', cnpj: '00.000.000/0001-00' })).json();
  setorB = await (await chamar(tB, 'POST', '/setores', { nome: 'Setor B' })).json();
  sisB = await (await chamar(tB, 'POST', '/inventario/sistemas', { nome: 'Sistema da B', tipo: 'OUTRO' })).json();
  fornB = await (await chamar(tB, 'POST', '/terceiros', { razaoSocial: 'Fornecedor da B' })).json();
});
after(async () => { await srv.fechar(); });

function chamar(token, metodo, caminho, body) {
  return fetch(`${srv.base}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) })
  });
}

const BASE = { nome: 'Atendimento ao cidadão', finalidade: 'Registrar protocolos', baseLegal: 'OBRIGACAO_LEGAL' };

test('ROPA <-> sistema: tratamento aparece no detalhe do sistema', async () => {
  const tA = tokenDe(s.gestorA);
  const r = await chamar(tA, 'POST', '/ropa/tratamentos', {
    ...BASE, setorId: setorA.id, sistemaIds: [sisA.id, sisA2.id], outrosMeios: 'Livro de protocolo em papel',
    compartilhamentos: [
      { terceiroId: fornA.id, terceiroNome: '', finalidadeCompartilhamento: 'Envio de correspondência' },
      { terceiroNome: 'Cartório (cadastro antigo)', terceiroCNPJ: '11.111.111/0001-11', finalidadeCompartilhamento: 'Registro' }
    ]
  });
  assert.equal(r.status, 201);
  const t = await r.json();
  assert.equal(t.setor.nome, 'Gabinete');
  assert.deepEqual(t.sistemas.map(v => v.sistema.nome).sort(), ['E-mail institucional', 'Sistema de Protocolo']);
  assert.equal(t.outrosMeios, 'Livro de protocolo em papel');

  const [c1, c2] = t.compartilhamentos;
  assert.equal(c1.terceiroId, fornA.id);
  assert.equal(c1.terceiroNome, 'Correios Fictícios', 'nome herdado do cadastro');
  assert.equal(c1.terceiroCNPJ, '00.000.000/0001-00');
  assert.equal(c2.terceiroId, null, 'compartilhamento no formato antigo continua valido');
  assert.equal(c2.terceiroNome, 'Cartório (cadastro antigo)');

  const det = await (await chamar(tA, 'GET', `/inventario/sistemas/${sisA.id}`)).json();
  assert.deepEqual(det.tratamentos.map(x => x.nome), ['Atendimento ao cidadão']);
  const lista = await (await chamar(tA, 'GET', '/inventario/sistemas')).json();
  assert.equal(lista.find(x => x.id === sisA.id).qtdTratamentos, 1);

  const forn = await (await chamar(tA, 'GET', `/terceiros/${fornA.id}`)).json();
  assert.deepEqual(forn.tratamentos.map(x => x.nome), ['Atendimento ao cidadão'], 'terceiro mostra os tratamentos em que e destinatario');

  // Remove um sistema: historico registra a mudanca pelo nome
  const ed = await chamar(tA, 'PUT', `/ropa/tratamentos/${t.id}`, { sistemaIds: [sisA2.id] });
  assert.equal(ed.status, 200);
  const det2 = await (await chamar(tA, 'GET', `/inventario/sistemas/${sisA.id}`)).json();
  assert.equal(det2.tratamentos.length, 0);
  const hist = db.__tabelas.historicoRegistro.filter(h => h.entidade === 'TRATAMENTO' && h.registroId === t.id);
  assert.deepEqual(hist.map(h => h.acao), ['CRIAR', 'EDITAR']);
  assert.equal(hist[0].diff.setor.depois, 'Gabinete');
  assert.deepEqual(hist[1].diff.sistemas, { antes: ['E-mail institucional', 'Sistema de Protocolo'], depois: ['E-mail institucional'] });
  assert.equal(hist[1].diff.compartilhamentos, undefined, 'compartilhamentos nao enviados ficam como estavam');
});

test('ROPA recusa setor, sistema e terceiro de outra organizacao', async () => {
  const tA = tokenDe(s.gestorA);
  assert.equal((await chamar(tA, 'POST', '/ropa/tratamentos', { ...BASE, setorId: setorB.id })).status, 400);
  assert.equal((await chamar(tA, 'POST', '/ropa/tratamentos', { ...BASE, sistemaIds: [sisA.id, sisB.id] })).status, 400);
  assert.equal((await chamar(tA, 'POST', '/ropa/tratamentos', {
    ...BASE, compartilhamentos: [{ terceiroId: fornB.id, finalidadeCompartilhamento: 'x' }]
  })).status, 400);
  const antes = db.__tabelas.tratamentoSistema.length;
  assert.equal((await chamar(tA, 'PUT', `/ropa/tratamentos/${s.tratamentoA.id}`, { sistemaIds: [sisB.id] })).status, 400);
  assert.equal(db.__tabelas.tratamentoSistema.length, antes, 'nada vinculado');
});

test('exportacao do ROPA traz setor, sistemas e outros meios', async () => {
  const tA = tokenDe(s.gestorA);
  const csv = await (await chamar(tA, 'GET', '/ropa/export?formato=csv')).text();
  const [cab, ...linhas] = csv.replace(/^﻿/, '').split('\n');
  assert.ok(cab.endsWith(',responsavel,setor,sistemas,outrosMeios'));
  const linha = linhas.find(l => l.startsWith('"Atendimento ao cidadão"'));
  assert.ok(linha.includes('"Gabinete"'));
  assert.ok(linha.includes('"E-mail institucional"'));
  assert.ok(linha.includes('"Livro de protocolo em papel"'));

  const json = await (await chamar(tA, 'GET', '/ropa/export?formato=json')).json();
  const t = json.find(x => x.nome === 'Atendimento ao cidadão');
  assert.equal(t.setor.nome, 'Gabinete');
  assert.deepEqual(t.sistemas.map(v => v.sistema.nome), ['E-mail institucional']);
});
