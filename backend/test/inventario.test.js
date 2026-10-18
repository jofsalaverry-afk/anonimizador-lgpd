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

test('sistema: cria com responsavel, fornecedor e integracao; historico com nomes', async () => {
  const tA = tokenDe(s.gestorA);
  const forn = await (await chamar(tA, 'POST', '/terceiros', { razaoSocial: 'Hospedagem Fictícia' })).json();
  const banco = await (await chamar(tA, 'POST', '/inventario/sistemas', { nome: 'Banco da folha', tipo: 'BANCO_DADOS' })).json();

  const r = await chamar(tA, 'POST', '/inventario/sistemas', {
    nome: 'Sistema de RH', tipo: 'APLICACAO', finalidade: 'Gestão de servidores',
    responsavelId: s.dpoA.id, terceiroId: forn.id, categoriasDados: ['Nome', 'CPF'],
    integracaoIds: [banco.id], tipoHospedagem: 'NUVEM', paisHospedagem: 'Brasil', regiaoHospedagem: 'São Paulo'
  });
  assert.equal(r.status, 201);
  const rh = await r.json();
  assert.equal(rh.responsavel.nome, 'DPO A');
  assert.equal(rh.terceiro.razaoSocial, 'Hospedagem Fictícia');
  assert.deepEqual(rh.integracoes.map(i => i.nome), ['Banco da folha']);

  // Integracao aparece nas duas pontas
  const det = await (await chamar(tA, 'GET', `/inventario/sistemas/${banco.id}`)).json();
  assert.deepEqual(det.integracoes.map(i => i.nome), ['Sistema de RH']);

  const ed = await chamar(tA, 'PUT', `/inventario/sistemas/${rh.id}`, { integracaoIds: [], regiaoHospedagem: 'Rio de Janeiro' });
  assert.equal(ed.status, 200);

  const hist = db.__tabelas.historicoRegistro.filter(h => h.entidade === 'SISTEMA' && h.registroId === rh.id);
  assert.deepEqual(hist.map(h => h.acao), ['CRIAR', 'EDITAR']);
  assert.equal(hist[0].diff.fornecedor.depois, 'Hospedagem Fictícia');
  assert.deepEqual(hist[1].diff.integracoes, { antes: ['Banco da folha'], depois: [] });
  assert.deepEqual(hist[1].diff.regiaoHospedagem, { antes: 'São Paulo', depois: 'Rio de Janeiro' });
  assert.equal(hist[1].diff.terceiroId, undefined, 'id cru nao vai para o diff');
});

test('sistema: validacoes de tipo, auto-integracao e perfil', async () => {
  const tA = tokenDe(s.gestorA);
  assert.equal((await chamar(tA, 'POST', '/inventario/sistemas', { nome: 'X', tipo: 'NAVE' })).status, 400);
  assert.equal((await chamar(tA, 'POST', '/inventario/sistemas', { tipo: 'OUTRO' })).status, 400);
  const x = await (await chamar(tA, 'POST', '/inventario/sistemas', { nome: 'Arquivo físico', tipo: 'FISICO' })).json();
  assert.equal((await chamar(tA, 'PUT', `/inventario/sistemas/${x.id}`, { integracaoIds: [x.id] })).status, 400);
  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', '/inventario/sistemas', { nome: 'Y', tipo: 'OUTRO' })).status, 403);
});

test('inventario: isolamento entre organizacoes', async () => {
  const tA = tokenDe(s.gestorA);
  const tB = tokenDe(s.gestorB);
  const sisA = await (await chamar(tA, 'POST', '/inventario/sistemas', { nome: 'Protocolo eletrônico', tipo: 'APLICACAO' })).json();
  const fornA = await (await chamar(tA, 'POST', '/terceiros', { razaoSocial: 'Fornecedor da A' })).json();

  assert.equal((await chamar(tB, 'GET', `/inventario/sistemas/${sisA.id}`)).status, 404);
  assert.equal((await chamar(tB, 'PUT', `/inventario/sistemas/${sisA.id}`, { nome: 'Hack' })).status, 404);
  assert.equal((await chamar(tB, 'DELETE', `/inventario/sistemas/${sisA.id}`)).status, 404);
  const listaB = await (await chamar(tB, 'GET', '/inventario/sistemas')).json();
  assert.equal(listaB.length, 0);

  // B nao consegue apontar para coisas da A
  assert.equal((await chamar(tB, 'POST', '/inventario/sistemas', { nome: 'B1', tipo: 'OUTRO', integracaoIds: [sisA.id] })).status, 400);
  assert.equal((await chamar(tB, 'POST', '/inventario/sistemas', { nome: 'B2', tipo: 'OUTRO', terceiroId: fornA.id })).status, 400);
  assert.equal((await chamar(tB, 'POST', '/inventario/sistemas', { nome: 'B3', tipo: 'OUTRO', responsavelId: s.dpoA.id })).status, 400);

  // Historico/anexos do sistema da A nao abrem para B
  assert.equal((await chamar(tB, 'GET', `/historico?entidade=SISTEMA&registroId=${sisA.id}`)).status, 404);
  assert.equal((await chamar(tB, 'GET', `/anexos?entidade=SISTEMA&registroId=${sisA.id}`)).status, 404);
  assert.equal((await chamar(tA, 'GET', `/historico?entidade=SISTEMA&registroId=${sisA.id}`)).status, 200);
});

test('setores: CRUD, permissao e isolamento', async () => {
  const tA = tokenDe(s.gestorA);
  const r = await chamar(tA, 'POST', '/setores', { nome: 'Recursos Humanos' });
  assert.equal(r.status, 201);
  const setor = await r.json();
  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', '/setores', { nome: 'Outro' })).status, 403);
  assert.equal((await chamar(tokenDe(s.gestorB), 'PUT', `/setores/${setor.id}`, { nome: 'Hack' })).status, 404);
  const listaB = await (await chamar(tokenDe(s.gestorB), 'GET', '/setores')).json();
  assert.equal(listaB.length, 0);

  const des = await (await chamar(tA, 'PUT', `/setores/${setor.id}`, { ativo: false })).json();
  assert.equal(des.ativo, false);
  const ativos = await (await chamar(tA, 'GET', '/setores?ativos=1')).json();
  assert.ok(!ativos.some(x => x.id === setor.id));
  const hist = db.__tabelas.historicoRegistro.filter(h => h.entidade === 'SETOR' && h.registroId === setor.id);
  assert.deepEqual(hist.map(h => h.acao), ['CRIAR', 'EXCLUIR']);
});
