// Etapa 7b, item 7: nenhum campo cru no historico. Percorre todos os campos
// que podem ser gravados no HistoricoRegistro e falha se faltar rotulo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('../src/data/rotulosHistorico.json');
const { CAMPOS_IGNORADOS } = require('../src/services/historico');

const SRC = path.join(__dirname, '..', 'src');

// Modelos cujos registros vao inteiros para o historico (calcularDiff)
const MODELOS_HISTORIZADOS = [
  'Tratamento', 'SolicitacaoTitular', 'Incidente', 'ItemChecklist', 'RespostaChecklist', 'RegistroDescarte',
  'DocumentoRepositorio', 'Organizacao', 'Usuario', 'ModeloRespostaDSAR', 'SistemaInventario', 'Terceiro', 'Setor',
  'ProvidenciaIncidente', 'AcaoTerceiro', 'CompartilhamentoTratamento'
];

function camposDoSchema() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
  const modelos = new Set(schema.match(/^model (\w+)/gm).map(m => m.slice(6)));
  const campos = new Map();
  for (const nome of MODELOS_HISTORIZADOS) {
    const bloco = schema.match(new RegExp(`model ${nome} \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(bloco, `modelo ${nome} existe`);
    for (const linha of bloco[1].split('\n')) {
      const m = linha.trim().match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!m || linha.trim().startsWith('@@') || linha.trim().startsWith('//')) continue;
      if (modelos.has(m[2])) continue; // relacao (objeto), nao campo gravado
      campos.set(m[1], `${nome}.${m[1]}`);
    }
  }
  return campos;
}

// Chaves escritas a mao nos diffs: "chave: { antes: ..."
function chavesDeDiffNoCodigo() {
  const achadas = new Map();
  (function varrer(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) varrer(p);
      else if (n.endsWith('.js')) {
        const txt = fs.readFileSync(p, 'utf8');
        for (const m of txt.matchAll(/(?:^|[\s{,(])(\w+):\s*\{\s*antes\s*:/g)) achadas.set(m[1], path.relative(SRC, p));
      }
    }
  })(SRC);
  return achadas;
}

test('todo campo gravado no historico tem rotulo legivel', () => {
  const faltando = [];
  for (const [campo, origem] of [...camposDoSchema(), ...chavesDeDiffNoCodigo()]) {
    if (CAMPOS_IGNORADOS.has(campo)) continue;
    if (!H.campos[campo]) faltando.push(`${campo} (${origem})`);
  }
  assert.deepEqual([...new Set(faltando)].sort(), [], 'campos sem rótulo em src/data/rotulosHistorico.json');
});

test('valores de enum gravados no historico tem rotulo', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
  const enums = Object.fromEntries([...schema.matchAll(/enum (\w+) \{([^}]*)\}/g)].map(m => [m[1], m[2].split('\n').map(l => l.trim()).filter(l => /^[A-Z][A-Z0-9_]*$/.test(l))]));
  // campo do historico -> enum do schema
  const CAMPO_ENUM = {
    tipoDireito: 'TipoDireito', status: null, tipoIncidente: 'TipoIncidente', severidade: 'Criticidade', criticidade: 'Criticidade',
    evidenciaRequerida: 'EvidenciaRequerida', perfil: 'Perfil', tipoHospedagem: 'TipoHospedagem', papel: 'PapelTerceiro',
    risco: 'RiscoTerceiro', situacao: 'SituacaoAcao', riscoRelevante: 'RiscoRelevanteIncidente',
    identidadeMetodo: 'MetodoVerificacaoIdentidade', tipoRegistro: 'TipoRegistroIncidente'
  };
  const faltando = [];
  for (const [campo, nomeEnum] of Object.entries(CAMPO_ENUM)) {
    const valores = nomeEnum ? enums[nomeEnum] : [...enums.StatusDSAR, ...enums.StatusIncidente, ...enums.StatusResposta, ...enums.StatusDocRepo];
    assert.ok(valores, `enum de ${campo}`);
    for (const v of valores) if (!H.valores[campo]?.[v]) faltando.push(`${campo}=${v}`);
  }
  for (const v of enums.TipoSistema) if (!H.tipoPorEntidade.SISTEMA[v]) faltando.push(`tipo(SISTEMA)=${v}`);
  for (const v of enums.TipoDocRepo) if (!H.tipoPorEntidade.padrao[v]) faltando.push(`tipo(DOCUMENTO)=${v}`);
  for (const v of enums.AcaoHistorico) if (!H.acoes[v]) faltando.push(`acao=${v}`);
  assert.deepEqual(faltando, []);
});

test('entidades do historico tem rotulo', () => {
  const { ENTIDADES } = require('../src/services/entidades');
  for (const e of Object.keys(ENTIDADES)) assert.ok(H.entidades[e], `entidade ${e}`);
});

test('copia do frontend identica a do backend', (t) => {
  const front = path.join(__dirname, '..', '..', 'frontend', 'src', 'rotulosHistorico.json');
  if (!fs.existsSync(front)) return t.skip('frontend fora deste checkout');
  assert.deepEqual(JSON.parse(fs.readFileSync(front, 'utf8')), H);
});
