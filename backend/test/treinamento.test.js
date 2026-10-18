const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const TRILHAS = require('../src/data/trilhasTreinamento');
const { gerarCertificadoPdf, cargaHorariaTexto, BASE_LEGAL_CAPACITACAO } = require('../src/services/certificado');

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
const quizDe = (moduloId) => TRILHAS.find(t => t.id === TRILHA).modulos.find(m => m.moduloId === moduloId).quiz;
// respostas com n acertos (as demais erradas)
const respostas = (moduloId, acertos = 3) => quizDe(moduloId).map((q, i) => (i < acertos ? q.correta : (q.correta + 1) % q.alternativas.length));
const concluir = (token, moduloId, acertos = 3) => chamar(token, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId, respostas: respostas(moduloId, acertos) });

test('conteudo: 4 modulos em texto (MINUTA), 3 perguntas cada, sem video; gabarito nao vai ao navegador', async () => {
  const mods = TRILHAS.flatMap(t => t.modulos);
  assert.equal(TRILHAS.length, 2);
  assert.equal(mods.length, 4);
  for (const m of mods) {
    assert.ok(m.minuta && m.conteudo.length > 0, m.moduloId);
    assert.equal(m.quiz.length, 3, m.moduloId);
    assert.equal(m.youtubeId, undefined);
  }
  const trilhas = await (await chamar(tokenDe(s.dpoA), 'GET', '/treinamento/trilhas')).json();
  assert.ok(!JSON.stringify(trilhas).includes('"correta"'), 'gabarito exposto');
  assert.equal(trilhas[0].modulos[0].quiz[0].alternativas.length, 3);
  assert.equal(trilhas[0].modulos[0].minAcertos, 2);
});

test('questionario: so conclui com 2 acertos ou mais; toda tentativa e gravada', async () => {
  const t = tokenDe(s.dpoA);
  assert.equal((await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: 'nao-existe', respostas: [0, 0, 0] })).status, 400);
  assert.equal((await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: MODULOS[0] })).status, 400, 'sem respostas');
  assert.equal((await chamar(t, 'POST', '/treinamento/progresso', { trilhaId: TRILHA, moduloId: MODULOS[0], respostas: [0] })).status, 400, 'respostas incompletas');

  const r1 = await (await concluir(t, MODULOS[0], 1)).json();
  assert.equal(r1.tentativa.aprovado, false);
  assert.equal(r1.tentativa.acertos, 1);
  assert.deepEqual(r1.tentativa.corretas, [true, false, false]);
  assert.equal(r1.situacao, 'NAO_INICIADA', '1 acerto nao conclui');

  const r2 = await (await concluir(t, MODULOS[0], 2)).json();
  assert.equal(r2.tentativa.aprovado, true);
  assert.equal(r2.situacao, 'EM_ANDAMENTO');
  assert.equal(r2.certificadoCodigo, null);

  const tentativas = db.__tabelas.tentativaQuizTreinamento.filter(x => x.usuarioId === s.dpoA.id && x.moduloId === MODULOS[0]);
  assert.deepEqual(tentativas.map(x => [x.acertos, x.aprovado]), [[1, false], [2, true]]);
});

