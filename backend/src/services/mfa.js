// MFA (TOTP): verificacao de codigo, versao de sessao e "zerar MFA".
// Nunca grava nem devolve o segredo em historico/log.
const speakeasy = require('speakeasy');
const { registrarHistorico } = require('./historico');

const RE_CODIGO = /^\d{6}$/;
const MOTIVO_MIN = 3;
const MOTIVO_MAX = 500;

function codigoValido(secret, codigo) {
  if (!secret || !RE_CODIGO.test(String(codigo || ''))) return false;
  return speakeasy.totp.verify({ secret, encoding: 'base32', token: String(codigo), window: 1 });
}

// Sessao vale se o usuario existe, nao foi excluido e a versao do token
// (sv; tokens antigos sem sv contam como 0) nao e menor que a atual.
async function sessaoValida(db, decoded) {
  if (!decoded?.id) return false;
  const u = await db.usuario.findUnique({ where: { id: decoded.id }, select: { sessaoVersao: true, deletedAt: true } });
  if (!u || u.deletedAt) return false;
  return (decoded.sv || 0) >= (u.sessaoVersao || 0);
}

function lerMotivo(motivo) {
  const m = typeof motivo === 'string' ? motivo.trim() : '';
  if (m.length < MOTIVO_MIN) return { erro: 'Informe o motivo (obrigatório)' };
  return { motivo: m.slice(0, MOTIVO_MAX) };
}

// Zera o MFA de outro usuario: apaga o segredo, marca inativo e encerra as
// sessoes abertas (sessaoVersao + 1). Historico: quem zerou (usuarioId, ou
// alteradoPorAdmin), de quem (registroId) e o motivo.
async function zerarMfa(db, { alvo, usuarioId = null, adminEmail = null, motivo }) {
  return db.$transaction(async (tx) => {
    const u = await tx.usuario.update({
      where: { id: alvo.id },
      data: { mfaSecret: null, mfaSecretPendente: null, mfaAtivo: false, sessaoVersao: (alvo.sessaoVersao || 0) + 1 },
      select: { id: true, nome: true, email: true, perfil: true, ativo: true, mfaAtivo: true, ultimoAcesso: true, criadoEm: true }
    });
    await registrarHistorico(tx, {
      organizacaoId: alvo.organizacaoId, entidade: 'USUARIO', registroId: alvo.id, acao: 'EDITAR', usuarioId,
      diff: {
        mfa: { antes: alvo.mfaAtivo ? 'ativo' : 'configuração iniciada', depois: 'zerado (sessões encerradas)' },
        motivo: { antes: null, depois: motivo },
        ...(adminEmail && { alteradoPorAdmin: { antes: null, depois: adminEmail } })
      }
    });
    return u;
  });
}

module.exports = { codigoValido, sessaoValida, lerMotivo, zerarMfa, RE_CODIGO };
