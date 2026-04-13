// Camadas de seguranca — rate limiters padronizados, middleware de
// deteccao de tentativas suspeitas e helpers de validacao com express-validator.
// Importado e composto em server.js.

const rateLimit = require('express-rate-limit');
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

// Resposta padrao de rate limit — mensagem legivel para o titular/usuario
// com o tempo de espera em minutos.
function mensagemExcesso(minutos) {
  return { erro: `Muitas tentativas. Tente novamente em ${minutos} minutos.` };
}

// /auth/* — 10 requests / 15 min / IP. Cobre tanto login quanto token
// refresh ou me; protege contra brute force e enumeracao de contas.
// Conta so as falhas para nao penalizar quem ja logou.
const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: ipKeyGenerator,
  validate: VALIDATE_OFF,
  message: mensagemExcesso(15)
});

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
  keyGenerator: (req, res) => {
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
    return ipKeyGenerator(req, res);
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
  keyGenerator: ipKeyGenerator,
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
  body(campo).isEmail().withMessage('Email invalido').normalizeEmail();

const validarCpf = (campo = 'titularCpf', { opcional = false } = {}) => {
  let chain = body(campo).trim();
  if (opcional) chain = chain.optional({ checkFalsy: true });
  return chain
    .matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$|^\d{11}$/)
    .withMessage('CPF invalido — use 11 digitos');
};

const validarCuid = (campo, loc = 'body') => {
  const chain = loc === 'param' ? param(campo) : body(campo);
  return chain.trim().isLength({ min: 20, max: 40 }).matches(/^[a-z0-9]+$/i).withMessage(`${campo} invalido`);
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
