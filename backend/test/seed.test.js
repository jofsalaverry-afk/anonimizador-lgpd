const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { db } = require('./helpers/app'); // instala o Prisma falso
const { executarSeed } = require('../src/seed');

const ENV = { SEED_ADMIN_EMAIL: 'admin@teste.local', SEED_ADMIN_SENHA: 'senha-da-variavel-123' };

beforeEach(() => db.__limpar());

test('sem as variaveis, o seed nao faz nada', async () => {
  assert.deepEqual(await executarSeed(db, {}), { acao: 'ignorado' });
  assert.deepEqual(await executarSeed(db, { SEED_ADMIN_EMAIL: 'x@teste.local' }), { acao: 'ignorado' });
  assert.equal((db.__tabelas.admin || []).length, 0);
});

test('admin inexistente e criado com a senha da variavel', async () => {
  const r = await executarSeed(db, ENV);
  assert.equal(r.acao, 'criado');
  const [admin] = db.__tabelas.admin;
  assert.ok(await bcrypt.compare(ENV.SEED_ADMIN_SENHA, admin.senhaHash));
});

test('rodar o seed duas vezes com admin existente nao muda a senha nem nada', async () => {
  const hashReal = await bcrypt.hash('senha-trocada-pelo-admin', 4);
  await db.admin.create({ data: { email: ENV.SEED_ADMIN_EMAIL, senhaHash: hashReal } });
  const antes = structuredClone(db.__tabelas.admin);

  assert.equal((await executarSeed(db, ENV)).acao, 'existente');
  assert.equal((await executarSeed(db, ENV)).acao, 'existente');

  assert.deepEqual(db.__tabelas.admin, antes, 'linha do admin identica');
  assert.ok(await bcrypt.compare('senha-trocada-pelo-admin', db.__tabelas.admin[0].senhaHash));
  assert.ok(!(await bcrypt.compare(ENV.SEED_ADMIN_SENHA, db.__tabelas.admin[0].senhaHash)));
  assert.equal(db.__tabelas.admin.length, 1, 'nao duplica');
});

test('senha curta na variavel e erro (nao cria admin fraco)', async () => {
  await assert.rejects(executarSeed(db, { SEED_ADMIN_EMAIL: 'a@teste.local', SEED_ADMIN_SENHA: '123' }), /no minimo 8/);
  assert.equal((db.__tabelas.admin || []).length, 0);
});

test('o seed nao referencia mais a tabela camara', () => {
  const fonte = require('fs').readFileSync(require.resolve('../src/seed'), 'utf8');
  assert.ok(!/prisma\.camara/.test(fonte));
  assert.ok(!/upsert/.test(fonte), 'sem upsert (que regravava a senha)');
});
