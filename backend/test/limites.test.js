// Etapa 7a, item 1: limites de tentativas por IP (app real do server.js,
// com "trust proxy" 1 como atras do proxy do Railway).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/app'); // instala o Prisma falso antes de carregar o server
const { app } = require('../src/server');
const { chaveIp } = require('../src/middlewares/seguranca');

let srv, base;
before(async () => { await new Promise(r => { srv = app.listen(0, '127.0.0.1', r); }); base = `http://127.0.0.1:${srv.address().port}`; });
after(async () => { await new Promise(r => srv.close(r)); });

// O proxy do Railway acrescenta o IP real no FIM do X-Forwarded-For.
const doIp = (ip, forjado) => ({ 'Content-Type': 'application/json', 'X-Forwarded-For': forjado ? `${forjado}, ${ip}` : ip });
const post = (caminho, ip, body, forjado) => fetch(`${base}${caminho}`, { method: 'POST', headers: doIp(ip, forjado), body: JSON.stringify(body) });

test('chave do limite e o IP do cliente (nao o objeto req)', () => {
  assert.equal(chaveIp({ ip: '203.0.113.7' }), '203.0.113.7');
  assert.equal(chaveIp({ ip: '2001:db8:1:2:3:4:5:6' }), chaveIp({ ip: '2001:db8:1:2:ffff::1' }), 'IPv6 agrupado por /64');
});

test('login de usuario: 10 falhas e a 11a recebe 429; X-Forwarded-For forjado nao escapa', async () => {
  const ip = '198.51.100.10';
  const st = [];
  for (let i = 0; i < 11; i++) {
    // o cliente forja um IP diferente a cada tentativa; o proxy acrescenta o real
    st.push((await post('/auth/login', ip, { email: `x${i}@teste.local`, senha: 'errada-123' }, `10.0.0.${i}`)).status);
  }
  assert.deepEqual(st.slice(0, 10), Array(10).fill(401));
  assert.equal(st[10], 429);
  // outro cliente (outro IP real) nao e afetado
  assert.equal((await post('/auth/login', '198.51.100.11', { email: 'y@teste.local', senha: 'errada-123' })).status, 401);
});

test('codigo MFA errado tambem conta no limite de /auth', async () => {
  const ip = '198.51.100.20';
  for (let i = 0; i < 10; i++) await post('/auth/mfa/verificar', ip, { tempToken: 'x', codigo: '123456' });
  assert.equal((await post('/auth/mfa/verificar', ip, { tempToken: 'x', codigo: '123456' })).status, 429);
});

test('login do Admin: 10 falhas e a 11a recebe 429 (contador proprio)', async () => {
  const ip = '198.51.100.30';
  const st = [];
  for (let i = 0; i < 11; i++) st.push((await post('/admin/login', ip, { email: 'admin@teste.local', senha: 'errada-123' })).status);
  assert.deepEqual(st.slice(0, 10), Array(10).fill(401));
  assert.equal(st[10], 429);
});

test('canal publico do titular: 5 por 15 min, a 6a recebe 429', async () => {
  const ip = '198.51.100.40';
  const st = [];
  for (let i = 0; i < 6; i++) st.push((await post('/dsar/publico/solicitar-otp', ip, {})).status);
  assert.ok(st.slice(0, 5).every(s => s !== 429), JSON.stringify(st));
  assert.equal(st[5], 429);
});
