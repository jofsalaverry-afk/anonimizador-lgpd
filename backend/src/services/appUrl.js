// URL publica do frontend (links impressos em certificados, minutas, trecho
// HTML do portal e e-mail de "esqueci minha senha").
//
// Etapa 7a: em producao (ver ehProducao) PUBLIC_APP_URL e OBRIGATORIA —
// sem ela o backend se recusa a subir, em vez de usar um padrao silencioso.
// Dominio oficial: https://anonimizadorldpd.com (com "ldpd"). Fora de producao
// (desenvolvimento e testes) o dominio oficial e usado como padrao.
const DOMINIO_OFICIAL = 'https://anonimizadorldpd.com';

// Producao = NODE_ENV=production OU ambiente Railway chamado "production"
// (as variaveis do servico de producao nao definem NODE_ENV; ele vem da imagem).
const ehProducao = (env = process.env) => env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT_NAME === 'production';

function resolverAppUrl(env = process.env) {
  const valor = (env.PUBLIC_APP_URL || '').trim();
  if (!valor) {
    if (ehProducao(env)) {
      throw new Error('PUBLIC_APP_URL não definida: em produção ela é obrigatória (ex.: https://anonimizadorldpd.com). O servidor não vai subir.');
    }
    return DOMINIO_OFICIAL;
  }
  let u;
  try { u = new URL(valor); } catch { throw new Error('PUBLIC_APP_URL inválida: use o endereço completo, com http:// ou https://'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('PUBLIC_APP_URL inválida: use http:// ou https://');
  return valor.replace(/\/+$/, '');
}

const APP_URL = resolverAppUrl();

const urlTransparencia = slug => `${APP_URL}/#transparencia/${slug}`;
const urlCanalTitular = slug => `${APP_URL}/#solicitar/${slug}`;
const urlRedefinirSenha = token => `${APP_URL}/#redefinir-senha/${token}`;

module.exports = { APP_URL, DOMINIO_OFICIAL, ehProducao, resolverAppUrl, urlTransparencia, urlCanalTitular, urlRedefinirSenha };
