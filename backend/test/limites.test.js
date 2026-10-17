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

// Como o Railway entrega (medido no poc): X-Forwarded-For = "<cliente>, <no de borda>".
// O no de borda muda entre requisicoes; o contador tem de ser o do cliente.
const doIp = (ip, borda = '35.0.0.1') => ({ 'Content-Type': 'application/json', 'X-Forwarded-For': `${ip}, ${borda}` });
const post = (caminho, ip, body, borda) => fetch(`${base}${caminho}`, { method: 'POST', headers: doIp(ip, borda), body: JSON.stringify(body) });

test('chave do limite e o IP do cliente (nao o objeto req)', () => {
  assert.equal(chaveIp({ ip: '203.0.113.7' }), '203.0.113.7');
  assert.equal(chaveIp({ ip: '2001:db8:1:2:3:4:5:6' }), chaveIp({ ip: '2001:db8:1:2:ffff::1' }), 'IPv6 agrupado por /64');
});

test('login: 10 falhas na MESMA conta e a 11a recebe 429, mesmo passando por nos de borda diferentes', async () => {
  const ip = '198.51.100.10';
  const st = [];
  for (let i = 0; i < 11; i++) {
    // cada tentativa chega por um no de borda diferente do Railway
    st.push((await post('/auth/login', ip, { email: 'alvo@teste.local', senha: `errada-${i}` }, `35.0.0.${i + 1}`)).status);
  }
  assert.deepEqual(st.slice(0, 10), Array(10).fill(401));
  assert.equal(st[10], 429);
  // Etapa 7b: um colega no MESMO IP (outra conta) nao e bloqueado
  assert.equal((await post('/auth/login', ip, { email: 'colega@teste.local', senha: 'errada-123' })).status, 401, 'colega no mesmo IP');
  // e-mail com maiusculas conta como a mesma conta
  assert.equal((await post('/auth/login', ip, { email: 'ALVO@teste.local', senha: 'x' })).status, 429);
  // outro cliente (outro IP) nao e afetado
  assert.equal((await post('/auth/login', '198.51.100.11', { email: 'alvo@teste.local', senha: 'errada-123' }, '35.0.0.1')).status, 401);
});

test('teto por IP: 50 falhas somando varias contas e a 51a recebe 429', async () => {
  const ip = '198.51.100.12';
  const st = [];
  for (let i = 0; i < 51; i++) st.push((await post('/auth/login', ip, { email: `conta${i % 6}@teste.local`, senha: 'errada' })).status);
  assert.ok(st.slice(0, 50).every(x => x === 401), 'até 50 erros (nenhuma conta passou de 10)');
  assert.equal(st[50], 429);
});

test('codigo MFA errado tambem conta no limite de /auth', async () => {
  const ip = '198.51.100.20';
  for (let i = 0; i < 10; i++) await post('/auth/mfa/verificar', ip, { tempToken: 'x', codigo: '123456' });
  assert.equal((await post('/auth/mfa/verificar', ip, { tempToken: 'x', codigo: '123456' })).status, 429);
});

test('login do Admin: 10 falhas na conta e a 11a recebe 429 (contador proprio)', async () => {
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

test('painel autenticado: limite por usuario, nao por IP (servidores da mesma camara nao se bloqueiam)', async () => {
  const jwt = require('jsonwebtoken');
  const { chaveUsuarioOuIp, LIMITE_PAINEL_POR_MINUTO } = require('../src/middlewares/seguranca');
  const tok = id => jwt.sign({ id, organizacaoId: 'o1', perfil: 'OPERADOR' }, process.env.JWT_SECRET);
  assert.equal(chaveUsuarioOuIp({ headers: { authorization: `Bearer ${tok('u1')}` }, ip: '203.0.113.9' }), 'u:u1');
  assert.equal(chaveUsuarioOuIp({ headers: {}, ip: '203.0.113.9' }), '203.0.113.9', 'sem sessão: IP');
  assert.ok(LIMITE_PAINEL_POR_MINUTO >= 300);
  // 70 chamadas de dois usuarios pelo mesmo IP: nenhuma 429 (antes da correcao seria 60/min por IP)
  const ip = '198.51.100.40';
  const st = [];
  for (let i = 0; i < 70; i++) {
    const r = await fetch(`${base}/ropa/tratamentos`, { headers: { ...doIp(ip), Authorization: `Bearer ${tok(i % 2 ? 'ua' : 'ub')}` } });
    st.push(r.status);
  }
  assert.ok(!st.includes(429), 'recebeu 429 dentro do uso normal');
  // o limite existe: o mesmo usuario passando do teto recebe 429
  let ultimo;
  for (let i = 0; i < LIMITE_PAINEL_POR_MINUTO + 1; i++) ultimo = (await fetch(`${base}/ropa/tratamentos`, { headers: { ...doIp(ip), Authorization: `Bearer ${tok('uc')}` } })).status;
  assert.equal(ultimo, 429);
});
