const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, subir, semear, tokenDe } = require('./helpers/app');

let srv, s;
before(async () => {
  srv = await subir();
  s = await semear();
  const A = s.orgA.id;
  await db.organizacao.update({ where: { id: A }, data: { slug: 'camara-a', encarregadoNome: 'Encarregada Pública', encarregadoEmail: 'lgpd@camara-a.local' } });
  await db.organizacao.update({ where: { id: s.orgB.id }, data: { slug: 'camara-b' } });
  const setor = await db.setor.create({ data: { organizacaoId: A, nome: 'Setor Interno Secreto' } });
  const terc = await db.terceiro.create({ data: { organizacaoId: A, razaoSocial: 'Hospedagem SA', cnpj: '99.888.777/0001-66', risco: 'ALTO' } });
  await db.tratamento.update({ where: { id: s.tratamentoA.id }, data: { setorId: setor.id, responsavelId: s.dpoA.id, medidasSeguranca: 'Firewall interno XYZ', retencaoDias: 365 } });
  await db.compartilhamentoTratamento.create({ data: { tratamentoId: s.tratamentoA.id, terceiroNome: 'Hospedagem SA', terceiroCNPJ: '99.888.777/0001-66', terceiroId: terc.id, finalidadeCompartilhamento: 'Hospedagem', paisDestino: 'Estados Unidos' } });
  await db.tratamento.create({ data: { organizacaoId: A, nome: 'Tratamento Desativado', finalidade: 'x', baseLegal: 'CONSENTIMENTO', ativo: false } });
  await db.tratamento.create({ data: { organizacaoId: s.orgB.id, nome: 'Tratamento da Câmara B', finalidade: 'x', baseLegal: 'CONSENTIMENTO', ativo: true } });
  await db.anexo.create({ data: { organizacaoId: A, entidade: 'TRATAMENTO', registroId: s.tratamentoA.id, nomeArquivo: 'anexo-interno.pdf', mimeType: 'application/pdf', tamanho: 1, conteudo: Buffer.from('%'), hashSha256: 'x', enviadoPorId: s.gestorA.id } });
});
after(async () => { await srv.fechar(); });

function chamar(token, metodo, caminho, body) {
  return fetch(`${srv.base}${caminho}`, {
    method: metodo,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) })
  });
}

function todasAsChaves(o, acc = new Set()) {
  if (Array.isArray(o)) o.forEach(x => todasAsChaves(x, acc));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.add(k); todasAsChaves(v, acc); }
  return acc;
}

// ---------- Pagina publica ----------

test('pagina publica: informacao ao titular sem nada interno', async () => {
  const r = await chamar(null, 'GET', '/transparencia/publico/camara-a');
  assert.equal(r.status, 200);
  const p = await r.json();
  const txt = JSON.stringify(p);

  const proibidas = ['id', 'organizacaoId', 'responsavelId', 'responsavel', 'setor', 'setorId', 'risco', 'terceiroId', 'terceiroCNPJ',
    'cnpj', 'anexos', 'medidasSeguranca', 'retencaoDias', 'modulosAtivos', 'ativo', 'slug'];
  const chaves = todasAsChaves(p);
  for (const k of proibidas) assert.ok(!chaves.has(k), `campo interno exposto: ${k}`);
  for (const marca of ['Setor Interno Secreto', '99.888.777', 'ALTO', 'DPO A', 'Firewall interno', 'anexo-interno', 'Tratamento Desativado', 'Câmara B']) {
    assert.ok(!txt.includes(marca), `vazou: ${marca}`);
  }

  assert.deepEqual(p.tratamentos.map(t => t.nome), ['Folha de pagamento']);
  assert.equal(p.tratamentos[0].baseLegal, 'Cumprimento de obrigação legal ou regulatória');
  assert.deepEqual(p.tratamentos[0].compartilhamentos, [{ destinatario: 'Hospedagem SA', finalidade: 'Hospedagem', pais: 'Estados Unidos', transferenciaInternacional: true }]);
  assert.deepEqual(p.encarregado, { nome: 'Encarregada Pública', email: 'lgpd@camara-a.local', telefone: null });
  assert.equal(p.canalSolicitacao, '#solicitar/camara-a');
  assert.ok(p.direitos.length >= 9);
  assert.ok(p.faq.length > 0, 'FAQ padrão');
});

