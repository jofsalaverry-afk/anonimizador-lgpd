// Rotulos legiveis de valores de enum para PDFs, minutas e e-mails
// (mesmos textos das telas — frontend/src/components/rotulos.js).
const TIPO_DIREITO = {
  CONFIRMACAO: 'Confirmação da existência de tratamento', ACESSO: 'Acesso aos dados', CORRECAO: 'Correção de dados',
  ANONIMIZACAO: 'Anonimização, bloqueio ou eliminação', PORTABILIDADE: 'Portabilidade', ELIMINACAO: 'Eliminação de dados tratados com consentimento',
  INFORMACAO: 'Informação sobre compartilhamento', INFORMACAO_NAO_CONSENTIR: 'Informação sobre a possibilidade de não consentir',
  REVOGACAO: 'Revogação do consentimento', OPOSICAO: 'Oposição ao tratamento', PETICAO: 'Petição à ANPD', OUTRO: 'Outro'
};
const STATUS = {
  RECEBIDA: 'Recebida', AGUARDANDO_VERIFICACAO: 'Aguardando verificação', EM_ANALISE: 'Em análise', RESPONDIDA: 'Respondida',
  ENCERRADA: 'Encerrada', CANCELADA: 'Cancelada', ABERTO: 'Aberto', EM_INVESTIGACAO: 'Em investigação', RESOLVIDO: 'Resolvido',
  ENCERRADO: 'Encerrado', CONFORME: 'Conforme', PARCIAL: 'Parcial', NAO_CONFORME: 'Não conforme', NAO_APLICAVEL: 'Não aplicável'
};
const TIPO_INCIDENTE = { VAZAMENTO: 'Vazamento', ACESSO_INDEVIDO: 'Acesso indevido', PERDA: 'Perda', ALTERACAO: 'Alteração', OUTRO: 'Outro' };
const NIVEL = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
const RISCO_INCIDENTE = { SIM: 'Sim', NAO: 'Não', EM_AVALIACAO: 'Em avaliação' };
const METODO_IDENTIDADE = { CODIGO_EMAIL: 'código enviado ao e-mail', DOCUMENTO: 'documento apresentado', CODIGO: 'código', OUTRO: 'outro meio' };

const MEIO_ENVIO = { PESSOALMENTE: 'Entregue pessoalmente', CORREIOS: 'Correios', TELEFONE: 'Telefone', EMAIL_INSTITUCIONAL: 'E-mail institucional (fora do sistema)', OUTRO: 'Outro meio' };

const rotulo = (mapa, v) => (v ? mapa[v] || v : '');

// Etapa 7b: fonte unica de rotulos de campos e valores (historico e CSV),
// copia identica em frontend/src/rotulosHistorico.json.
const H = require('../data/rotulosHistorico.json');
const TIPO_REGISTRO = H.valores.tipoRegistro;
const PERFIL = H.valores.perfil;
const TIPO_SISTEMA = H.tipoPorEntidade.SISTEMA;
const CATEGORIA_DOCUMENTO = H.tipoPorEntidade.padrao;
const HOSPEDAGEM = H.valores.tipoHospedagem;
const PAPEL_TERCEIRO = H.valores.papel;
const RISCO_TERCEIRO = H.valores.risco;
const SITUACAO_ACAO = H.valores.situacao;
const RESPOSTA_QUESTIONARIO = H.valores.resposta;
const ACAO_HISTORICO = H.acoes;
const ENTIDADE = H.entidades;
const HIPOTESE_ART33 = H.valores.baseLegalTransferencia;
const PROVIDENCIA_DSAR = H.providenciaDsar;
const ORIGEM_ITEM_CHECKLIST = { GLOBAL: 'Catálogo', PROPRIA: 'Atividade própria' };
const STATUS_INDICADOR = { OK: 'OK', PENDENTE: 'Pendente', INATIVO: 'Módulo inativo', SEM_DADOS: 'Sem dados no mês' };
const ORIGEM_SNAPSHOT = { CRON: 'Automática', MANUAL: 'Manual', ATUAL: 'Atual' };
const INDICADOR = { ROPA: 'ROPA (processos mapeados)', CONTRATOS: 'Contratos críticos com aditivo', TREINAMENTOS: 'Servidores treinados', DSAR: 'DSAR no prazo', INCIDENTES: 'Incidentes' };

// Rotulo do valor de um campo do historico (null se nao houver)
function rotuloValorCampo(campo, valor, entidade) {
  if (typeof valor !== 'string') return null;
  if (campo === 'tipo') return (entidade === 'SISTEMA' ? TIPO_SISTEMA : CATEGORIA_DOCUMENTO)[valor] || null;
  if (campo.startsWith('questionario.')) return RESPOSTA_QUESTIONARIO[valor] || null;
  return H.valores[campo]?.[valor] || null;
}

module.exports = {
  TIPO_DIREITO, STATUS, TIPO_INCIDENTE, NIVEL, RISCO_INCIDENTE, METODO_IDENTIDADE, MEIO_ENVIO, rotulo,
  TIPO_REGISTRO, PERFIL, TIPO_SISTEMA, CATEGORIA_DOCUMENTO, HOSPEDAGEM, PAPEL_TERCEIRO, RISCO_TERCEIRO, SITUACAO_ACAO,
  RESPOSTA_QUESTIONARIO, ACAO_HISTORICO, ENTIDADE, HIPOTESE_ART33, PROVIDENCIA_DSAR, ORIGEM_ITEM_CHECKLIST,
  STATUS_INDICADOR, ORIGEM_SNAPSHOT, INDICADOR, CAMPOS: H.campos, rotuloValorCampo
};
