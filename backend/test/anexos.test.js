const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { db, subir, semear, tokenDe } = require('./helpers/app');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const PDF = Buffer.from('%PDF-1.4\n% arquivo de teste\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

function enviar(token, { entidade, registroId, buffer = PDF, nome = 'Evidência ação.pdf', tipo = 'application/pdf' }) {
  const fd = new FormData();
  fd.append('entidade', entidade);
  fd.append('registroId', registroId);
  fd.append('arquivo', new Blob([buffer], { type: tipo }), nome);
  return fetch(`${srv.base}/anexos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
}

const get = (token, caminho) => fetch(`${srv.base}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });

test('anexo: upload, listagem e download na propria organizacao', async () => {
  const tA = tokenDe(s.gestorA);
  const r = await enviar(tA, { entidade: 'TRATAMENTO', registroId: s.tratamentoA.id });
  assert.equal(r.status, 201);
  const anexo = await r.json();
  assert.equal(anexo.nomeArquivo, 'Evidência ação.pdf', 'nome UTF-8 preservado');
  assert.equal(anexo.hashSha256, crypto.createHash('sha256').update(PDF).digest('hex'));
  assert.equal(anexo.enviadoPor.nome, 'Gestora A');
  assert.equal(anexo.conteudo, undefined, 'resposta nao traz o binario');

  const lista = await (await get(tA, `/anexos?entidade=TRATAMENTO&registroId=${s.tratamentoA.id}`)).json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].conteudo, undefined, 'listagem nao traz o binario');

  const dl = await get(tA, `/anexos/${anexo.id}/download`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'application/pdf');
  assert.match(dl.headers.get('content-disposition'), /filename\*=UTF-8''Evid%C3%AAncia%20a%C3%A7%C3%A3o\.pdf/);
  assert.deepEqual(Buffer.from(await dl.arrayBuffer()), PDF);
});

test('anexo: outra organizacao nao baixa, nao lista e nao anexa em registro alheio', async () => {
  const tA = tokenDe(s.gestorA);
  const tB = tokenDe(s.gestorB);
  const anexo = await (await enviar(tA, { entidade: 'INCIDENTE', registroId: s.incidenteA.id })).json();

  assert.equal((await get(tB, `/anexos/${anexo.id}/download`)).status, 404);
  assert.equal((await get(tB, `/anexos?entidade=INCIDENTE&registroId=${s.incidenteA.id}`)).status, 404);

  const antes = db.__tabelas.anexo.length;
  const r = await enviar(tB, { entidade: 'INCIDENTE', registroId: s.incidenteA.id });
  assert.equal(r.status, 404);
  assert.equal(db.__tabelas.anexo.length, antes, 'nada gravado');
  assert.ok(db.__tabelas.anexo.every(a => a.organizacaoId === s.orgA.id));
});

test('anexo: rejeita tipo nao permitido, conteudo falsificado, >20MB e perfil sem permissao', async () => {
  const tA = tokenDe(s.gestorA);
  const base = { entidade: 'TRATAMENTO', registroId: s.tratamentoA.id };

  const txt = await enviar(tA, { ...base, buffer: Buffer.from('ola'), nome: 'a.txt', tipo: 'text/plain' });
  assert.equal(txt.status, 400);

  const exeComoPdf = await enviar(tA, { ...base, buffer: Buffer.from('MZ\x90\x00executavel'), nome: 'a.pdf' });
  assert.equal(exeComoPdf.status, 400);
  assert.match((await exeComoPdf.json()).erro, /não corresponde/);

  const grande = Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)]);
  assert.equal((await enviar(tA, { ...base, buffer: grande })).status, 413);

  assert.equal((await enviar(tokenDe(s.auditorA), base)).status, 403);

  assert.equal((await enviar(tA, { ...base, entidade: 'USUARIO' })).status, 400, 'entidade fora da lista');
});

test('anexo: upload registra no historico do registro dono', async () => {
  const tA = tokenDe(s.gestorA);
  await enviar(tA, { entidade: 'TRATAMENTO', registroId: s.tratamentoA.id, nome: 'termo.pdf' });
  const hist = db.__tabelas.historicoRegistro.filter(h => h.registroId === s.tratamentoA.id && h.diff.anexo);
  assert.ok(hist.some(h => h.diff.anexo.depois.startsWith('termo.pdf') && h.usuarioId === s.gestorA.id));
});
