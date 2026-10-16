// Seed inicial do banco. Nao usa senhas hardcoded — exige variaveis de
// ambiente para evitar que credenciais default vazem via repo publico.
//
// Roda no Pre-deploy do Railway a cada deploy, entao precisa ser
// idempotente e NUNCA alterar dados existentes:
//   - sem SEED_ADMIN_EMAIL/SEED_ADMIN_SENHA: nao faz nada;
//   - admin com esse e-mail ja existe: nao mexe (nem senha, nem nada);
//   - admin nao existe: cria.
// Para trocar a senha do admin use trocar-senha-admin.js, nao o seed.
//
// Uso manual:
//   SEED_ADMIN_EMAIL=admin@dominio.com SEED_ADMIN_SENHA=SenhaForte node src/seed.js

require('dotenv').config();
const bcrypt = require('bcrypt');

// Retorna { acao: 'ignorado' | 'existente' | 'criado', email? }.
async function executarSeed(prisma, env = process.env) {
  const adminEmail = env.SEED_ADMIN_EMAIL;
  const adminSenha = env.SEED_ADMIN_SENHA;

  if (!adminEmail || !adminSenha) {
    console.warn('[seed] SEED_ADMIN_EMAIL/SEED_ADMIN_SENHA nao definidas — nada a fazer.');
    return { acao: 'ignorado' };
  }
  if (adminSenha.length < 8) {
    throw new Error('SEED_ADMIN_SENHA deve ter no minimo 8 caracteres.');
  }

  const existente = await prisma.admin.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existente) {
    console.log('[seed] Admin ja existe — nenhuma alteracao feita.');
    return { acao: 'existente', email: adminEmail };
  }

  try {
    await prisma.admin.create({ data: { email: adminEmail, senhaHash: await bcrypt.hash(adminSenha, 10) } });
  } catch (err) {
    // Dois deploys em paralelo: o outro criou primeiro. Nada a fazer.
    if (err.code === 'P2002') return { acao: 'existente', email: adminEmail };
    throw err;
  }
  console.log('[seed] Admin criado:', adminEmail);
  return { acao: 'criado', email: adminEmail };
}

module.exports = { executarSeed };

if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  executarSeed(prisma)
    .catch(e => { console.error('[seed] ERRO:', e.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
