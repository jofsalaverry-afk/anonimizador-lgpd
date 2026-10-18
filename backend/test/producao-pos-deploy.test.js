const { test } = require('node:test');
const assert = require('node:assert/strict');
const { catalogo, CORRECOES } = require('../tools/producao-pos-deploy');
const CATALOGO = require('../src/data/catalogoChecklist');

// Banco simulado so com o que a ferramenta usa (SQL cru no ItemChecklist global)
function bancoFalso(linhas) {
  const db = {
    linhas,
    async $queryRawUnsafe(_sql, codigo) { return db.linhas.filter(l => l.codigo === codigo).map(l => ({ ...l })); },
    async $executeRawUnsafe(sql, novo, codigo, antigo) {
      const campo = { '"fundamentoLegal"': 'fundamentoLegal', titulo: 'titulo', descricao: 'descricao' }[sql.match(/SET (\S+) =/)[1]];
      const alvo = db.linhas.filter(l => l.codigo === codigo && l[campo] === antigo);
      alvo.forEach(l => { l[campo] = novo; });
      return alvo.length;
    },
    async $transaction(fn) {
      const copia = JSON.parse(JSON.stringify(db.linhas));
      try { return await fn(db); } catch (e) { db.linhas = copia; throw e; }
    }
  };
  return db;
}

// Producao hoje: textos da carga antiga (campo "antigo" de cada correcao)
function producaoAntiga() {
  const porCodigo = {};
  for (const i of CATALOGO) porCodigo[i.codigo] = { codigo: i.codigo, titulo: i.titulo, descricao: i.descricao, fundamentoLegal: i.fundamentoLegal };
  for (const c of CORRECOES) porCodigo[c.codigo][c.campo] = c.antigo;
  return Object.values(porCodigo);
}

const silencio = () => {};

test('catalogo: sem --aplicar nada e gravado', async () => {
  const db = bancoFalso(producaoAntiga());
  const antes = JSON.stringify(db.linhas);
  const r = await catalogo(db, false, silencio);
  assert.equal(r.aplicadas, 0);
  assert.equal(JSON.stringify(db.linhas), antes);
});

test('catalogo --aplicar: acentos e fundamentos corrigidos; codigos intactos; segunda rodada nao faz nada', async () => {
  const db = bancoFalso(producaoAntiga());
  const codigos = db.linhas.map(l => l.codigo).sort();
  const r = await catalogo(db, true, silencio);
  assert.equal(r.aplicadas, CORRECOES.length);
  const dsar01 = db.linhas.find(l => l.codigo === 'DSAR-01');
  assert.equal(dsar01.titulo, 'Canal público para exercício de direitos');
  assert.match(dsar01.descricao, /organização .* acessível .* exerçam/);
  assert.equal(db.linhas.find(l => l.codigo === 'GOV-05').fundamentoLegal, 'LGPD, arts. 41, § 2º, III, e 46');
  assert.deepEqual(db.linhas.map(l => l.codigo).sort(), codigos);
  assert.equal((await catalogo(db, true, silencio)).aplicadas, 0, 'idempotente');
});

test('catalogo --aplicar: texto inesperado em um item bloqueia tudo', async () => {
  const linhas = producaoAntiga();
  linhas.find(l => l.codigo === 'GOV-02').titulo = 'Texto editado à mão';
  const db = bancoFalso(linhas);
  const antes = JSON.stringify(db.linhas);
  const exitAntes = process.exitCode;
  const r = await catalogo(db, true, silencio);
  process.exitCode = exitAntes;
  assert.equal(r.bloqueado, true);
  assert.equal(JSON.stringify(db.linhas), antes, 'nada gravado');
});

test('acentos: o texto novo e o antigo com acento, sem mudar palavras', () => {
  const sem = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const c of CORRECOES.filter(x => x.passo === 'acento')) assert.equal(sem(c.novo), sem(c.antigo), `${c.codigo} ${c.campo}`);
});