test('pagina publica: slug inexistente ou organizacao desativada = 404', async () => {
  assert.equal((await chamar(null, 'GET', '/transparencia/publico/nao-existe')).status, 404);
  await db.organizacao.update({ where: { id: s.orgB.id }, data: { ativo: false } });
  assert.equal((await chamar(null, 'GET', '/transparencia/publico/camara-b')).status, 404);
  await db.organizacao.update({ where: { id: s.orgB.id }, data: { ativo: true } });
});

test('dados do encarregado e FAQ: so Gestor/DPO, validados, com historico e isolados', async () => {
  const tA = tokenDe(s.gestorA);
  assert.equal((await chamar(tokenDe(s.auditorA), 'PUT', '/organizacao/dados', { encarregadoNome: 'X' })).status, 403);
  assert.equal((await chamar(tA, 'PUT', '/organizacao/dados', { uf: 'XX' })).status, 400);
  assert.equal((await chamar(tA, 'PUT', '/organizacao/dados', { encarregadoEmail: 'invalido' })).status, 400);
  const r = await (await chamar(tA, 'PUT', '/organizacao/dados', { encarregadoTelefone: '(51) 3000-0000', uf: 'rs', municipio: 'Cidade' })).json();
  assert.equal(r.uf, 'RS');
  const h = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'ORGANIZACAO' && x.registroId === s.orgA.id);
  assert.deepEqual(h[0].diff.encarregadoTelefone, { antes: null, depois: '(51) 3000-0000' });
  const dadosB = await (await chamar(tokenDe(s.gestorB), 'GET', '/organizacao/dados')).json();
  assert.equal(dadosB.encarregadoNome, null, 'B não vê dados da A');

  assert.equal((await chamar(tA, 'PUT', '/organizacao/faq', { faq: [{ pergunta: 'Só pergunta' }] })).status, 400);
  await chamar(tA, 'PUT', '/organizacao/faq', { faq: [{ pergunta: 'Onde fica a Câmara?', resposta: 'No centro.' }] });
  const pub = await (await chamar(null, 'GET', '/transparencia/publico/camara-a')).json();
  assert.deepEqual(pub.faq, [{ pergunta: 'Onde fica a Câmara?', resposta: 'No centro.' }]);
  const pubB = await (await chamar(null, 'GET', '/transparencia/publico/camara-b')).json();
  assert.notDeepEqual(pubB.faq, pub.faq, 'FAQ da A não aparece na B');
});

test('trecho HTML para o portal: sem script, com os dois links, nome escapado', async () => {
  await db.organizacao.update({ where: { id: s.orgA.id }, data: { nome: 'Câmara <A> & "Cia"' } });
  const r = await (await chamar(tokenDe(s.gestorA), 'GET', '/organizacao/trecho-portal')).json();
  assert.ok(!/<script|javascript:|\son\w+=/i.test(r.html), 'sem script nem eventos');
  assert.ok(r.html.includes('href="https://anonimizadorldpd.com/#transparencia/camara-a"'));
  assert.ok(r.html.includes('href="https://anonimizadorldpd.com/#solicitar/camara-a"'));
  assert.ok(r.html.includes('Câmara &lt;A&gt; &amp; &quot;Cia&quot;'));
  const semSlug = await db.organizacao.create({ data: { nome: 'Sem slug', cnpj: '77', ativo: true, modulosAtivos: ['ropa'] } });
  const g = await db.usuario.create({ data: { email: 'g-semslug@teste.local', senhaHash: 'x', nome: 'G', perfil: 'GESTOR', ativo: true, organizacaoId: semSlug.id } });
  assert.equal((await chamar(tokenDe(g), 'GET', '/organizacao/trecho-portal')).status, 400);
});

// ---------- Gestao de usuarios ----------

