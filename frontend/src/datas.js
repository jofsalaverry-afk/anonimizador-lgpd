// Datas na tela — duas especies, como no backend (services/datas.js):
// - DATA PURA (ocorrencia, descarte, prazos, providencias, aditivo...):
//   gravada a meia-noite UTC; exibida em UTC para o dia nao "voltar"
//   no fuso do navegador (16/10 virava 15/10 21:00).
// - DATA-HORA (criado em, respondido em, envio...): instante real,
//   exibido sempre em America/Sao_Paulo.
const FUSO = 'America/Sao_Paulo';

export const fmtData = d => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');
export const fmtDataHora = d => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDiaSP = d => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '');
export const fmtHoraSP = d => (d ? new Date(d).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }) : '');

// Valor para <input type="date"> a partir de uma data pura do backend
export const paraInputData = d => (d ? String(d).slice(0, 10) : '');

// Hoje em Sao Paulo, AAAA-MM-DD (valor padrao de campos de data)
export const hojeInput = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Campos do historico que sao DATA PURA (o resto que parece data e instante)
export const CAMPOS_DATA_PURA = new Set([
  'dataOcorrencia', 'dataCiencia', 'dataComunicacaoANPD', 'dataComunicacaoTitulares', 'dataDescarte',
  'prazo', 'proximaRevisao', 'dataAditivo', 'data', 'respostaEnvioData'
]);
