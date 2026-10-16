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

module.exports = { TIPO_DIREITO, STATUS, TIPO_INCIDENTE, NIVEL, RISCO_INCIDENTE, METODO_IDENTIDADE, MEIO_ENVIO, rotulo };
