require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { auditoriaMiddleware } = require('./middlewares/auditoria');

const prisma = new PrismaClient();
const app = express();
// Railway expoe o app atras de proxy; precisamos confiar no X-Forwarded-For
// para o rate limiter identificar o IP correto do cliente.
app.set('trust proxy', 1);

// Helmet — headers de seguranca padrao da industria.
// HSTS so faz sentido sob HTTPS (Railway sempre serve sob HTTPS na porta exposta),
// CSP relaxado pois esta API e consumida apenas via XHR de outros dominios
// (frontend separado), nao serve HTML.
app.use(helmet({
  contentSecurityPolicy: false, // API JSON, sem HTML — CSP nao se aplica
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false, // nao serve HTML
  hsts: {
    maxAge: 31536000, // 1 ano
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

// Limite agressivo para tentativas de login (brute-force): 10 em 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  skipSuccessfulRequests: true
});

// Limite moderado para rotas admin autenticadas: 60 req/min
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisicoes. Aguarde um momento.' }
});

// Limite para rotas de processamento de documentos: 20 req/min por IP
const documentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisicoes de processamento. Aguarde um momento.' }
});

// O CORS e tratado pelo middleware manual no inicio do arquivo
// (ORIGENS_PERMITIDAS_CORS), entao nao usamos o pacote cors() aqui.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Auditoria: registrado APOS os parsers (precisa do req.body) e ANTES das
// rotas. Como escuta res.on('finish'), ele captura req.camara/req.admin
// que sao populados dentro dos handlers das rotas.
app.use(auditoriaMiddleware(prisma));

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const documentRoutes = require('./routes/documents');

// Limites aplicados antes do router, matchando paths especificos
app.use('/auth/login', loginLimiter);
app.use('/admin/login', loginLimiter);
app.use('/admin', adminLimiter);
app.use('/documents', documentLimiter);

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/perfil', require('./routes/perfil'));
app.use('/documents', documentRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Anonimizador LGPD API rodando!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = { prisma };
