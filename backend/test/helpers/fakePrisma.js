// PrismaClient falso, em memoria, para testes de rota sem banco.
// Cobre so o subconjunto da API usado pelas rotas testadas: where com
// igualdade/in/not/lt/lte/gt/gte, select/include com relacoes simples,
// orderBy, take, $transaction (callback ou array) e $executeRaw no-op.
//
// IMPORTANTE: os testes NUNCA tocam o banco real. O .env do backend
// aponta para producao (ver memoria do projeto / POC-VIAMAO.md).

const crypto = require('crypto');

// relacoes N:1 -> [modelo, campoFK]
const RELACOES = {
  usuario: { organizacao: ['organizacao', 'organizacaoId'] },
  anexo: { enviadoPor: ['usuario', 'enviadoPorId'], organizacao: ['organizacao', 'organizacaoId'] },
  incidente: { responsavel: ['usuario', 'responsavelId'] },
  respostaChecklist: { responsavel: ['usuario', 'responsavelId'], item: ['itemChecklist', 'itemId'] },
  historicoRegistro: { usuario: ['usuario', 'usuarioId'] },
  tratamento: { setor: ['setor', 'setorId'] },
  compartilhamentoTratamento: { terceiro: ['terceiro', 'terceiroId'] },
  tratamentoSistema: { sistema: ['sistemaInventario', 'sistemaId'], tratamento: ['tratamento', 'tratamentoId'] },
  sistemaInventario: { responsavel: ['usuario', 'responsavelId'], terceiro: ['terceiro', 'terceiroId'] },
  integracaoSistema: { origem: ['sistemaInventario', 'origemId'], destino: ['sistemaInventario', 'destinoId'] },
  respostaQuestionarioTerceiro: { respondidoPor: ['usuario', 'respondidoPorId'] },
  acaoTerceiro: { responsavel: ['usuario', 'responsavelId'] }
};
// relacoes 1:N -> [modelo, campoFK no filho]
const FILHOS = {
  tratamento: {
    compartilhamentos: ['compartilhamentoTratamento', 'tratamentoId'],
    historico: ['tratamentoHistorico', 'tratamentoId'],
    sistemas: ['tratamentoSistema', 'tratamentoId']
  },
  sistemaInventario: {
    integracoesSaida: ['integracaoSistema', 'origemId'],
    integracoesEntrada: ['integracaoSistema', 'destinoId']
  },
  solicitacaoTitular: { evidencias: ['evidenciaDSAR', 'solicitacaoId'] }
};

// Defaults do schema (lidos do datamodel do client gerado, antes de o
// fake substituir @prisma/client): @default literal, opcional -> null,
// lista -> []. Assim o fake devolve o mesmo formato que o Prisma real.
function carregarDefaults() {
  const { Prisma } = require('@prisma/client');
  const mapa = {};
  for (const m of Prisma.dmmf.datamodel.models) {
    const nome = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    const padrao = {};
    for (const f of m.fields) {
      if (f.kind === 'object') continue;
      if (f.default !== undefined && (typeof f.default !== 'object' || Array.isArray(f.default))) padrao[f.name] = f.default;
      else if (f.isList) padrao[f.name] = [];
      else if (!f.isRequired) padrao[f.name] = null;
    }
    mapa[nome] = padrao;
  }
  return mapa;
}
const DEFAULTS = carregarDefaults();

function novoId() {
  return 'c' + crypto.randomBytes(12).toString('hex');
}

function erroNaoEncontrado() {
  const e = new Error('Record not found');
  e.code = 'P2025';
  return e;
}

function valorIgual(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if ((a === undefined || a === null) && (b === undefined || b === null)) return true;
  return a === b;
}

function casa(row, where) {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'AND') { if (!cond.every(w => casa(row, w))) return false; continue; }
    if (k === 'OR') { if (!cond.some(w => casa(row, w))) return false; continue; }
    // Prisma ignora chaves undefined no where
    if (cond === undefined) continue;
    const v = row[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      // chave composta (ex.: organizacaoId_itemId) ou operadores
      const ops = ['in', 'not', 'lt', 'lte', 'gt', 'gte', 'has', 'equals'];
      if (!Object.keys(cond).some(o => ops.includes(o))) {
        if (!casa(row, cond)) return false;
        continue;
      }
      if ('equals' in cond && !valorIgual(v, cond.equals)) return false;
      if ('in' in cond && !cond.in.some(x => valorIgual(v, x))) return false;
      if ('not' in cond && valorIgual(v, cond.not)) return false;
      if ('lt' in cond && !(v != null && v < cond.lt)) return false;
      if ('lte' in cond && !(v != null && v <= cond.lte)) return false;
      if ('gt' in cond && !(v != null && v > cond.gt)) return false;
      if ('gte' in cond && !(v != null && v >= cond.gte)) return false;
      if ('has' in cond && !(Array.isArray(v) && v.includes(cond.has))) return false;
      continue;
    }
    if (!valorIgual(v, cond)) return false;
  }
  return true;
}

