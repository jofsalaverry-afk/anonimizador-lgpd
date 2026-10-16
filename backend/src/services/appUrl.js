// URL publica do frontend (links impressos em certificados, minutas e no
// trecho HTML do portal). PUBLIC_APP_URL e opcional; sem ela, dominio oficial.
const APP_URL = (process.env.PUBLIC_APP_URL || 'https://anonimizadorldpd.com').replace(/\/$/, '');

const urlTransparencia = slug => `${APP_URL}/#transparencia/${slug}`;
const urlCanalTitular = slug => `${APP_URL}/#solicitar/${slug}`;

module.exports = { APP_URL, urlTransparencia, urlCanalTitular };
