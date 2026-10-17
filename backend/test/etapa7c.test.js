// Etapa 7c: PDF digitalizado (sem texto) com o OCR desligado — mensagem
// clara, nunca erro 500. Tambem com o OCR ligado e o servico fora do ar.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');
const { subir, semear, tokenDe } = require('./helpers/app');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const MSG = 'PDF digitalizado sem texto: não é possível processar; envie um PDF com texto selecionável.';

// "Digitalizado": so desenho, nenhum texto selecionavel
const pdfSemTexto = () => new Promise(res => {
  const d = new PDFDocument(); const p = [];
  d.on('data', b => p.push(b)); d.on('end', () => res(Buffer.concat(p)));
  d.rect(50, 50, 400, 600).fill('#999999'); d.end();
});
const enviar = async (rota, buf) => {
  const fd = new FormData();
  fd.append('arquivo', new Blob([buf], { type: 'application/pdf' }), 'digitalizado.pdf');
  return fetch(`${srv.base}${rota}`, { method: 'POST', headers: { Authorization: `Bearer ${tokenDe(s.gestorA)}` }, body: fd });
};

async function comAmbiente(vars, fn) {
  const antes = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { await fn(); } finally {
    for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test('OCR desligado: PDF sem texto recebe 422 com a mensagem clara (anonimizar e baixar)', async () => {
  await comAmbiente({ AZURE_DOCINTEL_ENABLED: 'false' }, async () => {
    const buf = await pdfSemTexto();
    for (const rota of ['/documents/anonymize', '/documents/download-pdf']) {
      const r = await enviar(rota, buf);
      assert.equal(r.status, 422, rota);
      const b = await r.json();
      assert.equal(b.message, MSG, rota);
      assert.ok(!('stack' in b));
    }
  });
});

test('OCR ligado mas fora do ar: tambem 422, nunca 500', async () => {
  await comAmbiente({ AZURE_DOCINTEL_ENABLED: 'true', AZURE_DOCINTEL_ENDPOINT: 'http://127.0.0.1:9', AZURE_DOCINTEL_KEY: 'chave-de-teste' }, async () => {
    const r = await enviar('/documents/anonymize', await pdfSemTexto());
    assert.equal(r.status, 422);
    assert.equal((await r.json()).message, MSG);
  });
});

test('tela usa o mesmo texto quando o backend nao manda mensagem', (t) => {
  const f = require('path').join(__dirname, '..', '..', 'frontend', 'src', 'components', 'Anonimizador.js');
  if (!require('fs').existsSync(f)) return t.skip('frontend fora deste checkout');
  assert.ok(require('fs').readFileSync(f, 'utf8').includes(MSG));
});

// ---------- E-mail: pontos e "+sufixo" do Gmail ----------
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('./helpers/app');
const login = (rota, email, senha) => fetch(`${srv.base}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });

test('e-mail com ponto e "+sufixo": criar pelo Gestor e entrar com o mesmo e-mail', async () => {
  const g = tokenDe(s.gestorA);
  const email = 'Maria.Silva+camara@Gmail.com';
  const r = await fetch(`${srv.base}/usuarios`, { method: 'POST', headers: { Authorization: `Bearer ${g}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Maria Silva', email, senha: 'senha-inicial-10', perfil: 'OPERADOR' }) });
  assert.equal(r.status, 201);
  assert.ok(db.__tabelas.usuario.find(u => u.email === 'maria.silva+camara@gmail.com'), 'gravado em minúsculas, com ponto e +');
  const l = await (await login('/auth/login', email, 'senha-inicial-10')).json();
  assert.equal(l.trocaSenhaObrigatoria, true, 'achou a conta (antes: 401)');
});

test('conta antiga gravada na forma normalizada continua entrando com o e-mail digitado de sempre', async () => {
  await db.usuario.create({ data: { email: 'joaosouza@gmail.com', senhaHash: await bcrypt.hash('senha-antiga-123', 4), nome: 'João Souza', perfil: 'OPERADOR', ativo: true, organizacaoId: s.orgA.id } });
  const r = await login('/auth/login', 'joao.souza@gmail.com', 'senha-antiga-123');
  assert.equal(r.status, 200);
  assert.ok((await r.json()).token);
});

test('criar camara grava o e-mail do Gestor como digitado (sem tirar "+sufixo")', async () => {
  const admin = jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const r = await fetch(`${srv.base}/admin/camaras`, { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Câmara E-mail', cnpj: '11.222.333/0001-81', email: 'pessoa+gestor@gmail.com', senha: 'senha-inicial-10', nomeGestor: 'Pessoa Gestora' }) });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).email, 'pessoa+gestor@gmail.com');
});

test('login do Admin com e-mail em maiusculas e com a forma antiga', async () => {
  await db.admin.create({ data: { email: 'admin.teste@gmail.com', senhaHash: await bcrypt.hash('senha-admin-123', 4), nome: 'Admin' } }).catch(() => null);
  const r = await login('/admin/login', 'Admin.Teste@Gmail.com', 'senha-admin-123');
  assert.equal(r.status, 200);
});
