// Bases legais (LGPD arts. 7 e 11) e dados sensiveis (art. 5, II).
// Fonte unica: src/data/basesLegais.json (copia em frontend/src/).
const dados = require('../data/basesLegais.json');

const ART7 = dados.art7.map(b => b.codigo);
const ART11 = dados.art11.map(b => b.codigo);
const ROTULO = Object.fromEntries([...dados.art7, ...dados.art11].map(b => [b.codigo, b.rotulo]));
const SENSIVEIS = new Set([...dados.categoriasSensiveis, ...dados.categoriasSensiveisLegado]);
// Valores antigos sem acento ("Endereco", "Cidadaos"...) -> rotulo atual
const normalizarCategoria = c => dados.rotulosLegado[c] || c;
const normalizarCategorias = lista => [...new Set((lista || []).map(normalizarCategoria))];

// 1825 -> "1825 dias (5 anos)"; 180 -> "180 dias (6 meses)" (mesma regra da tela)
function textoRetencao(dias) {
  if (dias === null || dias === undefined || dias === '') return '';
  const n = Number(dias);
  const base = `${n} ${n === 1 ? 'dia' : 'dias'}`;
  if (n > 0 && n % 365 === 0) return `${base} (${n / 365} ${n / 365 === 1 ? 'ano' : 'anos'})`;
  if (n > 0 && n % 30 === 0) return `${base} (${n / 30} ${n / 30 === 1 ? 'mês' : 'meses'})`;
  return base;
}

const rotuloBaseLegal = codigo => (codigo ? ROTULO[codigo] || codigo : '');
const temDadoSensivel = categorias => (categorias || []).some(c => SENSIVEIS.has(c) || SENSIVEIS.has(normalizarCategoria(c)));

module.exports = {
  ART7, ART11, ROTULO_BASE_LEGAL: ROTULO, CATEGORIAS_SENSIVEIS: dados.categoriasSensiveis,
  CATEGORIAS_DADOS: dados.categoriasDados, CATEGORIAS_TITULARES: dados.categoriasTitulares,
  rotuloBaseLegal, temDadoSensivel, normalizarCategoria, normalizarCategorias, textoRetencao
};
