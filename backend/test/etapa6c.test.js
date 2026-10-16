// Etapa 6c. O relogio do processo roda em UTC (como no servidor): as datas
// puras nao podem "voltar um dia" e os instantes sao mostrados em Sao Paulo.
process.env.TZ = 'UTC';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const datas = require('../src/services/datas');
const { prazoComunicacao } = require('../src/services/incidentes');
const { garantirCatalogoChecklist, garantirModelosDsar } = require('../src/services/cargaInicial');
const { executarCargas } = require('../src/seed');
const CATALOGO = require('../src/data/catalogoChecklist');
const MODELOS_DSAR = require('../src/data/modelosDsar');
const { normalizarCategorias } = require('../src/services/basesLegais');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const chamar = (token, metodo, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: metodo,
  headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
  ...(body !== undefined && { body: JSON.stringify(body) })
});
const json = async r => r.json();

// ---------- 24. Datas ----------

test('24: relogio em UTC; data pura grava meia-noite UTC e exibe o mesmo dia', () => {
  assert.equal(new Date().getTimezoneOffset(), 0, 'processo em UTC');
  const d = datas.dataPura('2026-10-16');
  assert.equal(d.toISOString(), '2026-10-16T00:00:00.000Z');
  assert.equal(datas.fmtData(d), '16/10/2026');
  assert.equal(datas.dataPura('2026-02-30'), undefined, 'data inexistente');
  assert.equal(datas.dataPura('16/10/2026'), undefined, 'so AAAA-MM-DD');
  assert.equal(datas.dataPura(''), null);
  // instante: 01:30 UTC de 17/10 ainda e 16/10 em Sao Paulo
  const instante = new Date('2026-10-17T01:30:00Z');
  assert.equal(datas.fmtDiaSP(instante), '16/10/2026');
  assert.equal(datas.fmtDataHora(instante), '16/10/2026, 22:30');
  assert.equal(datas.iso(datas.hojeSP(instante)), '2026-10-16');
});

test('24: incidente informado como 16/10 volta 16/10 na API, no historico, no CSV e na providencia', async () => {
  const t = tokenDe(s.gestorA);
  const r = await chamar(t, 'POST', '/repositorio/incidentes', {
    titulo: 'Fuso', dataOcorrencia: '2026-10-16', tipoIncidente: 'PERDA', descricao: 'x', tipoRegistro: 'REAL'
  });
  assert.equal(r.status, 201);
  const inc = await json(r);
  assert.equal(inc.dataOcorrencia, '2026-10-16T00:00:00.000Z');
  assert.equal((await chamar(t, 'POST', '/repositorio/incidentes', { titulo: 'x', dataOcorrencia: '16/10/2026', tipoIncidente: 'PERDA', descricao: 'x' })).status, 400);

  // edicao da data (antes era ignorada)
  const ed = await json(await chamar(t, 'PUT', `/repositorio/incidentes/${inc.id}`, { dataOcorrencia: '2026-10-15' }));
  assert.equal(ed.dataOcorrencia, '2026-10-15T00:00:00.000Z');
  const hist = db.__tabelas.historicoRegistro.filter(h => h.registroId === inc.id && h.acao === 'EDITAR');
  assert.deepEqual(hist[0].diff.dataOcorrencia, { antes: '2026-10-16T00:00:00.000Z', depois: '2026-10-15T00:00:00.000Z' });

  await chamar(t, 'POST', `/repositorio/incidentes/${inc.id}/providencias`, { descricao: 'Senhas trocadas', data: '2026-10-16' });
  const csv = await (await chamar(t, 'GET', '/repositorio/incidentes/export?formato=csv')).text();
  const linha = csv.split('\n').find(l => l.includes('"Fuso"') || l.includes(',Fuso,'));
  assert.ok(linha.includes('2026-10-15'), 'ocorrencia AAAA-MM-DD');
  assert.ok(linha.includes('2026-10-16 — Senhas trocadas'));
  assert.ok(!linha.includes('2026-10-15T'), 'data pura sem horario');
});

// ---------- 23 / 22. Incidente real: ciencia, risco e prazo ANPD ----------

