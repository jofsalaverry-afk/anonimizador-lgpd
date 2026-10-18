import { rotuloCurtoBaseLegal, rotuloBaseLegal } from './basesLegais';

test('rotulo curto da base legal: so a citacao, para a tabela do ROPA', () => {
  expect(rotuloCurtoBaseLegal('OBRIGACAO_LEGAL')).toBe('Art. 7º, II');
  expect(rotuloCurtoBaseLegal('INTERESSE_PUBLICO')).toBe('Art. 7º, III c/c art. 23');
  expect(rotuloCurtoBaseLegal('SENSIVEL_OBRIGACAO_LEGAL')).toBe('Art. 11, II, a');
  expect(rotuloBaseLegal('OBRIGACAO_LEGAL')).toMatch(/^Art\. 7º, II — /);
  expect(rotuloCurtoBaseLegal('')).toBe('');
});
