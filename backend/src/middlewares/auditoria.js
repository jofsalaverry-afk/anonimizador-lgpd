// Middleware de auditoria. Captura toda request mutavel autenticada
// (POST/PUT/PATCH/DELETE) e grava em LogAuditoria. Operacao assincrona
// fire-and-forget para nao bloquear a resposta. Sanitiza body removendo
// campos sensiveis (senha, token, hash, secret).
//
// Tamper-evidence: cada linha carrega hash SHA-256 do proprio conteudo
// + hash da linha anterior na mesma chain. Chain e definida por
// (camaraId, userType). Insercao usa pg_advisory_xact_lock na chave da
// chain dentro de transacao — serializa writes por chain, evitando
// fork (duas linhas com mesmo prevHash). Deteccao de adulteracao:
// recomputar hash de cada linha e verificar linkagem com a anterior;
// qualquer edicao, delecao ou reordenacao quebra a cadeia.
//
// Uso: app.use(auditoriaMiddleware(prisma)) APOS os middlewares de auth
// que populam req.camara ou req.admin.

const crypto = require('crypto');

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

// Hash canonico do registro + prevHash. Ordem dos campos e fixa;
// alterar aqui invalida TODOS os hashes antigos da chain.
function gerarHash(r, prevHash) {
  const partes = [
    r.userId || '',
    r.userType || '',
    r.camaraId || '',
    r.metodo,
    r.rota,
    r.statusCode ?? '',
    r.durMs ?? '',
    r.ip || '',
    r.userAgent || '',
    r.body ? JSON.stringify(r.body) : '',
    r.criadoEm.toISOString(),
    prevHash || ''
  ];
  return crypto.createHash('sha256').update(partes.join('|')).digest('hex');
}

// Anexa um registro a chain (camaraId, userType). Advisory lock por
// chain garante que duas insercoes simultaneas na mesma chain sejam
// serializadas — caso contrario ambas leriam o mesmo "ultimo hash" e
// forcariam fork. criadoEm e computado DENTRO do lock para garantir
// monotonicidade: empate em milissegundo torna ORDER BY criadoEm desc
// ambiguo, entao se o relogio nao avancou desde a ultima linha, forca
// +1ms. Sob clock skew isso distorce timestamps em ms, nao mais.
async function appendLog(prisma, registro) {
  const chainKey = [registro.camaraId ?? '', registro.userType ?? ''].join('|');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9999, hashtext(${chainKey}))`;
    const anterior = await tx.logAuditoria.findFirst({
      where: { camaraId: registro.camaraId, userType: registro.userType },
      orderBy: { criadoEm: 'desc' },
      select: { hash: true, criadoEm: true }
    });
    const prevHash = anterior?.hash ?? null;
    let criadoEm = new Date();
    if (anterior && criadoEm <= anterior.criadoEm) {
      criadoEm = new Date(anterior.criadoEm.getTime() + 1);
    }
    const registroFinal = { ...registro, criadoEm };
    await tx.logAuditoria.create({
      data: { ...registroFinal, prevHash, hash: gerarHash(registroFinal, prevHash) }
    });
  }, { timeout: 15000 });
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
      } else if (req.usuario) {
        userId = req.usuario.id;
        userType = 'usuario';
        camaraId = req.usuario.organizacaoId;
      }
      // Nao audita requests anonimas (login fail, healthcheck, preflight)
      if (!userId) return;

      const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
      const ua = (req.headers['user-agent'] || '').slice(0, 300);
      const rota = req.originalUrl.split('?')[0];
      const registro = {
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
      };

      // Fire-and-forget. Falha de log nao deve afetar request.
      appendLog(prisma, registro)
        .catch(err => console.error('[auditoria] falha gravando log:', err.message));
    });

    next();
  };
}

// Helper para auditar tentativas de login (sucesso e falha) explicitamente.
// O middleware automatico nao captura login porque ele depende de
// req.camara/req.admin estarem populados, o que so acontece APOS o
// login. Esse helper deve ser chamado dentro dos handlers de login.
//
// IMPORTANTE: nunca passa req.body inteiro aqui — ele contem a senha.
// Construimos manualmente um body sem dados sensiveis.
function auditarLogin(prisma, { req, sucesso, userType, userId, motivo }) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const ua = (req.headers['user-agent'] || '').slice(0, 300);
  const rota = (req.originalUrl || req.url || '').split('?')[0];
  const registro = {
    userId: userId || null,
    userType,
    camaraId: userType === 'camara' && sucesso ? userId : null,
    metodo: 'POST',
    rota,
    statusCode: sucesso ? 200 : 401,
    durMs: null,
    ip: ip || null,
    userAgent: ua || null,
    body: { tentativa: 'login', email: req.body?.email || null, sucesso, motivo: motivo || null }
  };
  appendLog(prisma, registro)
    .catch(err => console.error('[auditoria-login] falha gravando log:', err.message));
}

module.exports = { auditoriaMiddleware, auditarLogin };
