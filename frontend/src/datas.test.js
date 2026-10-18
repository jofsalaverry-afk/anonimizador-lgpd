// Navegador no Brasil (UTC-3): a data pura nao pode "voltar" um dia.
process.env.TZ = 'America/Sao_Paulo';
/* eslint-disable import/first */
import { fmtData, fmtDataHora, fmtDiaSP, paraInputData } from './datas';
import { normalizarCategorias, CATEGORIAS_DADOS, CATEGORIAS_TITULARES } from './basesLegais';

test('data pura 16/10 continua 16/10 no fuso de Sao Paulo', () => {
  expect(fmtData('2026-10-16T00:00:00.000Z')).toBe('16/10/2026');
  // o jeito antigo mostrava 15/10
  expect(new Date('2026-10-16T00:00:00.000Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })).toBe('15/10/2026');
  expect(paraInputData('2026-10-16T00:00:00.000Z')).toBe('2026-10-16');
});

test('data-hora sempre em America/Sao_Paulo', () => {
  expect(fmtDataHora('2026-10-17T01:30:00.000Z')).toBe('16/10/2026, 22:30');
  expect(fmtDiaSP('2026-10-17T01:30:00.000Z')).toBe('16/10/2026');
});

test('categorias com acento; valores antigos convertidos', () => {
  expect(CATEGORIAS_DADOS).toContain('Endereço');
  expect(CATEGORIAS_TITULARES).toContain('Cidadãos');
  expect(normalizarCategorias(['Endereco', 'Dados Bancarios', 'Cidadaos', 'Dados de Saude'])).toEqual(['Endereço', 'Dados bancários', 'Cidadãos', 'Saúde']);
});
