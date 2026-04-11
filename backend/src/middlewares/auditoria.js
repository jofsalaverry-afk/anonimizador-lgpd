// Middleware de auditoria. Captura toda request mutavel autenticada
// (POST/PUT/PATCH/DELETE) e grava em LogAuditoria. Operacao assincrona
// fire-and-forget para nao bloquear a resposta. Sanitiza body removendo
// campos sensiveis (senha, token, hash, secret).
//
// Uso: app.use(auditoriaMiddleware(prisma)) APOS os middlewares de auth
// que populam req.camara ou req.admin.

const METODOS_AUDITAVEIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CAMPOS_SENSIVEIS = ['senha', 'password', 'senhaHash', 'token', 'secret', 'apiKey', 'authorization', 'novaSenha', 'mfaSecret'];

function sanitizar(obj, depth = 0) {
  if (depth > 4 || obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(v => sanitizar(v, depth + 1));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (CAMPOS_SENSIVEIS.some(c => k.toLowerCase().includes(c.toLowerCase()))) {
      out[k] = '<redacted>';
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = v.slice(0, 500) + '…';
    } else {
      out[k] = sanitizar(v, depth + 1);
    }
  }
  return out;
}

function auditoriaMiddleware(prisma) {
  return (req, res, next) => {
    if (!METODOS_AUDITAVEIS.has(req.method)) return next();

    const inicio = Date.now();
    const bodyOriginal = req.body ? sanitizar(req.body) : null;

    res.on('finish', () => {
      // Identifica usuario via populacao de auth middlewares
      let userId = null;
      let userType = null;
      let camaraId = null;
      if (req.admin) {
        userId = req.admin.id;
        userType = 'admin';
      } else if (req.camara) {
        userId = req.camara.id;
        userType = 'camara';
        camaraId = req.camara.id;
      }
      // Nao audita requests anonimas (login fail, healthcheck, preflight)
      if (!userId) return;

      const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
      const ua = (req.headers['user-agent'] || '').slice(0, 300);
      const rota = req.originalUrl.split('?')[0];

      // Fire-and-forget. Falha de log nao deve afetar request.
      prisma.logAuditoria.create({
        data: {
          userId,
          userType,
          camaraId,
          metodo: req.method,
          rota,
          statusCode: res.statusCode,
          durMs: Date.now() - inicio,
          ip: ip || null,
          userAgent: ua || null,
          body: bodyOriginal
        }
      }).catch(err => console.error('[auditoria] falha gravando log:', err.message));
    });

    next();
  };
}

module.exports = { auditoriaMiddleware };
