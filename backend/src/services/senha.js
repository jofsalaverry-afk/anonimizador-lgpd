// Senhas de usuario (Etapa 7a): regra minima, troca, primeiro acesso e
// recuperacao por e-mail. Nunca grava nem registra a senha em historico/log.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { registrarHistorico } = require('./historico');

const SENHA_MIN = 10;
const SENHA_MAX = 200;
const MINUTOS_LINK = 30;

function erroNovaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres`;
  if (senha.length > SENHA_MAX) return 'Senha muito longa';
  if (/^(.)\1+$/.test(senha)) return 'Escolha uma senha menos previsível';
  return null;
}

const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');
const gerarToken = () => crypto.randomBytes(32).toString('base64url');

// Grava a nova senha, encerra as sessoes abertas e registra no historico
// (so o fato, nunca a senha).
async function gravarNovaSenha(db, usuario, novaSenha, { comoFoi, porUsuarioId = usuario.id }) {
  const senhaHash = await bcrypt.hash(novaSenha, 10);
  const atualizado = await db.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash, senhaTrocaObrigatoria: false, senhaAlteradaEm: new Date(), sessaoVersao: (usuario.sessaoVersao || 0) + 1 }
  });
  await registrarHistorico(db, {
    organizacaoId: usuario.organizacaoId, entidade: 'USUARIO', registroId: usuario.id, acao: 'EDITAR', usuarioId: porUsuarioId,
    diff: { senha: { antes: null, depois: comoFoi } }
  });
  return atualizado;
}

module.exports = { SENHA_MIN, MINUTOS_LINK, erroNovaSenha, hashToken, gerarToken, gravarNovaSenha };