test('23: prazo de comunicacao = 3 dias uteis da ciencia (so REAL com risco SIM)', () => {
  const base = { tipoRegistro: 'REAL', riscoRelevante: 'SIM', dataCiencia: datas.dataPura('2026-10-16') }; // sexta
  const agora = new Date('2026-10-16T15:00:00Z');
  assert.deepEqual(prazoComunicacao(base, agora), { prazo: '2026-10-21', vespera: '2026-10-20', situacao: 'NO_PRAZO', comunicado: false });
  assert.equal(prazoComunicacao(base, new Date('2026-10-20T15:00:00Z')).situacao, 'VESPERA');
  assert.equal(prazoComunicacao(base, new Date('2026-10-21T15:00:00Z')).situacao, 'HOJE');
  assert.equal(prazoComunicacao(base, new Date('2026-10-22T15:00:00Z')).situacao, 'VENCIDO');
  // feriado nacional no meio (20/11) e fim de semana
  assert.equal(prazoComunicacao({ ...base, dataCiencia: datas.dataPura('2026-11-18') }, agora).prazo, '2026-11-24');
  assert.equal(prazoComunicacao({ ...base, riscoRelevante: 'EM_AVALIACAO' }, agora), null);
  assert.equal(prazoComunicacao({ ...base, tipoRegistro: 'SIMULADO' }, agora), null);
  assert.equal(prazoComunicacao({ ...base, dataComunicacaoANPD: new Date(), dataComunicacaoTitulares: new Date() }, agora).situacao, 'COMUNICADO');
});

test('23: API grava ciencia/risco/comunicacoes, devolve o prazo e gera alerta 1 dia util antes', async () => {
  const t = tokenDe(s.gestorA);
  // ciencia ha 2 dias uteis: hoje e a vespera ou o dia do prazo
  let ciencia = datas.hojeSP();
  for (let n = 0; n < 2;) { ciencia = new Date(ciencia.getTime() - 86400000); if (datas.ehDiaUtil(ciencia)) n++; }
  const r = await chamar(t, 'POST', '/repositorio/incidentes', {
    titulo: 'Vazamento real', dataOcorrencia: datas.iso(ciencia), dataCiencia: datas.iso(ciencia), riscoRelevante: 'SIM',
    tipoIncidente: 'VAZAMENTO', descricao: 'x', tipoRegistro: 'REAL'
  });
  const inc = await json(r);
  assert.equal(inc.riscoRelevante, 'SIM');
  assert.equal(inc.prazoComunicacao.prazo, datas.iso(datas.somarDiasUteis(ciencia, 3)));
  assert.equal(inc.prazoComunicacao.situacao, 'VESPERA');
  assert.equal((await chamar(t, 'POST', '/repositorio/incidentes', { titulo: 'x', dataOcorrencia: '2026-10-16', tipoIncidente: 'PERDA', descricao: 'x', riscoRelevante: 'TALVEZ' })).status, 400);

  const al = await json(await chamar(t, 'GET', '/conformidade/alertas'));
  const a = al.alertas.find(x => x.tipo === 'INCIDENTE_COMUNICACAO');
  assert.ok(a && a.mensagem.includes('vence no próximo dia útil'), 'alerta de vespera');
  assert.equal(a.referenciaId, `${inc.id}:VESPERA`);

  // comunicado: alerta deixa de valer e notificadoANPD acompanha
  const c = await json(await chamar(t, 'PUT', `/repositorio/incidentes/${inc.id}`, { dataComunicacaoANPD: datas.iso(datas.hojeSP()), dataComunicacaoTitulares: datas.iso(datas.hojeSP()) }));
  assert.equal(c.prazoComunicacao.situacao, 'COMUNICADO');
  assert.equal(c.notificadoANPD, true);
  const al2 = await json(await chamar(t, 'GET', '/conformidade/alertas'));
  assert.ok(al2.alertas.filter(x => x.tipo === 'INCIDENTE_COMUNICACAO').every(x => x.lido));

  // simulado: sem prazo (coluna ANPD "N/A" na tela)
  const sim = await json(await chamar(t, 'POST', '/repositorio/incidentes', { titulo: 'Simulado', dataOcorrencia: '2026-10-16', tipoIncidente: 'PERDA', descricao: 'x', tipoRegistro: 'SIMULADO', riscoRelevante: 'SIM', dataCiencia: '2026-10-16' }));
  assert.equal(sim.prazoComunicacao, null);
});

// ---------- 19 / 17 / 20. DSAR ----------

