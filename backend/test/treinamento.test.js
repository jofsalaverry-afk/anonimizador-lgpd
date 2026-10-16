const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

function chamar(token, metodo, caminho, body) {
  return fetch(`${srv.base}${caminho}`, {
    method: metodo,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) })
  });
}
const TRILHA = 'introducao-lgpd';
const MODULOS = ['o-que-e-lgpd', 'principios-lgpd'];

test('progresso por modulo: em andamento -> concluida, certificado emitido uma vez', async () => {
  const t = tokenDe(s.dpoA);
  assert.equal((await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: 'nao-existe' })).status, 400);

  const p1 = await (await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: MODULOS[0] })).json();
  assert.equal(p1.situacao, 'EM_ANDAMENTO');
  assert.equal(p1.certificadoCodigo, null);

  // marcar de novo e idempotente
  await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: MODULOS[0] });
  assert.equal(db.__tabelas.progressoTreinamento.filter(p => p.usuarioId === s.dpoA.id).length, 1);

  const p2 = await (await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: MODULOS[1] })).json();
  assert.equal(p2.situacao, 'CONCLUIDA');
  assert.match(p2.certificadoCodigo, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: MODULOS[1] });
  const certs = db.__tabelas.certificadoTreinamento.filter(c => c.usuarioId === s.dpoA.id);
  assert.equal(certs.length, 1, 'nao duplica certificado');
  assert.equal(certs[0].nomeUsuario, 'DPO A');
  assert.equal(certs[0].nomeOrganizacao, 'Câmara A');
  assert.equal(certs[0].cargaHorariaMin, 20);

  const meu = await (await chamar(t, 'GET', '/treinamento/progresso')).json();
  assert.equal(meu.find(x => x.trilhaId === TRILHA).situacao, 'CONCLUIDA');
});

test('certificado: PDF so para o dono ou Gestor/DPO da org; verificacao publica minima', async () => {
  const codigo = db.__tabelas.certificadoTreinamento.find(c => c.usuarioId === s.dpoA.id).codigo;

  const pdf = await chamar(tokenDe(s.dpoA), 'GET', `/treinamento/certificados/${codigo}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

  assert.equal((await chamar(tokenDe(s.gestorA), 'GET', `/treinamento/certificados/${codigo}/pdf`)).status, 200, 'gestor da org baixa');
  assert.equal((await chamar(tokenDe(s.auditorA), 'GET', `/treinamento/certificados/${codigo}/pdf`)).status, 404, 'outro usuario comum nao baixa');
  assert.equal((await chamar(tokenDe(s.gestorB), 'GET', `/treinamento/certificados/${codigo}/pdf`)).status, 404, 'outra org nao baixa');

  const pub = await chamar(null, 'GET', `/certificado/verificar/${codigo}`);
  assert.equal(pub.status, 200);
  const dados = await pub.json();
  assert.deepEqual(Object.keys(dados).sort(), ['concluidoEm', 'nome', 'trilha', 'valido']);
  assert.equal(dados.valido, true);
  assert.equal(dados.nome, 'DPO A');
  assert.equal(dados.trilha, 'Introdução à LGPD');

  assert.equal((await chamar(null, 'GET', '/certificado/verificar/AAAA-BBBB-CCCC')).status, 404);
  assert.equal((await chamar(null, 'GET', '/certificado/verificar/qualquer-coisa')).status, 404);
});

test('relatorio: usuarios x trilhas com situacao, filtro, CSV e permissao', async () => {
  // gestora A faz so 1 modulo
  await chamar(tokenDe(s.gestorA), 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: MODULOS[0] });

  const tG = tokenDe(s.gestorA);
  const linhas = await (await chamar(tG, 'GET', `/treinamento/relatorio?trilhaId=${TRILHA}`)).json();
  const sit = Object.fromEntries(linhas.map(l => [l.usuarioNome, l.situacao]));
  assert.deepEqual(sit, { 'Auditor A': 'NAO_INICIADA', 'DPO A': 'CONCLUIDA', 'Gestora A': 'EM_ANDAMENTO' });
  assert.ok(linhas.every(l => l.trilhaId === TRILHA));
  assert.ok(!linhas.some(l => l.usuarioNome === 'Gestor B'), 'so usuarios da propria org');

  const concl = await (await chamar(tG, 'GET', '/treinamento/relatorio?situacao=CONCLUIDA')).json();
  assert.deepEqual(concl.map(l => l.usuarioNome), ['DPO A']);
  assert.ok(concl[0].concluidoEm && concl[0].certificadoCodigo);

  const csv = await (await chamar(tG, 'GET', `/treinamento/relatorio?formato=csv&trilhaId=${TRILHA}`)).text();
  const [cab, ...rows] = csv.replace(/^﻿/, '').split('\n');
  assert.equal(cab, 'usuario,perfil,trilha,modulosConcluidos,totalModulos,situacao,concluidoEm,certificado');
  assert.equal(rows.length, 3);
  assert.ok(rows.some(r => r.startsWith('"DPO A"') && r.includes('"Concluída"')));

  assert.equal((await chamar(tokenDe(s.auditorA), 'GET', '/treinamento/relatorio')).status, 403);
});
