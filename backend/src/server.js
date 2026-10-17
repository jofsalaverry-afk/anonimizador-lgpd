require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { auditoriaMiddleware } = require('./middlewares/auditoria');
const {
  limiterAuth,
  limiterDocuments,
  limiterDsarPublico,
  tentativasSuspeitas
} = require('./middlewares/seguranca');

const { prisma } = require('./db');
// Etapa 7a: em producao, sem PUBLIC_APP_URL o require abaixo lanca erro e
// o servidor nao sobe (em vez de usar um endereco padrao silencioso).
const { APP_URL } = require('./services/appUrl');
const { origensCors } = require('./services/origensCors');
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
// Etapa 7a: lista em services/origensCors.js (sem localhost em producao).
const ORIGENS_PERMITIDAS_CORS = origensCors(process.env, APP_URL);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGENS_PERMITIDAS_CORS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    // Deixa o navegador ler o nome do arquivo dos downloads (exportacoes, PDF/A, ZIP)
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    console.warn('[CORS] Origem bloqueada:', origin);
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const { chaveIp, limiterAdminLogin } = require('./middlewares/seguranca');

// Limite moderado para rotas admin autenticadas: 60 req/min (nao-sensivel,
// so para evitar flood de painel interno). Mantido inline pois e especifico.
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chaveIp,
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
  keyGenerator: chaveIp,
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
// FAQ do portal pode passar dos 50kb do parser global
app.use('/organizacao', express.json({ limit: '2mb' }), express.urlencoded({ limit: '2mb', extended: true }));
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
const pesquisaRoutes = require('./routes/pesquisa');
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
app.use('/admin/login', limiterAdminLogin);
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
// /pesquisa — autenticadas usam crudLimiter padrão; rotas publicas
// (/pesquisa/publico/*) tem limiters proprios definidos no router
// (per-IP 3/24h em submissoes + per-slug 1000/min em tudo).
app.use('/pesquisa', crudLimiter);
app.use('/pesquisa', pesquisaRoutes);
app.use('/repositorio', crudLimiter);
app.use('/repositorio', repositorioRoutes);
app.use('/conformidade', crudLimiter);
app.use('/conformidade', conformidadeRoutes);
app.use('/treinamento', crudLimiter);
app.use('/treinamento', treinamentoRoutes);
// Transversais (Etapa 1 PoC): anexos, historico por registro e lista de
// usuarios da organizacao para seletores de responsavel.
app.use('/anexos', crudLimiter);
app.use('/anexos', require('./routes/anexos'));
app.use('/historico', crudLimiter);
app.use('/historico', require('./routes/historico'));
app.use('/usuarios', crudLimiter);
app.use('/usuarios', require('./routes/usuarios'));
// Etapa 2 PoC: setores (transversal), inventario de sistemas e terceiros
app.use('/setores', crudLimiter);
app.use('/setores', require('./routes/setores'));
app.use('/inventario', crudLimiter);
app.use('/inventario', require('./routes/inventario'));
app.use('/terceiros', crudLimiter);
app.use('/terceiros', require('./routes/terceiros'));
// Etapa 3 PoC: verificacao publica de certificado de treinamento (sem
// login). Limite proprio para evitar varredura de codigos.
const limiterCertificado = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chaveIp,
  validate: { xForwardedForHeader: false },
  message: { erro: 'Muitas consultas. Aguarde alguns minutos.' }
});
app.use('/certificado', limiterCertificado);
app.use('/certificado', require('./routes/certificadoPublico'));
// Etapa 4 PoC: painel de indicadores, relatorios PDF/A e portabilidade
app.use('/indicadores', crudLimiter);
app.use('/indicadores', require('./routes/indicadores'));
app.use('/relatorios', crudLimiter);
app.use('/relatorios', require('./routes/relatorios'));
app.use('/portabilidade', crudLimiter);
app.use('/portabilidade', require('./routes/portabilidade'));
// Etapa 5 PoC: gerador de minutas, dados do encarregado/FAQ e pagina
// publica de transparencia (sem login, com limite proprio).
app.use('/gerador', crudLimiter);
app.use('/gerador', require('./routes/gerador'));
app.use('/organizacao', crudLimiter);
app.use('/organizacao', require('./routes/organizacao'));
const limiterTransparencia = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chaveIp,
  validate: { xForwardedForHeader: false },
  message: { erro: 'Muitas requisições. Aguarde um momento.' }
});
app.use('/transparencia', limiterTransparencia);
app.use('/transparencia', require('./routes/transparencia'));

// Healthcheck. Deve ser monitorado externamente por um uptime monitor
// gratuito (UptimeRobot, BetterStack, Healthchecks.io) apontando para
// https://<URL-RAILWAY-BACKEND>/health com check a cada 5 min e alerta
// por email para o DPO quando retornar status != 200 ou timeout. A
// infra Railway nao tem alerta nativo de processo caido; esse monitor
// externo eh o que dispara a notificacao quando o backend some.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Anonimizador LGPD API rodando!' });
});

// Endpoints de observabilidade — protegidos por admin-auth.
// Exigem token JWT com isAdmin=true (mesmo da rota /admin/*).
const { adminAuth } = require('./routes/admin');
const { getStatus, getMetrics } = require('./routes/observability');
app.get('/api/status', adminAuth, getStatus);
app.get('/api/metrics', adminAuth, getMetrics);

// Etapa 7a: so abre a porta quando executado direto (node src/server.js);
// os testes importam o app montado com os mesmos limitadores.
const PORT = process.env.PORT || 3001;
if (require.main === module) app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  // Inicializa cron jobs apos o servidor subir
  try {
    const { iniciarCron } = require('./services/cronJobs');
    iniciarCron();
  } catch (err) {
    console.error('[server] falha ao iniciar cron:', err.message);
  }
});

module.exports = { app, prisma };
