// Datas: duas espécies, sem misturar.
//
// 1) DATA PURA (ocorrência, descarte, prazos, providências, aditivo...):
//    gravada como meia-noite UTC do dia informado e exibida em UTC — o dia
//    nunca "volta" por causa do fuso. Entrada só no formato AAAA-MM-DD.
// 2) DATA-HORA (criadoEm, respostas, envios...): instante real, exibido
//    sempre em America/Sao_Paulo.
const FUSO = 'America/Sao_Paulo';
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

// 'AAAA-MM-DD' (ou ISO cujo dia e o informado) -> Date meia-noite UTC.
// Retorna null para vazio e undefined para invalido (o chamador responde 400).
function dataPura(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return isNaN(valor) ? undefined : new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
  const m = String(valor).match(RE_DATA);
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return undefined;
  return d;
}

// Dia de hoje em Sao Paulo, como data pura.
function hojeSP(agora = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return dataPura(p);
}

const iso = d => (d ? new Date(d).toISOString().slice(0, 10) : '');
const fmtData = d => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');
const fmtDataHora = d => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
// Instante real mostrado so com o dia (em Sao Paulo)
const fmtDiaSP = d => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '');
// Dia (em Sao Paulo) de um instante, em AAAA-MM-DD — para CSV
const isoDiaSP = d => (d ? new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)) : '');
const fmtDataExtenso = (d, { pura = true } = {}) =>
  (d ? new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: pura ? 'UTC' : FUSO }) : '');

// ---------- Dias uteis ----------
// Feriados nacionais (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023) e a
// Sexta-feira Santa. Carnaval e Corpus Christi sao ponto facultativo e
// feriados locais nao entram: o prazo calculado e o mais curto possivel.
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(ano, mes - 1, dia);
}
const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
function ehFeriado(d) {
  if (FIXOS.includes(iso(d).slice(5))) return true;
  return d.getTime() === pascoa(d.getUTCFullYear()) - 2 * 86400000; // Sexta-feira Santa
}
const ehDiaUtil = d => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !ehFeriado(d);

// Soma n dias uteis a uma data pura, excluindo o dia de inicio.
function somarDiasUteis(inicio, n) {
  let d = dataPura(inicio);
  let restantes = n;
  while (restantes > 0) {
    d = new Date(d.getTime() + 86400000);
    if (ehDiaUtil(d)) restantes--;
  }
  return d;
}
// Dia util anterior a uma data pura.
function diaUtilAnterior(data) {
  let d = new Date(dataPura(data).getTime() - 86400000);
  while (!ehDiaUtil(d)) d = new Date(d.getTime() - 86400000);
  return d;
}

module.exports = {
  FUSO, dataPura, hojeSP, iso, isoDiaSP, fmtData, fmtDataHora, fmtDiaSP, fmtDataExtenso,
  somarDiasUteis, diaUtilAnterior, ehDiaUtil
};
