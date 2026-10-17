// Camadas de seguranca — rate limiters padronizados, middleware de
// deteccao de tentativas suspeitas e helpers de validacao com express-validator.
// Importado e composto em server.js.

const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { ipKeyGenerator } = require('express-rate-limit');
const { validationResult, body, param } = require('express-validator');

// express-rate-limit v7.5+ exige que o keyGenerator bucketize IPv6 por
// /64 (senao cada endereco IPv6 unico burla o limite). Quando o cliente
// vem com IP IPv6 e nenhum keyGenerator custom e definido, ele lanca
// ERR_ERL_KEY_GEN_IPV6. Usar ipKeyGenerator (helper do proprio pacote)
// resolve isso — ele aplica o bucketing correto e funciona para IPv4/v6.
// Tambem desabilitamos o validador xForwardedForHeader que dispara warn
// mesmo quando a gente ja seta "trust proxy" no server.js.
const VALIDATE_OFF = { xForwardedForHeader: false };

// Etapa 7a: chave do limite = IP REAL do cliente. O express-rate-limit chama
// keyGenerator(req, res); passar o ipKeyGenerator direto entregava o objeto
// req no lugar do IP e o contador nunca somava (nenhum limite funcionava).
// req.ip ja respeita o "trust proxy" do server.js (2 saltos: borda do
// Railway + proxy interno), entao a chave e o IP do cliente.
const chaveIp = (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || '');

// Rotas autenticadas do painel: a chave e o USUARIO da sessao, nao o IP —
// varios servidores de uma camara costumam sair pelo mesmo IP e dividiriam
// um contador so. O token so e lido (sem verificar) para escolher a chave: a
// autenticacao de verdade acontece depois, na rota. Sem sessao, vale o IP.
function chaveUsuarioOuIp(req) {
  const h = req.headers?.authorization || '';
  if (h.startsWith('Bearer ')) {
    const d = jwt.decode(h.slice(7));
    if (d && typeof d === 'object' && (d.id || d.userId)) return `u:${d.isAdmin ? 'adm:' : ''}${d.id || d.userId}`;
  }
  return chaveIp(req);
}
const LIMITE_PAINEL_POR_MINUTO = 300;

// Resposta padrao de rate limit — mensagem legivel para o titular/usuario
// com o tempo de espera em minutos.
function mensagemExcesso(minutos) {
  return { erro: `Muitas tentativas. Tente novamente em ${minutos} minutos.` };
}

// Etapa 7b: a conta da tentativa — e-mail do corpo (login, esqueci a
// senha) ou o usuario do token (MFA, troca de senha). So escolhe a chave;
// a validacao de verdade e feita na rota.
function contaDaTentativa(req) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email) return email.slice(0, 200);
  for (const t of [req.body?.tempToken, req.body?.trocaToken, (req.headers?.authorization || '').replace(/^Bearer /, '')]) {
    if (!t || typeof t !== 'string') continue;
    const d = jwt.decode(t);
    if (d && typeof d === 'object' && (d.userId || d.id)) return `u:${d.userId || d.id}`;
  }
  return '-';
}
const chaveIpConta = req => `${chaveIp(req)}|${contaDaTentativa(req)}`;

// /auth/* — por IP + CONTA: 10 erros / 15 min. Servidores da mesma camara
// atras do mesmo IP nao se bloqueiam entre si (cada conta tem o seu
// contador). Conta so as falhas para nao penalizar quem ja entrou.
const LIMITE_POR_CONTA = 10;
const TETO_POR_IP = 50;
const limiterAuthConta = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: LIMITE_POR_CONTA,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: chaveIpConta,
  validate: VALIDATE_OFF,
  message: mensagemExcesso(15)
});
// ... e um teto so por IP: 50 erros / 15 min (varias contas tentadas do
// mesmo IP). Fica DEPOIS do limitador da conta: tentativas numa conta ja
// bloqueada nao consomem o teto dos colegas.
const limiterAuthIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: TETO_POR_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: chaveIp,
  validate: VALIDATE_OFF,
  message: mensagemExcesso(15)
});
const limiterAuth = [limiterAuthConta, limiterAuthIp];

// /admin/login — mesma regra do /auth, contadores separados.
const limiterAdminLogin = [
  rateLimit({ windowMs: 15 * 60 * 1000, max: LIMITE_POR_CONTA, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, keyGenerator: chaveIpConta, validate: VALIDATE_OFF, message: mensagemExcesso(15) }),
  rateLimit({ windowMs: 15 * 60 * 1000, max: TETO_POR_IP, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, keyGenerator: chaveIp, validate: VALIDATE_OFF, message: mensagemExcesso(15) })
];

// /documents/* — 20 requests / hora / USUARIO (keyGenerator custom).
// Para usuarios autenticados usa o id do JWT extraido do header; para
// requests sem auth cai no IP. Objetivo e limitar abuso de processamento
// de documentos (custa tokens da IA) por conta individual.
const limiterDocuments = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: VALIDATE_OFF,
  keyGenerator: (req) => {
    // Extrai sub/id do JWT sem verificar assinatura — so para bucketar o
    // limite por usuario. A verificacao real acontece no authMiddleware.
    try {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const payload = auth.slice(7).split('.')[1];
        if (payload) {
          const json = JSON.parse(Buffer.from(payload, 'base64').toString());
          if (json && (json.id || json.sub)) return `user:${json.id || json.sub}`;
        }
      }
    } catch (e) { /* cai no IP */ }
    // Fallback para IP — delega ao helper do pacote pra bucketing IPv6 correto.
    return chaveIp(req);
  },
  message: mensagemExcesso(60)
});

