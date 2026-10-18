// Busca de conta por e-mail (usuario da camara ou Admin).
//
// O e-mail e comparado em minusculas. Compatibilidade: ate a Etapa 7c,
// algumas rotas gravavam o e-mail "normalizado" pelo validator (Gmail sem
// pontos e sem "+sufixo"). Se a busca exata nao acha, tenta essa forma
// antiga — assim quem foi cadastrado daquele jeito continua entrando com o
// e-mail que sempre digitou.
const { normalizeEmail } = require('validator');

const emailMinusculo = v => String(v || '').trim().toLowerCase();
const formaAntiga = v => {
  const n = normalizeEmail(emailMinusculo(v));
  return n && n !== emailMinusculo(v) ? n : null;
};

async function buscarPorEmail(model, email, opcoes = {}) {
  const e = emailMinusculo(email);
  if (!e) return null;
  const exato = await model.findUnique({ where: { email: e }, ...opcoes });
  if (exato) return exato;
  const antiga = formaAntiga(e);
  return antiga ? model.findUnique({ where: { email: antiga }, ...opcoes }) : null;
}

module.exports = { buscarPorEmail, emailMinusculo, formaAntiga };
