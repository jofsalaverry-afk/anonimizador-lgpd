import { paginasVisiveis, somenteLeitura } from './permissoes';

const TODOS = ['anonimizador', 'ropa', 'dsar', 'repositorio', 'treinamento', 'checklist', 'pesquisa', 'inventario', 'terceiros'];

test('TREINANDO ve so Treinamento e Configuracoes', () => {
  expect(paginasVisiveis('TREINANDO', TODOS)).toEqual(['treinamento', 'configuracoes']);
});

test('TREINANDO sem modulo de treinamento ve so Configuracoes', () => {
  expect(paginasVisiveis('TREINANDO', ['ropa'])).toEqual(['configuracoes']);
});

test('AUDITOR ve todos os modulos, sem gestao de usuarios, em modo leitura', () => {
  const p = paginasVisiveis('AUDITOR', TODOS);
  expect(p).toContain('ropa');
  expect(p).toContain('painel');
  expect(p).not.toContain('usuarios');
  expect(somenteLeitura('AUDITOR')).toBe(true);
});

test('OPERADOR nao gerencia usuarios e nao e somente leitura', () => {
  expect(paginasVisiveis('OPERADOR', TODOS)).not.toContain('usuarios');
  expect(somenteLeitura('OPERADOR')).toBe(false);
});

test('GESTOR e DPO veem gestao de usuarios', () => {
  expect(paginasVisiveis('GESTOR', TODOS)).toContain('usuarios');
  expect(paginasVisiveis('ENCARREGADO_LGPD', TODOS)).toContain('usuarios');
});

test('modulo desligado some do menu para todos', () => {
  const p = paginasVisiveis('GESTOR', ['ropa']);
  expect(p).toEqual(['painel', 'ropa', 'usuarios', 'configuracoes']);
});