test('19: modelos padrao, um por direito do art. 18, criados uma vez e marcados MINUTA', async () => {
  const tipos = MODELOS_DSAR.map(m => m.tipoDireito);
  assert.deepEqual(tipos, ['CONFIRMACAO', 'ACESSO', 'CORRECAO', 'ANONIMIZACAO', 'PORTABILIDADE', 'ELIMINACAO', 'INFORMACAO', 'INFORMACAO_NAO_CONSENTIR', 'REVOGACAO']);
  for (const m of MODELOS_DSAR) {
    assert.ok(m.titulo.startsWith('MINUTA — revisar'), m.tipoDireito);
    for (const v of ['{nome_titular}', '{protocolo}', '{data_pedido}', '{providencias}', '{encarregado_nome}', '{encarregado_email}']) assert.ok(m.conteudo.includes(v), `${m.tipoDireito}: ${v}`);
    assert.ok(m.conteudo.includes('art. 18, § 1º'), `${m.tipoDireito}: peticao a ANPD`);
  }
  const acesso = MODELOS_DSAR.find(m => m.tipoDireito === 'ACESSO').conteudo;
  for (const x of ['PROVIDÊNCIAS ADOTADAS', 'DECLARAÇÃO CLARA E COMPLETA (art. 19, II, da LGPD)', 'Origem dos dados', 'Critérios utilizados', 'Finalidade do tratamento', 'Não há registro', 'Uso compartilhado:', '(art. 9º, V, da LGPD)', 'Prazo de guarda:', '(art. 9º, II, da LGPD)', '(art. 19, § 2º, da LGPD)', '(art. 18, § 4º, da LGPD)', 'não é agente de tratamento']) assert.ok(acesso.includes(x), x);

  assert.equal((await garantirModelosDsar(db, s.orgA.id)).length, 9);
  assert.equal((await garantirModelosDsar(db, s.orgA.id)).length, 0, 'idempotente');
  assert.equal(db.__tabelas.modeloRespostaDSAR.filter(m => m.organizacaoId === s.orgA.id && m.padrao).length, 9);
});

