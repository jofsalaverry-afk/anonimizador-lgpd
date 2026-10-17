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
