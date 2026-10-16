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

export const CATEGORIAS_DADOS = ['Nome', 'CPF', 'RG', 'E-mail', 'Telefone', 'Endereco', 'Dados Bancarios', 'Dados de Saude', 'Outros'];

export function BadgeRisco({ risco, manual }) {
  if (!risco) return <span className="badge badge-muted">Não avaliado</span>;
  return <span className={RISCO_BADGE[risco]}>{RISCO_LABEL[risco]}{manual ? ' (manual)' : ''}</span>;
}
