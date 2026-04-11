// Script para trocar a senha do admin. Uso:
//   node trocar-senha-admin.js <nova-senha>
//   node trocar-senha-admin.js <nova-senha> <email>
// Ou via env var (mais seguro, nao fica no shell history):
//   NOVA_SENHA=xxx node trocar-senha-admin.js
//   NOVA_SENHA=xxx ADMIN_EMAIL=foo@bar.com node trocar-senha-admin.js
//
// No Railway: abra o shell do servico backend e rode acima.

require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const novaSenha = process.env.NOVA_SENHA || process.argv[2];
  const email = process.env.ADMIN_EMAIL || process.argv[3] || 'admin@anonimizador.com';

  if (!novaSenha) {
    console.error('ERRO: informe a nova senha.');
    console.error('Uso: node trocar-senha-admin.js <nova-senha> [email]');
    console.error('Ou:  NOVA_SENHA=xxx node trocar-senha-admin.js');
    process.exit(1);
  }
  if (novaSenha.length < 8) {
    console.error('ERRO: senha deve ter no minimo 8 caracteres.');
    process.exit(1);
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    console.error(`ERRO: admin com email "${email}" nao encontrado.`);
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(novaSenha, 10);
  await prisma.admin.update({ where: { email }, data: { senhaHash } });
  console.log(`OK - senha do admin "${email}" atualizada.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
