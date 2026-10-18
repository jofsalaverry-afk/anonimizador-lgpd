import { textoRetencao, rotuloBaseLegal, temDadoSensivel, OPCOES_ART7, OPCOES_ART11 } from './basesLegais';
import { rotuloValor } from './components/rotulos';

test('retencao em dias com anos/meses quando a conta e exata', () => {
  expect(textoRetencao(1825)).toBe('1825 dias (5 anos)');
  expect(textoRetencao(365)).toBe('365 dias (1 ano)');
  expect(textoRetencao(180)).toBe('180 dias (6 meses)');
  expect(textoRetencao(30)).toBe('30 dias (1 mês)');
  expect(textoRetencao(45)).toBe('45 dias');
  expect(textoRetencao(1)).toBe('1 dia');
  expect(textoRetencao(null)).toBe('');
});

test('bases legais: art. 7 (10 incisos) e art. 11 (8 hipoteses), rotulo com artigo', () => {
  expect(OPCOES_ART7).toHaveLength(10);
  expect(OPCOES_ART11).toHaveLength(8);
  expect(rotuloBaseLegal('OBRIGACAO_LEGAL')).toBe('Art. 7º, II — Cumprimento de obrigação legal ou regulatória pelo controlador');
  expect(rotuloBaseLegal('INTERESSE_PUBLICO')).toBe('Art. 7º, III c/c art. 23 — Execução de políticas públicas pela administração pública');
  expect(temDadoSensivel(['Nome', 'Dado biométrico'])).toBe(true);
  expect(temDadoSensivel(['Nome'])).toBe(false);
});

test('historico: nenhum valor de enum cru nos campos com rotulo', () => {
  const r = (c, v, e) => rotuloValor(c, v, e, rotuloBaseLegal);
  expect(r('baseLegal', 'OBRIGACAO_LEGAL')).toMatch(/^Art\. 7º, II — /);
  expect(r('baseLegalSensivel', 'SENSIVEL_TUTELA_SAUDE')).toMatch(/^Art\. 11, II, f — /);
  expect(r('risco', 'MEDIO')).toBe('Médio');
  expect(r('questionario.SEG1', 'SIM')).toBe('Sim');
  expect(r('perfil', 'OPERADOR')).toBe('Operador');
  expect(r('perfil', 'ENCARREGADO_LGPD')).toBe('DPO');
  expect(r('status', 'EM_ANALISE')).toBe('Em análise');
  expect(r('status', 'NAO_CONFORME')).toBe('Não conforme');
  expect(r('severidade', 'MEDIA')).toBe('Média');
  expect(r('tipoRegistro', 'SIMULADO')).toBe('Simulado');
  expect(r('tipo', 'BANCO_DADOS', 'SISTEMA')).toBe('Banco de dados');
  expect(r('tipo', 'POLITICA_PRIVACIDADE', 'DOCUMENTO')).toBe('Política de Privacidade');
  expect(r('tipoDireito', 'ANONIMIZACAO')).toBe('Anonimização, bloqueio ou eliminação');
  expect(r('tipoDireito', 'INFORMACAO_NAO_CONSENTIR')).toBe('Informação sobre a possibilidade de não consentir');
  expect(r('riscoRelevante', 'EM_AVALIACAO')).toBe('Em avaliação');
  expect(r('identidadeMetodo', 'CODIGO_EMAIL')).toBe('Código enviado ao e-mail');
  expect(r('respostaEnvioMeio', 'PESSOALMENTE')).toBe('Entregue pessoalmente');
});