function criarBanco() {
  const tabelas = {};
  const tabela = nome => (tabelas[nome] = tabelas[nome] || []);

  function projetar(modelo, row, { select, include } = {}) {
    if (!row) return row;
    const base = select
      ? Object.fromEntries(Object.entries(select).filter(([k, v]) => v && !RELACOES[modelo]?.[k] && !FILHOS[modelo]?.[k] && k !== '_count').map(([k]) => [k, row[k]]))
      : { ...row };
    const rels = { ...(include || {}), ...(select || {}) };
    for (const [k, opt] of Object.entries(rels)) {
      if (!opt) continue;
      if (k === '_count') { base._count = {}; continue; }
      const n1 = RELACOES[modelo]?.[k];
      if (n1) {
        const [alvo, fk] = n1;
        const pai = tabela(alvo).find(r => r.id === row[fk]) || null;
        base[k] = pai ? projetar(alvo, pai, typeof opt === 'object' ? opt : {}) : null;
        continue;
      }
      const n2 = FILHOS[modelo]?.[k];
      if (n2) {
        const [alvo, fk] = n2;
        base[k] = tabela(alvo).filter(r => r[fk] === row.id).map(r => projetar(alvo, r, typeof opt === 'object' ? opt : {}));
      }
    }
    return base;
  }

  function ordenar(rows, orderBy) {
    if (!orderBy) return rows;
    const crit = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap(o => Object.entries(o));
    return [...rows].sort((a, b) => {
      for (const [k, dir] of crit) {
        if (a[k] < b[k]) return dir === 'desc' ? 1 : -1;
        if (a[k] > b[k]) return dir === 'desc' ? -1 : 1;
      }
      return 0;
    });
  }

  function aplicarDados(modelo, row, data) {
    for (const [k, v] of Object.entries(data)) {
      const filho = FILHOS[modelo]?.[k];
      if (filho) {
        if (v && v.create) {
          const [alvo, fk] = filho;
          for (const c of [].concat(v.create)) tabela(alvo).push({ ...structuredClone(DEFAULTS[alvo] || {}), id: novoId(), ...c, [fk]: row.id });
        }
        continue;
      }
      row[k] = v;
    }
  }

  function delegate(modelo) {
    const rows = () => tabela(modelo);
    return {
      async create({ data, select, include }) {
        const agora = new Date();
        const row = { ...structuredClone(DEFAULTS[modelo] || {}), id: novoId(), criadoEm: agora, atualizadoEm: agora };
        aplicarDados(modelo, row, data);
        rows().push(row);
        return projetar(modelo, row, { select, include });
      },
      async findFirst({ where, select, include, orderBy } = {}) {
        const r = ordenar(rows().filter(x => casa(x, where)), orderBy)[0] || null;
        return projetar(modelo, r, { select, include });
      },
      async findUnique(args) {
        // Prisma real rejeita findUnique sem valor de chave
        if (!args?.where || Object.values(args.where).some(v => v === undefined)) {
          throw new Error(`findUnique em ${modelo} sem chave definida`);
        }
        return this.findFirst(args);
      },
      async findMany({ where, select, include, orderBy, take } = {}) {
        let r = ordenar(rows().filter(x => casa(x, where)), orderBy);
        if (take) r = r.slice(0, take);
        return r.map(x => projetar(modelo, x, { select, include }));
      },
      async count({ where } = {}) { return rows().filter(x => casa(x, where)).length; },
      async update({ where, data, select, include }) {
        const row = rows().find(x => casa(x, where));
        if (!row) throw erroNaoEncontrado();
        aplicarDados(modelo, row, data);
        row.atualizadoEm = new Date();
        return projetar(modelo, row, { select, include });
      },
      async updateMany({ where, data }) {
        const alvo = rows().filter(x => casa(x, where));
        alvo.forEach(row => aplicarDados(modelo, row, data));
        return { count: alvo.length };
      },
      async upsert({ where, create, update, select, include }) {
        const row = rows().find(x => casa(x, where));
        if (row) return this.update({ where: { id: row.id }, data: update, select, include });
        return this.create({ data: create, select, include });
      },
      async delete({ where }) {
        const i = rows().findIndex(x => casa(x, where));
        if (i < 0) throw erroNaoEncontrado();
        return rows().splice(i, 1)[0];
      },
      async deleteMany({ where } = {}) {
        const antes = rows().length;
        tabelas[modelo] = rows().filter(x => !casa(x, where));
        return { count: antes - tabelas[modelo].length };
      }
    };
  }

  const client = new Proxy({}, {
    get(_t, prop) {
      if (prop === '$transaction') {
        return async (arg) => (typeof arg === 'function' ? arg(client) : Promise.all(arg));
      }
      if (prop === '$executeRaw' || prop === '$queryRaw') return async () => 0;
      if (prop === '$connect' || prop === '$disconnect') return async () => {};
      if (prop === '__tabelas') return tabelas;
      if (prop === '__limpar') return () => { for (const k of Object.keys(tabelas)) delete tabelas[k]; };
      if (prop === 'then') return undefined;
      return delegate(prop);
    }
  });
  return client;
}

// Todas as rotas fazem `new PrismaClient()` no import; aqui todas
// compartilham o mesmo banco em memoria.
const banco = criarBanco();
class FakePrismaClient {
  constructor() { return banco; }
}

// Injeta o fake no cache do require ANTES de carregar as rotas.
function instalar() {
  const caminho = require.resolve('@prisma/client', { paths: [require('path').join(__dirname, '..', '..', 'src')] });
  require.cache[caminho] = { id: caminho, filename: caminho, loaded: true, exports: { PrismaClient: FakePrismaClient } };
  return banco;
}

module.exports = { instalar };
