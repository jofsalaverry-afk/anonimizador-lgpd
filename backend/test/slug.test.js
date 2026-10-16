const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { db, subir, semear } = require('./helpers/app');
const { slugDoNome, slugValido } = require('../src/services/slug');

let srv, admin;
before(async () => {
  srv = await subir();
  await semear();
  admin = jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
});
after(async () => { await srv.fechar(); });

const chamar = (metodo, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: metodo, headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
  ...(body !== undefined && { body: JSON.stringify(body) })
});

test('slugDoNome: sem acento, minusculo, hifens', () => {
  assert.equal(slugDoNome('Câmara Municipal de Viamão'), 'camara-municipal-de-viamao');
  assert.equal(slugDoNome('  Câmara &amp; Cia — RS!! '), 'camara-cia-rs');
  assert.equal(slugDoNome('***'), 'organizacao');
  assert.ok(slugValido('camara-viamao'));
  for (const ruim of ['ab', 'Camara', 'camara viamao', 'camara--x', '-camara', 'camara_x']) assert.ok(!slugValido(ruim), ruim);
});

test('organizacao criada pelo admin ja nasce com slug unico', async () => {
  const corpo = { nome: 'Câmara Demo Staging', cnpj: '11111111000191', email: 'g1@teste.local', senha: '12345678', nomeGestor: 'Gestora Fictícia' };
  const r1 = await (await chamar('POST', '/admin/camaras', corpo)).json();
  assert.equal(r1.slug, 'camara-demo-staging');
  const r2 = await (await chamar('POST', '/admin/camaras', { ...corpo, cnpj: '22222222000191', email: 'g2@teste.local' })).json();
  assert.equal(r2.slug, 'camara-demo-staging-2', 'nome repetido ganha sufixo');
  assert.equal(db.__tabelas.organizacao.find(o => o.id === r1.id).slug, 'camara-demo-staging');
});

test('admin edita o slug; formato e unicidade validados', async () => {
  const org = db.__tabelas.organizacao.find(o => o.slug === 'camara-demo-staging-2');
  assert.equal((await chamar('PATCH', `/admin/camaras/${org.id}/slug`, { slug: 'Com Espaço' })).status, 400);
  const ok = await (await chamar('PATCH', `/admin/camaras/${org.id}/slug`, { slug: 'camara-viamao' })).json();
  assert.equal(ok.slug, 'camara-viamao');
  assert.equal((await chamar('PATCH', '/admin/camaras/nao-existe/slug', { slug: 'outro-slug' })).status, 404);
  const naoAdmin = await fetch(`${srv.base}/admin/camaras/${org.id}/slug`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'xyz-abc' }) });
  assert.equal(naoAdmin.status, 401);
});