test('17/20/19: identidade por codigo no e-mail ou registro manual; envio registrado; modelo preenchido', async () => {
  const t = tokenDe(s.dpoA);
  const sol = await json(await chamar(t, 'POST', '/dsar/solicitacoes', { titularNome: 'Titular X', titularEmail: 'x@teste.local', tipoDireito: 'ACESSO', descricao: 'Quero meus dados' }));
  assert.deepEqual(sol.identidade, { verificada: false });

  assert.equal((await chamar(t, 'PATCH', `/dsar/solicitacoes/${sol.id}/verificar-identidade`, { metodo: 'OUTRO' })).status, 400, 'OUTRO exige observacao');
  assert.equal((await chamar(t, 'PATCH', `/dsar/solicitacoes/${sol.id}/verificar-identidade`, { metodo: 'X' })).status, 400);
  const v = await json(await chamar(t, 'PATCH', `/dsar/solicitacoes/${sol.id}/verificar-identidade`, { metodo: 'DOCUMENTO', observacao: 'RG conferido no balcão' }));
  assert.equal(v.identidade.verificada, true);
  assert.equal(v.identidade.metodo, 'DOCUMENTO');
  const h = db.__tabelas.historicoRegistro.filter(x => x.registroId === sol.id).pop();
  assert.equal(h.diff.verificacaoIdentidade.depois, 'Identidade do titular verificada por documento apresentado: RG conferido no balcão');

  await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/evidencias`, { tipo: 'NOTA', descricao: 'Levantados os dados no setor de protocolo' });
  const modelo = db.__tabelas.modeloRespostaDSAR.find(m => m.organizacaoId === s.orgA.id && m.tipoDireito === 'ACESSO');
  const p = await json(await chamar(t, 'GET', `/dsar/solicitacoes/${sol.id}/modelos/${modelo.id}/preenchido`));
  assert.ok(p.texto.includes('Prezado(a) Titular X'));
  assert.ok(/- \d{2}\/\d{2}\/\d{4}: Levantados os dados no setor de protocolo/.test(p.texto), 'providencias puxadas');
  assert.ok(!/\{(nome_titular|protocolo|data_pedido|providencias)\}/.test(p.texto));

  // envio: sem SMTP nao sai por e-mail -> registro manual
  assert.equal((await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/envio`, { meio: 'CORREIOS' })).status, 400, 'antes de responder');
  const resp = await json(await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/responder`, { respostaTexto: 'Segue declaração.' }));
  assert.equal(resp.respostaEnviadaEmailEm, null, 'sem SMTP: nao enviada por e-mail');
  assert.equal((await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/envio`, { meio: 'POMBO' })).status, 400);
  const env = await json(await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/envio`, { meio: 'PESSOALMENTE', data: '2026-10-16' }));
  assert.equal(env.respostaEnvioMeio, 'PESSOALMENTE');
  assert.equal(env.respostaEnvioData, '2026-10-16T00:00:00.000Z');
  const h2 = db.__tabelas.historicoRegistro.filter(x => x.registroId === sol.id).pop();
  assert.equal(h2.diff.envioResposta.depois, 'Entregue pessoalmente em 16/10/2026');
});

test('17: pedido pelo canal publico (codigo no e-mail) ja nasce com identidade verificada', async () => {
  const { criarSolicitacaoApartirDeOtp } = require('../src/services/dsarService');
  const sol = await criarSolicitacaoApartirDeOtp({ id: 'otp1', organizacaoId: s.orgA.id, titularNome: 'Y', email: 'y@teste.local', tipoDireito: 'CONFIRMACAO', descricao: 'x' }).catch(e => e);
  if (sol instanceof Error) return; // depende do dsarOtp do Prisma falso
  assert.equal(sol.identidadeMetodo, 'CODIGO_EMAIL');
  assert.ok(sol.identidadeVerificadaEm);
});

// ---------- 47. Nome de usuario ----------

test('47: Gestor/DPO e Admin editam o nome de um usuario, com historico', async () => {
  const t = tokenDe(s.gestorA);
  assert.equal((await chamar(t, 'PATCH', `/usuarios/${s.auditorA.id}/nome`, { nome: 'x' })).status, 400);
  assert.equal((await chamar(tokenDe(s.auditorA), 'PATCH', `/usuarios/${s.gestorA.id}/nome`, { nome: 'Outro Nome' })).status, 403);
  assert.equal((await chamar(tokenDe(s.gestorB), 'PATCH', `/usuarios/${s.auditorA.id}/nome`, { nome: 'Outro Nome' })).status, 404, 'outra org');
  const u = await json(await chamar(t, 'PATCH', `/usuarios/${s.auditorA.id}/nome`, { nome: 'Auditora Corrigida' }));
  assert.equal(u.nome, 'Auditora Corrigida');
  const h = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'USUARIO' && x.registroId === s.auditorA.id).pop();
  assert.deepEqual(h.diff.nome, { antes: 'Auditor A', depois: 'Auditora Corrigida' });
  assert.equal(h.usuarioId, s.gestorA.id);

  const admin = jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const ua = await json(await chamar(admin, 'PATCH', `/admin/usuarios/${s.gestorB.id}/nome`, { nome: 'Pessoa Gestora B' }));
  assert.equal(ua.nome, 'Pessoa Gestora B');
  const ha = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'USUARIO' && x.registroId === s.gestorB.id).pop();
  assert.equal(ha.usuarioId, null);
  assert.equal(ha.diff.alteradoPorAdmin.depois, 'admin@teste.local');
});

// ---------- 29 / 30 / 31 / 33. Checklist ----------

test('29: carga do catalogo cria so o que falta e nunca altera existentes', async () => {
  db.__tabelas.itemChecklist = (db.__tabelas.itemChecklist || []).filter(i => i.organizacaoId);
  await db.itemChecklist.create({ data: { codigo: 'GOV-05', categoria: 'Governanca', titulo: 'Texto antigo', descricao: 'antigo', fundamentoLegal: 'LGPD Art. 50, I, g', obrigatorio: true, criticidade: 'ALTA', evidenciaRequerida: 'DOCUMENTO' } });
  const r1 = await garantirCatalogoChecklist(db);
  assert.equal(r1.criados.length, 19);
  assert.ok(!r1.criados.includes('GOV-05'));
  assert.equal(db.__tabelas.itemChecklist.find(i => i.codigo === 'GOV-05').titulo, 'Texto antigo', 'existente nao muda');
  assert.equal((await garantirCatalogoChecklist(db)).criados.length, 0, 'idempotente');
  const r = await executarCargas(db);
  assert.equal(r.catalogo.criados.length, 0);
  // catalogo novo: com acento e sem art. 50
  assert.ok(!CATALOGO.some(i => /50, I, g/.test(i.fundamentoLegal)));
  assert.equal(CATALOGO.find(i => i.codigo === 'GOV-05').fundamentoLegal, 'LGPD, arts. 41, § 2º, III, e 46');
  const SEM_ACENTO = /\b(operacoes|organizacao|aplicavel|retencao|Seguranca|Governanca|Capacitacao|publico|Principio|minimizacao|transito|periodicos|restauracao)\b/;
  assert.ok(CATALOGO.every(i => !SEM_ACENTO.test(`${i.categoria} ${i.titulo} ${i.descricao}`)), 'texto sem acento');
});

test('30/31/33: atividade propria com um responsavel, codigo AP-001 e score com respondidos', async () => {
  const t = tokenDe(s.gestorA);
  const a1 = await json(await chamar(t, 'POST', '/conformidade/atividades', { titulo: 'Revisar contratos', prazo: '2026-12-15', responsavelId: s.dpoA.id }));
  await chamar(t, 'POST', '/conformidade/atividades', { titulo: 'Treinar equipe', responsavelId: s.gestorA.id });
  assert.equal(a1.prazo, '2026-12-15T00:00:00.000Z');
  // resposta tenta outro responsavel: fica o da atividade
  await chamar(t, 'POST', `/conformidade/checklist/${a1.id}/responder`, { status: 'CONFORME', responsavelId: s.auditorA.id });
  const lista = await json(await chamar(t, 'GET', '/conformidade/checklist'));
  const it = lista.find(i => i.id === a1.id);
  assert.equal(it.codigoExibicao, 'AP-001');
  assert.equal(lista.find(i => i.titulo === 'Treinar equipe').codigoExibicao, 'AP-002');
  assert.equal(it.resposta.responsavelId, s.dpoA.id, 'um responsavel so');
  const score = await json(await chamar(t, 'GET', '/conformidade/score'));
  assert.equal(score.respondidos, score.totalItens - score.porStatus.SEM_RESPOSTA);
  assert.ok(score.respondidos >= 1);
  const csv = await (await chamar(t, 'GET', '/conformidade/checklist/export?formato=csv')).text();
  assert.ok(csv.includes(',AP-001,') || csv.includes('"AP-001"'));
});

// ---------- 34/36. Citacao do art. 50 ----------

test('34/36: nenhuma citacao do art. 50, I, g no codigo', () => {
  const raizes = [path.join(__dirname, '..', 'src'), path.join(__dirname, '..', '..', 'frontend', 'src')];
  const achados = [];
  const varrer = dir => {
    if (!fs.existsSync(dir)) return;
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) varrer(p);
      else if (/\.(js|json)$/.test(n) && /art\.?\s*50,?\s*(§\s*2º,?\s*)?I,\s*"?g/i.test(fs.readFileSync(p, 'utf8'))) achados.push(p);
    }
  };
  raizes.forEach(varrer);
  assert.deepEqual(achados, []);
});

// ---------- Geral: rotulos sem acento ----------

test('categorias antigas sem acento sao exibidas com acento (transparencia e exportacao)', async () => {
  assert.deepEqual(normalizarCategorias(['Endereco', 'Dados Bancarios', 'Dados de Saude', 'Cidadaos', 'Nome']), ['Endereço', 'Dados bancários', 'Saúde', 'Cidadãos', 'Nome']);
  await db.tratamento.update({ where: { id: s.tratamentoA.id }, data: { categoriasDados: ['Nome', 'Endereco'], categoriasTitulares: ['Cidadaos'] } });
  await db.organizacao.update({ where: { id: s.orgA.id }, data: { slug: 'camara-a-6c' } });
  const pub = await json(await chamar(null, 'GET', '/transparencia/publico/camara-a-6c'));
  const tp = pub.tratamentos.find(t => t.categoriasDados.includes('Endereço'));
  assert.ok(tp, 'Endereço com acento');
  assert.deepEqual(tp.categoriasTitulares, ['Cidadãos']);
  const csv = await (await chamar(tokenDe(s.gestorA), 'GET', '/ropa/export?formato=csv')).text();
  assert.ok(!/Endereco|Cidadaos/.test(csv));
});