// /dsar/publico/* — 5 requests / 15 min / IP. Publico, sem auth, alvo
// potencial de spam/flood. Limite agressivo. (Substitui otpLimiter antigo.)
const limiterDsarPublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chaveIp,
  validate: VALIDATE_OFF,
  message: mensagemExcesso(15)
});

// ========= Deteccao de tentativas suspeitas =========
// Rastreia, por IP, quantas respostas 401/403 aconteceram nos ultimos 5
// minutos. Quando passa de 5, loga um alerta (console.warn) com IP, ua e
// ultima rota. Em memoria — suficiente para um unico processo; em um setup
// multi-instancia seria necessario Redis.
const suspeitas = new Map(); // ip -> { count, firstAt, ua, ultimaRota, alertado }
const JANELA_SUSPEITA_MS = 5 * 60 * 1000;
const LIMITE_SUSPEITO = 5;

function tentativasSuspeitas() {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode !== 401 && res.statusCode !== 403) return;
      const ip = req.ip;
      const agora = Date.now();
      const reg = suspeitas.get(ip);
      if (!reg || agora - reg.firstAt > JANELA_SUSPEITA_MS) {
        suspeitas.set(ip, { count: 1, firstAt: agora, ua: req.headers['user-agent'], ultimaRota: req.originalUrl, alertado: false });
        return;
      }
      reg.count += 1;
      reg.ultimaRota = req.originalUrl;
      if (reg.count > LIMITE_SUSPEITO && !reg.alertado) {
        reg.alertado = true;
        console.warn('[SEGURANCA] tentativas suspeitas', {
          ip,
          count: reg.count,
          janelaMin: JANELA_SUSPEITA_MS / 60000,
          ua: reg.ua,
          ultimaRota: reg.ultimaRota
        });
      }
    });
    next();
  };
}

// Varre o map periodicamente pra nao crescer indefinidamente. 10 min.
setInterval(() => {
  const agora = Date.now();
  for (const [ip, reg] of suspeitas.entries()) {
    if (agora - reg.firstAt > JANELA_SUSPEITA_MS * 2) suspeitas.delete(ip);
  }
}, 10 * 60 * 1000).unref();

// ========= Helpers de validacao =========
// Middleware que executa depois dos validators e devolve 400 com a lista
// de erros. Usa express-validator.
function validar(req, res, next) {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    return res.status(400).json({
      erro: 'Dados invalidos',
      detalhes: erros.array().map(e => ({ campo: e.path, mensagem: e.msg }))
    });
  }
  next();
}

// Validators reutilizaveis (cadeia pronta pra aplicar em rotas)
const validarEmail = (campo = 'email') =>
  body(campo).isEmail().withMessage('E-mail inválido').normalizeEmail();

const validarCpf = (campo = 'titularCpf', { opcional = false } = {}) => {
  let chain = body(campo).trim();
  if (opcional) chain = chain.optional({ checkFalsy: true });
  // Etapa 7b: formato e digito verificador
  return chain
    .matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$|^\d{11}$/)
    .withMessage('CPF inválido — use 11 dígitos')
    .bail()
    .custom(v => require('../services/documentosId').cpfValido(v))
    .withMessage('CPF inválido: confira os números (dígito verificador não confere)');
};

const validarCuid = (campo, loc = 'body') => {
  const chain = loc === 'param' ? param(campo) : body(campo);
  return chain.trim().isLength({ min: 20, max: 40 }).matches(/^[a-z0-9]+$/i).withMessage(`${campo} inválido`);
};

// Texto livre: trim + escape de < > & " '. Nao bloqueia entrada valida,
// so neutraliza caracteres perigosos no HTML se essa string for renderizada.
const sanitizarTexto = (campo, { min = 1, max = 2000, opcional = false } = {}) => {
  let chain = body(campo).trim();
  if (opcional) chain = chain.optional({ checkFalsy: true });
  return chain.isLength({ min, max }).withMessage(`${campo} deve ter entre ${min} e ${max} caracteres`).escape();
};

const validarEnum = (campo, valores) =>
  body(campo).isIn(valores).withMessage(`${campo} deve ser um de: ${valores.join(', ')}`);

module.exports = {
  mensagemExcesso,
  limiterAuth,
  limiterAdminLogin,
  chaveIp,
  chaveIpConta,
  LIMITE_POR_CONTA,
  TETO_POR_IP,
  chaveUsuarioOuIp,
  LIMITE_PAINEL_POR_MINUTO,
  limiterDocuments,
  limiterDsarPublico,
  tentativasSuspeitas,
  validar,
  validarEmail,
  validarCpf,
  validarCuid,
  sanitizarTexto,
  validarEnum
};