test('Gestor/DPO gerenciam usuarios so da propria organizacao', async () => {
  const tA = tokenDe(s.gestorA);
  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', '/usuarios', { nome: 'X', email: 'x@teste.local', senha: '12345678', perfil: 'OPERADOR' })).status, 403);
  assert.equal((await chamar(tA, 'POST', '/usuarios', { nome: 'X', email: 'x@teste.local', senha: '12345678', perfil: 'ADMIN' })).status, 400, 'não existe perfil admin');
  assert.equal((await chamar(tA, 'POST', '/usuarios', { nome: 'X', email: 'x@teste.local', senha: 'curta', perfil: 'OPERADOR' })).status, 400);

  const r = await chamar(tA, 'POST', '/usuarios', {
    nome: 'Novo Operador', email: 'Novo@Teste.local', senha: 'senha-inicial-1', perfil: 'OPERADOR',
    organizacaoId: s.orgB.id, isAdmin: true // tentativa de escapar da propria org
  });
  assert.equal(r.status, 201);
  const novo = await r.json();
  const salvo = db.__tabelas.usuario.find(u => u.id === novo.id);
  assert.equal(salvo.organizacaoId, s.orgA.id, 'sempre na org de quem criou');
  assert.equal(salvo.email, 'novo@teste.local');
  assert.ok(await bcrypt.compare('senha-inicial-1', salvo.senhaHash));
  assert.equal(novo.senhaHash, undefined, 'resposta sem hash');

  const lista = await (await chamar(tA, 'GET', '/usuarios/gestao')).json();
  assert.ok(lista.some(u => u.id === novo.id) && !lista.some(u => u.id === s.gestorB.id));
  assert.ok(lista.every(u => u.senhaHash === undefined && u.mfaSecret === undefined));

  assert.equal((await chamar(tA, 'PATCH', `/usuarios/${s.gestorB.id}/perfil`, { perfil: 'TREINANDO' })).status, 404, 'outra org');
  assert.equal((await chamar(tA, 'PATCH', `/usuarios/${s.gestorB.id}/ativo`, { ativo: false })).status, 404, 'outra org');
  assert.equal((await chamar(tA, 'PATCH', `/usuarios/${s.gestorA.id}/perfil`, { perfil: 'OPERADOR' })).status, 400, 'não muda o próprio perfil');
  assert.equal((await chamar(tA, 'PATCH', `/usuarios/${s.gestorA.id}/ativo`, { ativo: false })).status, 400, 'não se desativa');

  const p = await (await chamar(tA, 'PATCH', `/usuarios/${novo.id}/perfil`, { perfil: 'AUDITOR' })).json();
  assert.equal(p.perfil, 'AUDITOR');
  const h = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'USUARIO' && x.registroId === novo.id);
  assert.deepEqual(h.map(x => x.acao), ['CRIAR', 'EDITAR']);
  assert.deepEqual(h[1].diff.perfil, { antes: 'OPERADOR', depois: 'AUDITOR' });
  assert.ok(!JSON.stringify(h).includes('senha'), 'senha fora do histórico');

  // desativado nao entra mais
  assert.equal((await chamar(tokenDe(s.dpoA), 'PATCH', `/usuarios/${novo.id}/ativo`, { ativo: false })).status, 200, 'DPO também gerencia');
  const login = await chamar(null, 'POST', '/auth/login', { email: 'novo@teste.local', senha: 'senha-inicial-1' });
  assert.equal(login.status, 403);
});

test('Admin: criar usuario valida perfil e senha', async () => {
  const admin = jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const url = `/admin/camaras/${s.orgB.id}/usuarios`;
  assert.equal((await chamar(admin, 'POST', url, { email: 'a@teste.local', senha: '12345678', perfil: 'SUPERUSUARIO' })).status, 400);
  assert.equal((await chamar(admin, 'POST', url, { email: 'a@teste.local', senha: '123', perfil: 'OPERADOR' })).status, 400);
  const ok = await chamar(admin, 'POST', url, { email: 'a@teste.local', nome: 'Aline', senha: '12345678', perfil: 'ENCARREGADO_LGPD' });
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).perfil, 'ENCARREGADO_LGPD');
  assert.equal((await chamar(tokenDe(s.gestorB), 'POST', url, { email: 'b@teste.local', senha: '12345678' })).status, 403, 'usuario comum não usa rota de admin');
});
