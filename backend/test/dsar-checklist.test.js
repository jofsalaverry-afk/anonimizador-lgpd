const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const { preencherModelo } = require('../src/services/modeloResposta');

let srv, s, solA, itemGlobal;
before(async () => {
  srv = await subir();
  s = await semear();
  solA = await db.solicitacaoTitular.create({
    data: {
      organizacaoId: s.orgA.id, protocolo: 'DSAR-2026-0001', titularNome: 'Maria Fictícia', titularEmail: 'maria@teste.local',
      tipoDireito: 'ACESSO', descricao: 'Quero acesso', status: 'EM_ANALISE'
    }
  });
  itemGlobal = await db.itemChecklist.create({
    data: { codigo: 'GOV-01', categoria: 'Governança', titulo: 'Nomear encarregado', descricao: 'Art. 41', fundamentoLegal: 'Art. 41', criticidade: 'ALTA', evidenciaRequerida: 'DOCUMENTO' }
  });
});
after(async () => { await srv.fechar(); });

function chamar(token, metodo, caminho, body) {
  return fetch(`${srv.base}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) })
  });
}

// ---------- Modelos de resposta DSAR ----------

test('preencherModelo troca as 3 variaveis e mantem as desconhecidas', () => {
  const txt = preencherModelo('Prezado(a) {nome_titular}, protocolo {protocolo} — {nome_organizacao}. {outra} {protocolo}', {
    nome_titular: 'Maria', protocolo: 'P-1', nome_organizacao: 'Câmara'
  });
  assert.equal(txt, 'Prezado(a) Maria, protocolo P-1 — Câmara. {outra} P-1');
});

test('modelos DSAR: CRUD por Gestor/DPO, uso preenchido e isolamento', async () => {
  const tG = tokenDe(s.gestorA);
  const corpo = { tipoDireito: 'ACESSO', titulo: 'Resposta de acesso', conteudo: 'Prezado(a) {nome_titular}, sobre o protocolo {protocolo}, a {nome_organizacao} informa...' };
  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', '/dsar/modelos', corpo)).status, 403);
  assert.equal((await chamar(tG, 'POST', '/dsar/modelos', { ...corpo, tipoDireito: 'X' })).status, 400);

  const m = await (await chamar(tG, 'POST', '/dsar/modelos', corpo)).json();
  const lista = await (await chamar(tokenDe(s.auditorA), 'GET', '/dsar/modelos?tipoDireito=ACESSO')).json();
  assert.deepEqual(lista.map(x => x.id), [m.id], 'leitura liberada para todos do modulo');

  const p = await (await chamar(tG, 'GET', `/dsar/solicitacoes/${solA.id}/modelos/${m.id}/preenchido`)).json();
  assert.equal(p.texto, 'Prezado(a) Maria Fictícia, sobre o protocolo DSAR-2026-0001, a Câmara A informa...');

  const tB = tokenDe(s.gestorB);
  assert.equal((await chamar(tB, 'GET', `/dsar/solicitacoes/${solA.id}/modelos/${m.id}/preenchido`)).status, 404);
  assert.equal((await chamar(tB, 'PUT', `/dsar/modelos/${m.id}`, { titulo: 'Hack' })).status, 404);
  assert.equal((await chamar(tB, 'DELETE', `/dsar/modelos/${m.id}`)).status, 404);
  assert.equal((await (await chamar(tB, 'GET', '/dsar/modelos')).json()).length, 0);

  await chamar(tG, 'PUT', `/dsar/modelos/${m.id}`, { titulo: 'Resposta padrão de acesso' });
  assert.equal((await chamar(tG, 'DELETE', `/dsar/modelos/${m.id}`)).status, 200);
  const h = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'MODELO_DSAR' && x.registroId === m.id);
  assert.deepEqual(h.map(x => x.acao), ['CRIAR', 'EDITAR', 'EXCLUIR']);
  assert.equal(h[2].diff.texto.antes, corpo.conteudo, 'conteudo preservado no historico apos excluir');
});

// ---------- Atividades proprias do checklist ----------

test('atividade propria: criada pela org A, invisivel e intocavel para B', async () => {
  const tA = tokenDe(s.gestorA);
  const tB = tokenDe(s.gestorB);
  assert.equal((await chamar(tA, 'POST', '/conformidade/atividades', { titulo: '' })).status, 400);
  assert.equal((await chamar(tA, 'POST', '/conformidade/atividades', { titulo: 'X', responsavelId: s.gestorB.id })).status, 400);

  const r = await chamar(tA, 'POST', '/conformidade/atividades', {
    titulo: 'Revisar contratos de TI', descricao: 'Incluir cláusula LGPD', responsavelId: s.dpoA.id, prazo: '2026-12-15', criticidade: 'ALTA'
  });
  assert.equal(r.status, 201);
  const at = await r.json();
  assert.equal(at.organizacaoId, s.orgA.id);
  assert.equal(at.responsavel.nome, 'DPO A');
  assert.equal(at.categoria, 'Atividades próprias');

  const listaA = await (await chamar(tA, 'GET', '/conformidade/checklist')).json();
  assert.ok(listaA.some(i => i.id === at.id) && listaA.some(i => i.id === itemGlobal.id));
  const listaB = await (await chamar(tB, 'GET', '/conformidade/checklist')).json();
  assert.ok(!listaB.some(i => i.id === at.id), 'B nao ve atividade da A');
  assert.ok(listaB.some(i => i.id === itemGlobal.id), 'B ve o catalogo global');

  assert.equal((await chamar(tB, 'POST', `/conformidade/checklist/${at.id}/responder`, { status: 'CONFORME' })).status, 404);
  assert.equal((await chamar(tB, 'PUT', `/conformidade/atividades/${at.id}`, { titulo: 'Hack' })).status, 404);
  assert.equal((await chamar(tA, 'PUT', `/conformidade/atividades/${itemGlobal.id}`, { titulo: 'Hack' })).status, 404, 'catalogo global nao e editavel');
  assert.equal((await chamar(tB, 'GET', `/historico?entidade=CHECKLIST_ITEM&registroId=${at.id}`)).status, 404);
  assert.equal((await chamar(tB, 'GET', `/anexos?entidade=CHECKLIST_ITEM&registroId=${at.id}`)).status, 404);

  // score: A conta a atividade propria, B nao
  const scoreA = await (await chamar(tA, 'GET', '/conformidade/score')).json();
  const scoreB = await (await chamar(tB, 'GET', '/conformidade/score')).json();
  assert.equal(scoreA.totalItens, scoreB.totalItens + 1);
});

test('atividade propria: responder com evidencia anexada e alerta de prazo vencido', async () => {
  const tA = tokenDe(s.gestorA);
  const at = await (await chamar(tA, 'POST', '/conformidade/atividades', { titulo: 'Treinar recepção', prazo: '2026-01-10' })).json();

  const fd = new FormData();
  fd.append('entidade', 'CHECKLIST_ITEM');
  fd.append('registroId', at.id);
  fd.append('arquivo', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])], { type: 'image/png' }), 'lista-presenca.png');
  assert.equal((await fetch(`${srv.base}/anexos`, { method: 'POST', headers: { Authorization: `Bearer ${tA}` }, body: fd })).status, 201);
  const anexos = await (await chamar(tA, 'GET', `/anexos?entidade=CHECKLIST_ITEM&registroId=${at.id}`)).json();
  assert.equal(anexos[0].nomeArquivo, 'lista-presenca.png');

  let alertas = (await (await chamar(tA, 'GET', '/conformidade/alertas')).json()).alertas;
  assert.ok(alertas.some(a => a.referenciaId === at.id && a.criticidade === 'ALTA' && /prazo vencido/.test(a.mensagem)));

  assert.equal((await chamar(tA, 'POST', `/conformidade/checklist/${at.id}/responder`, { status: 'CONFORME', observacao: 'Feito' })).status, 200);
  await db.alertaConformidade.updateMany({ where: { referenciaId: at.id }, data: { lido: true } });
  alertas = (await (await chamar(tA, 'GET', '/conformidade/alertas')).json()).alertas;
  assert.ok(!alertas.some(a => a.referenciaId === at.id && !a.lido), 'concluida nao gera novo alerta');
});
