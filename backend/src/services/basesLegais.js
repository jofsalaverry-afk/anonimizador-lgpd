// Bases legais (LGPD arts. 7 e 11) e dados sensiveis (art. 5, II).
// Fonte unica: src/data/basesLegais.json (copia em frontend/src/).
const dados = require('../data/basesLegais.json');

const ART7 = dados.art7.map(b => b.codigo);
const ART11 = dados.art11.map(b => b.codigo);
const ROTULO = Object.fromEntries([...dados.art7, ...dados.art11].map(b => [b.codigo, b.rotulo]));
const SENSIVEIS = new Set([...dados.categoriasSensiveis, ...dados.categoriasSensiveisLegado]);

const rotuloBaseLegal = codigo => (codigo ? ROTULO[codigo] || codigo : '');
const temDadoSensivel = categorias => (categorias || []).some(c => SENSIVEIS.has(c));

module.exports = {
  ART7, ART11, ROTULO_BASE_LEGAL: ROTULO, CATEGORIAS_SENSIVEIS: dados.categoriasSensiveis,
  rotuloBaseLegal, temDadoSensivel
};
