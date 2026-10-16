// Bases legais (LGPD arts. 7 e 11) e dados sensiveis (art. 5, II).
// Fonte unica: basesLegais.json (copia identica de backend/src/data/ —
// o teste backend/test/bases-legais.test.js acusa divergencia).
import dados from './basesLegais.json';

export const OPCOES_ART7 = dados.art7.map(b => ({ value: b.codigo, label: b.rotulo }));
export const OPCOES_ART11 = dados.art11.map(b => ({ value: b.codigo, label: b.rotulo }));
export const ROTULO_BASE_LEGAL = Object.fromEntries([...dados.art7, ...dados.art11].map(b => [b.codigo, b.rotulo]));
export const CATEGORIAS_SENSIVEIS = dados.categoriasSensiveis;
const SENSIVEIS = new Set([...dados.categoriasSensiveis, ...dados.categoriasSensiveisLegado]);

export const ROTULO_CAMPO_BASE_LEGAL = 'Base legal (LGPD, art. 7º ou art. 11)';
export const rotuloBaseLegal = codigo => (codigo ? ROTULO_BASE_LEGAL[codigo] || codigo : '');
export const temDadoSensivel = categorias => (categorias || []).some(c => SENSIVEIS.has(c));

// 1825 -> "1825 dias (5 anos)"; 180 -> "180 dias (6 meses)"; 45 -> "45 dias".
// So converte quando a conta e exata (ano = 365 dias, mes = 30 dias).
export function textoRetencao(dias) {
  if (dias === null || dias === undefined || dias === '') return '';
  const n = Number(dias);
  const base = `${n} ${n === 1 ? 'dia' : 'dias'}`;
  if (n > 0 && n % 365 === 0) return `${base} (${n / 365} ${n / 365 === 1 ? 'ano' : 'anos'})`;
  if (n > 0 && n % 30 === 0) return `${base} (${n / 30} ${n / 30 === 1 ? 'mês' : 'meses'})`;
  return base;
}
