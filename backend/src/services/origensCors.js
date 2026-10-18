// Origens aceitas no CORS. Etapa 7a: localhost so fora de producao. A origem
// de PUBLIC_APP_URL entra sempre (assim um ambiente de teste que aponta o
// frontend para localhost continua funcionando, de forma explicita).
const FIXAS = [
  'https://anonimizadorldpd.com',
  'https://www.anonimizadorldpd.com',
  'https://anonimizadorlgpd.com',
  'https://www.anonimizadorlgpd.com',
  'https://melodious-emotion-production-c6a6.up.railway.app',
  'https://loquacious-taiyaki-921c36.netlify.app'
];
const { ehProducao } = require('./appUrl');
const LOCAIS = ['http://localhost:3000', 'http://localhost:5173'];

function origensCors(env = process.env, appUrl) {
  const lista = new Set(FIXAS);
  if (!ehProducao(env)) LOCAIS.forEach(o => lista.add(o));
  if (appUrl) { try { lista.add(new URL(appUrl).origin); } catch { /* appUrl ja validada em appUrl.js */ } }
  return [...lista];
}

module.exports = { origensCors };
