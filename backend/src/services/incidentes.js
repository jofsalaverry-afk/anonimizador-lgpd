// Prazo de comunicacao de incidente a ANPD e aos titulares: 3 dias uteis
// contados da ciencia (art. 6º da Resolucao CD/ANPD nº 15/2024), quando o
// incidente REAL pode acarretar risco ou dano relevante aos titulares.
const { dataPura, hojeSP, somarDiasUteis, diaUtilAnterior, iso } = require('./datas');

const DIAS_UTEIS_COMUNICACAO = 3;
const RISCOS = ['SIM', 'NAO', 'EM_AVALIACAO'];

// Retorna null quando nao se aplica (simulado, sem risco relevante ou sem
// data de ciencia). situacao: COMUNICADO | NO_PRAZO | VESPERA | HOJE | VENCIDO.
function prazoComunicacao(inc, agora = new Date()) {
  if (inc.tipoRegistro !== 'REAL' || inc.riscoRelevante !== 'SIM' || !inc.dataCiencia) return null;
  const prazo = somarDiasUteis(dataPura(inc.dataCiencia), DIAS_UTEIS_COMUNICACAO);
  const vespera = diaUtilAnterior(prazo);
  const hoje = hojeSP(agora);
  const comunicado = !!(inc.dataComunicacaoANPD && inc.dataComunicacaoTitulares);
  let situacao = 'NO_PRAZO';
  if (comunicado) situacao = 'COMUNICADO';
  else if (hoje > prazo) situacao = 'VENCIDO';
  else if (iso(hoje) === iso(prazo)) situacao = 'HOJE';
  else if (hoje >= vespera) situacao = 'VESPERA';
  return { prazo: iso(prazo), vespera: iso(vespera), situacao, comunicado };
}

const comPrazo = (inc, agora) => (inc ? { ...inc, prazoComunicacao: prazoComunicacao(inc, agora) } : inc);

module.exports = { prazoComunicacao, comPrazo, RISCOS, DIAS_UTEIS_COMUNICACAO };
