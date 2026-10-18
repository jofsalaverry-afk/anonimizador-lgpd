// Etapa 7c: protocolo DSAR unico no sistema inteiro (o indice do banco e
// global; a sequencia era contada so na camara).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const { comProtocoloUnico, ProtocoloIndisponivelError, siglaDe } = require('../src/services/dsarService');

let srv, s, orgX, orgY, gX, gY;
const TODOS = ['ropa', 'dsar', 'repositorio', 'treinamento', 'checklist', 'inventario', 'terceiros'];
const ANO = new Date().getFullYear();

before(async () => {
  srv = await subir(); s = await semear();
  // duas camaras com a MESMA sigla (DEM)
  orgX = await db.organizacao.create({ data: { nome: 'Câmara Municipal de Demonstração', cnpj: 'x1', ativo: true, modulosAtivos: TODOS } });
  orgY = await db.organizacao.create({ data: { nome: 'Câmara Municipal de Demerval', cnpj: 'y1', ativo: true, modulosAtivos: TODOS } });
  gX = await db.usuario.create({ data: { email: 'gx@teste.local', senhaHash: 'x', nome: 'Gestor X', perfil: 'GESTOR', ativo: true, organizacaoId: orgX.id } });
  gY = await db.usuario.create({ data: { email: 'gy@teste.local', senhaHash: 'x', nome: 'Gestor Y', perfil: 'GESTOR', ativo: true, organizacaoId: orgY.id } });
});
after(async () => { await srv.fechar(); });

const interno = (g, n) => fetch(`${srv.base}/dsar/solicitacoes`, {
  method: 'POST', headers: { Authorization: `Bearer ${tokenDe(g)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ titularNome: `Titular ${n}`, titularEmail: `t${n}@teste.local`, tipoDireito: 'ACESSO', descricao: 'Pedido de acesso' })
});
let nCod = 100000;
async function publico(org, n) {
  const codigo = String(++nCod);
  const email = `pub${n}@teste.local`;
  await db.dsarOtp.create({ data: { organizacaoId: org.id, email, codigo, titularNome: `Titular ${n}`, tipoDireito: 'ACESSO', descricao: 'Pedido pelo canal público', expiresAt: new Date(Date.now() + 600000), usado: false } });
  return fetch(`${srv.base}/dsar/publico/confirmar-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titularEmail: email, codigo }) });
}
const protocolos = () => db.__tabelas.solicitacaoTitular.map(x => x.protocolo).filter(p => p.startsWith(`DEM-${ANO}-`));

test('as duas camaras de teste tem a mesma sigla', () => {
  assert.equal(siglaDe(orgX.nome), 'DEM');
  assert.equal(siglaDe(orgY.nome), 'DEM');
});

test('duas camaras com a mesma sigla, pedidos intercalados (equipe e canal publico): nenhum 500, nenhum protocolo repetido', async () => {
  const passos = [() => interno(gX, 1), () => interno(gY, 2), () => publico(orgX, 3), () => publico(orgY, 4), () => interno(gY, 5), () => publico(orgX, 6)];
  for (const p of passos) {
    const r = await p();
    assert.equal(r.status, 201, `status ${r.status}`);
  }
  const ps = protocolos();
  assert.equal(ps.length, 6);
  assert.equal(new Set(ps).size, 6, 'protocolo repetido');
  assert.deepEqual([...ps].sort(), [1, 2, 3, 4, 5, 6].map(n => `DEM-${ANO}-${String(n).padStart(3, '0')}`), 'sequência contínua entre as câmaras');
});

test('pedidos simultaneos na mesma camara e entre as duas: nenhum 500, nenhum protocolo repetido', async () => {
  const antes = protocolos().length;
  const rs = await Promise.all([
    interno(gX, 11), interno(gX, 12), interno(gX, 13), interno(gX, 14),
    interno(gY, 15), publico(orgY, 16), publico(orgX, 17), interno(gY, 18)
  ]);
  assert.deepEqual(rs.map(r => r.status), Array(8).fill(201));
  const ps = protocolos();
  assert.equal(ps.length, antes + 8);
  assert.equal(new Set(ps).size, ps.length, 'protocolo repetido');
  // a camara B (outra sigla) continua com a propria sequencia
  const rB = await interno(s.gestorB, 19);
  assert.equal(rB.status, 201);
  assert.match((await rB.json()).protocolo, /^[A-Z]+-\d{4}-\d{3}$/);
});

test('se o conflito persistir, desiste com erro proprio (vira 503 na rota, nunca 500)', async () => {
  let chamadas = 0;
  const sempreConflito = async () => { chamadas++; const e = new Error('Unique'); e.code = 'P2002'; e.meta = { target: ['protocolo'] }; throw e; };
  await assert.rejects(comProtocoloUnico(orgX.id, sempreConflito), ProtocoloIndisponivelError);
  assert.equal(chamadas, 5);
  // outro erro nao e engolido
  await assert.rejects(comProtocoloUnico(orgX.id, async () => { throw new Error('outro'); }), /outro/);
});
