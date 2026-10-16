// Slug publico da organizacao (usado em #solicitar/:slug, #pesquisa/:slug,
// #transparencia/:slug). Gerado a partir do nome na criacao; o admin pode
// editar depois.
const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugDoNome(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')           // entidades HTML (o validador da rota faz escape)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'organizacao';
}

function slugValido(slug) {
  return typeof slug === 'string' && slug.length >= 3 && slug.length <= 60 && FORMATO_SLUG.test(slug);
}

// Primeiro slug livre: base, base-2, base-3...
async function slugUnico(db, nome) {
  const base = slugDoNome(nome);
  for (let n = 1; n < 1000; n++) {
    const candidato = n === 1 ? base : `${base.slice(0, 56)}-${n}`;
    const existe = await db.organizacao.findUnique({ where: { slug: candidato }, select: { id: true } });
    if (!existe) return candidato;
  }
  throw new Error('Não foi possível gerar um slug livre');
}

module.exports = { slugDoNome, slugValido, slugUnico };
