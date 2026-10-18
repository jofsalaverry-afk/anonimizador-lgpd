const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { subir, semear, tokenDe } = require('./helpers/app');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

function enviar(token, categoria) {
  const fd = new FormData();
  fd.append('titulo', `Documento ${categoria}`);
  fd.append('categoria', categoria);
  fd.append('arquivo', new Blob([Buffer.from('%PDF-1.4 aditivo')], { type: 'application/pdf' }), 'doc.pdf');
  return fetch(`${srv.base}/repositorio/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
}

test('upload do DPO/Gestor aceita TERMO e ADITIVO e recusa categoria invalida', async () => {
  const dpo = tokenDe(s.dpoA);
  assert.equal((await enviar(dpo, 'ADITIVO')).status, 201);
  assert.equal((await enviar(dpo, 'TERMO')).status, 201);
  assert.equal((await enviar(dpo, 'CATEGORIA_INVENTADA')).status, 400);
  // Etapa 7b: o Gestor tambem envia; Operador e Auditor nao
  assert.equal((await enviar(tokenDe(s.gestorA), 'TERMO')).status, 201, 'Gestor envia');
  assert.equal((await enviar(tokenDe(s.auditorA), 'TERMO')).status, 403, 'Auditor não envia');
});
