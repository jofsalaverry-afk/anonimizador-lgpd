const jwt = require('jsonwebtoken');
const { sessaoValida } = require('../services/mfa');

const { prisma } = require('../db');

// Auth padrao das rotas de modulo (usuario de organizacao).
// Rejeita os tokens intermediarios emitidos pelo /auth/login:
// - mfaPending: senha ok, aguardando o codigo TOTP (/auth/mfa/verificar)
// - mfaSetup: organizacao exige MFA e o usuario ainda nao configurou
// Esses tokens so servem nas rotas de MFA do auth.js.
// Etapa 6d: confere a versao da sessao (sessaoVersao) — "zerar MFA" encerra
// as sessoes abertas do usuario.
async function authUsuario(req, res, next) {
  let decoded;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); // Etapa 7a: algoritmo fixo
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
  if (decoded.mfaPending || decoded.mfaSetup) {
    return res.status(401).json({ erro: 'Sessão incompleta (MFA pendente)' });
  }
  try {
    if (!(await sessaoValida(prisma, decoded))) return res.status(401).json({ erro: 'Sessão encerrada. Entre novamente.' });
  } catch (err) {
    console.error('[authUsuario]', err.message);
    return res.status(500).json({ erro: 'Erro ao validar sessão' });
  }
  req.usuario = decoded;
  next();
}

module.exports = { authUsuario };