test('progresso: concluida emite certificado uma vez', async () => {
  const t = tokenDe(s.dpoA);
  await concluir(t, MODULOS[0]);
  assert.equal(db.__tabelas.progressoTreinamento.filter(p => p.usuarioId === s.dpoA.id).length, 1, 'idempotente');

  const p2 = await (await concluir(t, MODULOS[1])).json();
  assert.equal(p2.situacao, 'CONCLUIDA');
  assert.match(p2.certificadoCodigo, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  await concluir(t, MODULOS[1]);
  const certs = db.__tabelas.certificadoTreinamento.filter(c => c.usuarioId === s.dpoA.id);
  assert.equal(certs.length, 1, 'nao duplica certificado');
  assert.equal(certs[0].nomeUsuario, 'DPO A');
  assert.equal(certs[0].cargaHorariaMin, 20);
  assert.equal(cargaHorariaTexto(20), '0h20min');
  assert.equal(cargaHorariaTexto(90), '1h30min');
  assert.equal(cargaHorariaTexto(120), '2h');
});

test('certificado: PDF so para o dono ou Gestor/DPO; verificacao publica com identidade da camara', async () => {
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
  assert.deepEqual(Object.keys(dados).sort(), ['cargaHoraria', 'codigo', 'concluidoEm', 'nome', 'organizacao', 'trilha', 'valido']);
  assert.deepEqual(Object.keys(dados.organizacao).sort(), ['logo', 'municipio', 'nome', 'uf']);
  assert.equal(dados.nome, 'DPO A');
  assert.equal(dados.cargaHoraria, '0h20min');
  assert.equal(dados.organizacao.nome, 'Câmara A');

  assert.equal((await chamar(null, 'GET', '/certificado/verificar/AAAA-BBBB-CCCC')).status, 404);
  assert.equal((await chamar(null, 'GET', '/certificado/verificar/qualquer-coisa')).status, 404);
});

test('certificado: base legal nova, sem art. 50; local, encarregado e QR no PDF', async () => {
  assert.ok(!/art\. 50/i.test(BASE_LEGAL_CAPACITACAO));
  assert.equal(BASE_LEGAL_CAPACITACAO, 'Capacitação de servidores e colaboradores que tratam dados pessoais, em apoio às atribuições do encarregado (art. 41, § 2º, III, da LGPD) e às medidas de segurança do art. 46.');
  const pdf = await gerarCertificadoPdf(
    { codigo: 'ABCD-EFGH-JKLM', nomeUsuario: 'Fulana', trilhaTitulo: 'Introdução à LGPD', cargaHorariaMin: 20, concluidoEm: new Date('2026-10-17T01:30:00Z'), nomeOrganizacao: 'X' },
    { nome: 'Câmara Teste', municipio: 'Viamão', uf: 'RS', encarregadoNome: 'Enc. Fictício' }
  );
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const meta = pdf.toString('latin1');
  assert.ok(/\/Width 2\d\d/.test(meta) || meta.includes('/Subtype /Image'), 'QR code embutido como imagem');
});

test('relatorio: resumo "X de Y servidores", situacao, filtro, CSV e permissao', async () => {
  // gestora A faz so 1 modulo
  await concluir(tokenDe(s.gestorA), MODULOS[0]);

  const tG = tokenDe(s.gestorA);
  const linhas = await (await chamar(tG, 'GET', `/treinamento/relatorio?trilhaId=${TRILHA}`)).json();
  const sit = Object.fromEntries(linhas.map(l => [l.usuarioNome, l.situacao]));
  assert.deepEqual(sit, { 'Auditor A': 'NAO_INICIADA', 'DPO A': 'CONCLUIDA', 'Gestora A': 'EM_ANDAMENTO' });
  assert.ok(!linhas.some(l => l.usuarioNome === 'Gestor B'), 'so usuarios da propria org');

  const { resumo } = await (await chamar(tG, 'GET', '/treinamento/relatorio?resumo=1')).json();
  assert.deepEqual(resumo, { trilhaObrigatoria: 'Introdução à LGPD', servidores: 3, concluiramObrigatoria: 1, trilhasConcluidas: 1, trilhasTotal: 6 });

  const concl = await (await chamar(tG, 'GET', '/treinamento/relatorio?situacao=CONCLUIDA')).json();
  assert.deepEqual(concl.map(l => l.usuarioNome), ['DPO A']);

  const csv = await (await chamar(tG, 'GET', `/treinamento/relatorio?formato=csv&trilhaId=${TRILHA}`)).text();
  const [cab, ...rows] = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(cab, 'Servidor;Perfil;Trilha;Módulos concluídos;Total de módulos;Situação;Concluída em (Brasília);Certificado');
  assert.equal(rows.length, 3);
  assert.ok(rows.some(r => r.startsWith('DPO A;DPO;') && r.includes(';Concluída;') && /;\d{2}\/\d{2}\/\d{4} \d{2}:\d{2};/.test(r)));

  assert.equal((await chamar(tokenDe(s.auditorA), 'GET', '/treinamento/relatorio')).status, 403);
});
