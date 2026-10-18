const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { db, subir, semear, tokenDe } = require('./helpers/app');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const get = (token, caminho) => fetch(`${srv.base}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
const post = (token, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: 'POST',
  headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

// Uma rota GET autenticada de cada router de modulo.
const ROTAS = [
  '/auth/me',
  '/perfil/perfil',
  '/documents',
  '/ropa/tratamentos',
  '/dsar/solicitacoes',
  '/pesquisa/setores',
  '/repositorio/incidentes',
  '/conformidade/checklist',
  '/conformidade/alertas',
  '/treinamento/trilhas',
  '/usuarios'
];

test('token mfaPending e mfaSetup sao rejeitados com 401 em todas as rotas de modulo', async () => {
  const pendente = jwt.sign({ mfaPending: true, userId: s.gestorA.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const setup = jwt.sign({ mfaSetup: true, userId: s.gestorA.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
  // Mesmo se alguem forjasse um token pendente com organizacaoId, continua 401
  const pendenteComOrg = tokenDe(s.gestorA, { mfaPending: true });
  for (const rota of ROTAS) {
    for (const [nome, tok] of [['mfaPending', pendente], ['mfaSetup', setup], ['mfaPending+org', pendenteComOrg]]) {
      const r = await get(tok, rota);
      assert.equal(r.status, 401, `${rota} com ${nome} deveria ser 401 (veio ${r.status})`);
    }
  }
  const anexo = await get(pendente, `/anexos?entidade=TRATAMENTO&registroId=${s.tratamentoA.id}`);
  assert.equal(anexo.status, 401);
  const hist = await get(pendente, `/historico?entidade=TRATAMENTO&registroId=${s.tratamentoA.id}`);
  assert.equal(hist.status, 401);
});

test('token de sessao completa continua passando', async () => {
  const ok = tokenDe(s.gestorA);
  for (const rota of ROTAS.filter(r => r !== '/auth/me')) {
    const r = await get(ok, rota);
    assert.equal(r.status, 200, `${rota} com sessao valida deveria ser 200 (veio ${r.status})`);
  }
});

test('org com MFA obrigatorio: login sem MFA nao recebe sessao, configura e entra', async () => {
  const senha = 'senha-de-teste-123';
  await db.organizacao.update({ where: { id: s.orgB.id }, data: { mfaObrigatorio: true } });
  await db.usuario.update({ where: { id: s.gestorB.id }, data: { senhaHash: await bcrypt.hash(senha, 4), mfaAtivo: false, mfaSecret: null } });

  const login = await (await post(null, '/auth/login', { email: s.gestorB.email, senha })).json();
  assert.equal(login.mfaSetupObrigatorio, true);
  assert.equal(login.token, undefined, 'sem sessao antes de configurar MFA');
  assert.ok(login.setupToken);

  // setupToken nao abre modulo nenhum
  assert.equal((await get(login.setupToken, '/ropa/tratamentos')).status, 401);
  assert.equal((await get(login.setupToken, '/auth/me')).status, 401);

  const cfg = await post(login.setupToken, '/auth/mfa/configurar', {});
  assert.equal(cfg.status, 200);
  const { secret } = await cfg.json();

  const errado = await post(login.setupToken, '/auth/mfa/ativar', { codigo: '000000' });
  assert.equal(errado.status, 400);

  const codigo = speakeasy.totp({ secret, encoding: 'base32' });
  const ativ = await post(login.setupToken, '/auth/mfa/ativar', { codigo });
  assert.equal(ativ.status, 200);
  const sessao = await ativ.json();
  assert.ok(sessao.token, 'ativar conclui o login');
  assert.equal((await get(sessao.token, '/usuarios')).status, 200);

  // Proximo login ja pede o codigo (fluxo mfaPending normal)
  const login2 = await (await post(null, '/auth/login', { email: s.gestorB.email, senha })).json();
  assert.equal(login2.mfaPendente, true);
  assert.equal(login2.token, undefined);

  // Org obriga MFA: nao da para desativar
  const desativar = await fetch(`${srv.base}/auth/mfa/desativar`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: speakeasy.totp({ secret, encoding: 'base32' }) })
  });
  assert.equal(desativar.status, 403);
});

test('org sem MFA obrigatorio: login normal continua emitindo sessao', async () => {
  const senha = 'outra-senha-456';
  await db.usuario.update({ where: { id: s.dpoA.id }, data: { senhaHash: await bcrypt.hash(senha, 4) } });
  const login = await (await post(null, '/auth/login', { email: s.dpoA.email, senha })).json();
  assert.ok(login.token);
  assert.equal(login.mfaSetupObrigatorio, undefined);
});
