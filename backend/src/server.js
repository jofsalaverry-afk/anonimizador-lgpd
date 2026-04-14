require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { auditoriaMiddleware } = require('./middlewares/auditoria');
const {
  limiterAuth,
  limiterDocuments,
  limiterDsarPublico,
  tentativasSuspeitas
} = require('./middlewares/seguranca');

const prisma = new PrismaClient();
const app = express();
// Railway expoe o app atras de proxy; precisamos confiar no X-Forwarded-For
// para o rate limiter identificar o IP correto do cliente.
app.set('trust proxy', 1);

// Helmet — headers de seguranca padrao da industria.
// - CSP restritivo (API JSON, nao serve HTML, nao precisa liberar nada)
// - frameguard DENY para evitar clickjacking
// - referrerPolicy strict-origin para nao vazar paths em requests cross-origin
// - HSTS 1 ano (Railway expoe sob HTTPS)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false
  }
}));

// Middleware manual de CORS - intercepta TODA request (incluindo preflight
// OPTIONS) antes de qualquer outro middleware. Em Express 5 o path-to-regexp
// v8 removeu suporte a regex paths em route handlers, entao usamos middleware
// generico em vez de app.options('*', ...).
const ORIGENS_PERMITIDAS_CORS = [
  'https://anonimizadorldpd.com',
  'https://www.anonimizadorldpd.com',
  'https://anonimizadorlgpd.com',
  'https://www.anonimizadorlgpd.com',
  'https://melodious-emotion-production-c6a6.up.railway.app',
  'https://loquacious-taiyaki-921c36.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173'
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGENS_PERMITIDAS_CORS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    console.warn('[CORS] Origem bloqueada:', origin);
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const { ipKeyGenerator } = require('express-rate-limit');

// Limite moderado para rotas admin autenticadas: 60 req/min (nao-sensivel,
// so para evitar flood de painel interno). Mantido inline pois e especifico.
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  validate: { xForwardedForHeader: false },
  message: { erro: 'Muitas requisicoes. Aguarde um momento.' }
});

// Limite moderado p/ rotas de CRUD autenticadas (ROPA, repositorio, etc.):
// 60 req/min. Menor que o anterior (20/min em ../documents) pois sao
// operacoes de painel, nao de processamento pesado.
const crudLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  validate: { xForwardedForHeader: false },
  message: { erro: 'Muitas requisicoes. Aguarde um momento.' }
});

// Body parsers — 50kb por padrao. Rotas que legitimamente sobem JSON
// grande (logo base64, markdown longo de repositorio) sao atendidas por
// parsers maiores montados ANTES do global, que roda primeiro e preenche
// req.body. O global se torna no-op para essas rotas.
// Upload de PDF/DOCX usa multer (multipart), entao nao passa por aqui.
app.use('/admin', express.json({ limit: '2mb' }), express.urlencoded({ limit: '2mb', extended: true }));
app.use('/perfil', express.json({ limit: '2mb' }), express.urlencoded({ limit: '2mb', extended: true }));
app.use('/repositorio', express.json({ limit: '2mb' }), express.urlencoded({ limit: '2mb', extended: true }));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ limit: '50kb', extended: true }));

// Auditoria: registrado APOS os parsers (precisa do req.body) e ANTES das
// rotas. Como escuta res.on('finish'), ele captura req.camara/req.admin
// que sao populados dentro dos handlers das rotas.
app.use(auditoriaMiddleware(prisma));

// Deteccao de tentativas suspeitas — loga WARN quando um IP passa de 5
// respostas 401/403 em 5 minutos. Precisa rodar antes das rotas para
// poder escutar o res.on('finish') de cada handler.
app.use(tentativasSuspeitas());

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const documentRoutes = require('./routes/documents');
const ropaRoutes = require('./routes/ropa');
const dsarRoutes = require('./routes/dsar');
const repositorioRoutes = require('./routes/repositorio');
const conformidadeRoutes = require('./routes/conformidade');
const treinamentoRoutes = require('./routes/treinamento');

// Rate limiters padronizados (ver middlewares/seguranca.js):
// - /auth/* → 10/15min/IP (brute force login)
// - /admin/login → mesmo limiter (alvo equivalente)
// - /dsar/publico/* → 5/15min/IP (endpoint publico, anti-flood)
// - /documents/* → 20/hora/usuario (uso de IA, custo por token)
// - /admin, /ropa, /repositorio, /conformidade, /treinamento → 60/min (CRUD painel)
app.use('/auth', limiterAuth);
app.use('/admin/login', limiterAuth);
app.use('/admin', adminLimiter);
app.use('/dsar/publico', limiterDsarPublico);
app.use('/documents', limiterDocuments);

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/perfil', require('./routes/perfil'));
app.use('/documents', documentRoutes);
app.use('/ropa', crudLimiter);
app.use('/ropa', ropaRoutes);
app.use('/dsar', dsarRoutes);
app.use('/repositorio', crudLimiter);
app.use('/repositorio', repositorioRoutes);
app.use('/conformidade', crudLimiter);
app.use('/conformidade', conformidadeRoutes);
app.use('/treinamento', crudLimiter);
app.use('/treinamento', treinamentoRoutes);

// Healthcheck. Deve ser monitorado externamente por um uptime monitor
// gratuito (UptimeRobot, BetterStack, Healthchecks.io) apontando para
// https://<URL-RAILWAY-BACKEND>/health com check a cada 5 min e alerta
// por email para o DPO quando retornar status != 200 ou timeout. A
// infra Railway nao tem alerta nativo de processo caido; esse monitor
// externo eh o que dispara a notificacao quando o backend some.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Anonimizador LGPD API rodando!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  // Inicializa cron jobs apos o servidor subir
  try {
    const { iniciarCron } = require('./services/cronJobs');
    iniciarCron();
  } catch (err) {
    console.error('[server] falha ao iniciar cron:', err.message);
  }
});

module.exports = { prisma };
