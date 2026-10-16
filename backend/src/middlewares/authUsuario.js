const jwt = require('jsonwebtoken');

// Auth padrao das rotas de modulo (usuario de organizacao).
// Rejeita os tokens intermediarios emitidos pelo /auth/login:
// - mfaPending: senha ok, aguardando o codigo TOTP (/auth/mfa/verificar)
// - mfaSetup: organizacao exige MFA e o usuario ainda nao configurou
// Esses tokens so servem nas rotas de MFA do auth.js.
function authUsuario(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.mfaPending || decoded.mfaSetup) {
      return res.status(401).json({ erro: 'Sessão incompleta (MFA pendente)' });
    }
    req.usuario = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

module.exports = { authUsuario };
