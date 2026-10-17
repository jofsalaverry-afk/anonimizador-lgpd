import ROTULOS_HIST from '../rotulosHistorico.json';
// Rotulos compartilhados por inventario, terceiros e ROPA.

export const TIPO_SISTEMA_LABEL = {
  APLICACAO: 'Aplicação',
  BANCO_DADOS: 'Banco de dados',
  NUVEM: 'Serviço em nuvem',
  FISICO: 'Arquivo físico',
  OUTRO: 'Outro'
};

export const HOSPEDAGEM_LABEL = { ON_PREMISE: 'Local (on-premise)', NUVEM: 'Nuvem' };

export const PAPEL_TERCEIRO_LABEL = {
  OPERADOR: 'Operador',
  CONTROLADOR_CONJUNTO: 'Controlador conjunto',
  SUBOPERADOR: 'Suboperador'
};

export const RISCO_LABEL = { BAIXO: 'Baixo', MEDIO: 'Médio', ALTO: 'Alto' };
export const RISCO_BADGE = { BAIXO: 'badge badge-success', MEDIO: 'badge badge-warning', ALTO: 'badge badge-danger' };

export const RESPOSTA_LABEL = { SIM: 'Sim', PARCIAL: 'Parcial', NAO: 'Não', NA: 'N/A' };

export const SITUACAO_ACAO_LABEL = { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída' };
export const SITUACAO_ACAO_BADGE = { PENDENTE: 'badge badge-warning', EM_ANDAMENTO: 'badge badge-info', CONCLUIDA: 'badge badge-success' };

// Categorias de dados (com acento) e sensiveis: fonte unica em ../basesLegais.json
export { CATEGORIAS_DADOS } from '../basesLegais';

export function BadgeRisco({ risco, manual }) {
  if (!risco) return <span className="badge badge-muted">Não avaliado</span>;
  return <span className={RISCO_BADGE[risco]}>{RISCO_LABEL[risco]}{manual ? ' (manual)' : ''}</span>;
}

// ---------- Rotulos de valores de enum (historico e telas) ----------
// Mesmos textos dos formularios. O historico nunca mostra o codigo cru.
export const PERFIL_LABEL = { ENCARREGADO_LGPD: 'DPO', GESTOR: 'Gestor', OPERADOR: 'Operador', AUDITOR: 'Auditor', TREINANDO: 'Treinando' };
export const NIVEL_LABEL = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
export const TIPO_DIREITO_LABEL = {
  CONFIRMACAO: 'Confirmação da existência de tratamento', ACESSO: 'Acesso aos dados', CORRECAO: 'Correção de dados',
  ANONIMIZACAO: 'Anonimização, bloqueio ou eliminação', PORTABILIDADE: 'Portabilidade', ELIMINACAO: 'Eliminação de dados tratados com consentimento',
  INFORMACAO: 'Informação sobre compartilhamento', INFORMACAO_NAO_CONSENTIR: 'Informação sobre a possibilidade de não consentir',
  REVOGACAO: 'Revogação do consentimento', OPOSICAO: 'Oposição ao tratamento',
  PETICAO: 'Petição à ANPD', OUTRO: 'Outro'
};
export const TIPO_INCIDENTE_LABEL = { VAZAMENTO: 'Vazamento', ACESSO_INDEVIDO: 'Acesso indevido', PERDA: 'Perda', ALTERACAO: 'Alteração', OUTRO: 'Outro' };
export const TIPO_REGISTRO_LABEL = { REAL: 'Real', SIMULADO: 'Simulado' };
// Etapa 7b: tipo de providencia do DSAR gravado pelo sistema (os demais sao texto livre)
export const TIPO_PROVIDENCIA_DSAR_LABEL = { VERIFICACAO_IDENTIDADE: 'Verificação de identidade' };
export const rotuloProvidenciaDsar = t => TIPO_PROVIDENCIA_DSAR_LABEL[t] || t;
// Situacao do prazo (backend dsarService.calcularSLA)
export const SLA_BADGE = {
  verde: 'badge badge-success', amarelo: 'badge badge-warning', vermelho: 'badge badge-danger',
  vencido: 'badge badge-danger', 'sem-prazo': 'badge badge-info', encerrado: 'badge badge-muted'
};
export const EVIDENCIA_LABEL = { DOCUMENTO: 'Documento', CAPTURA: 'Captura de tela', AUTO_DECLARACAO: 'Auto-declaração', LINK_SISTEMA: 'Link de sistema' };
export const CATEGORIA_DOCUMENTO_LABEL = {
  POLITICA_PRIVACIDADE: 'Política de Privacidade', POLITICA_SEGURANCA: 'Política de Segurança', MODELO_DSAR: 'Modelo DSAR',
  CONTRATO: 'Contrato', ADITIVO: 'Aditivo contratual LGPD', TERMO: 'Termo', TERMO_USO: 'Termo de Uso',
  POLITICA: 'Políticas e procedimentos', MODELO: 'Modelos e formulários', OUTRO: 'Outros'
};
// "status" e usado por varios modulos; os codigos nao colidem com sentidos diferentes
export const STATUS_LABEL = {
  RECEBIDA: 'Recebida', AGUARDANDO_VERIFICACAO: 'Aguardando verificação', EM_ANALISE: 'Em análise', RESPONDIDA: 'Respondida',
  ENCERRADA: 'Encerrada', CANCELADA: 'Cancelada',
  ABERTO: 'Aberto', EM_INVESTIGACAO: 'Em investigação', RESOLVIDO: 'Resolvido', ENCERRADO: 'Encerrado',
  CONFORME: 'Conforme', PARCIAL: 'Parcial', NAO_CONFORME: 'Não conforme', NAO_APLICAVEL: 'Não aplicável',
  RASCUNHO: 'Rascunho', APROVADO: 'Aprovado', PUBLICADO: 'Publicado',
  ...SITUACAO_ACAO_LABEL
};

// Etapa 7b: valores por campo vem da fonte unica (rotulosHistorico.json)
const VALOR_POR_CAMPO = ROTULOS_HIST.valores;

// Rotulo de um valor de enum no campo de uma entidade do historico.
// rotuloBase: funcao de basesLegais (recebida por parametro).
export function rotuloValor(campo, valor, entidade, rotuloBase) {
  if (typeof valor !== 'string') return null;
  if (campo === 'baseLegal' || campo === 'baseLegalSensivel') return rotuloBase(valor);
  if (campo.startsWith('questionario.')) return RESPOSTA_LABEL[valor] || null;
  if (campo === 'tipo') return (entidade === 'SISTEMA' ? ROTULOS_HIST.tipoPorEntidade.SISTEMA : ROTULOS_HIST.tipoPorEntidade.padrao)[valor] || null;
  return VALOR_POR_CAMPO[campo]?.[valor] || null;
}
