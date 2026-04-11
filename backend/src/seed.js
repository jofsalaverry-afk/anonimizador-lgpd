// Seed inicial do banco. Nao usa senhas hardcoded — exige variaveis de
// ambiente para evitar que credenciais default vazem via repo publico.
//
// Uso:
//   SEED_ADMIN_EMAIL=admin@dominio.com SEED_ADMIN_SENHA=SenhaForte node src/seed.js
//
// Opcionalmente cria tambem uma camara de teste:
//   ... SEED_CAMARA_EMAIL=teste@foo SEED_CAMARA_SENHA=xxx node src/seed.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminSenha = process.env.SEED_ADMIN_SENHA;

  if (!adminEmail || !adminSenha) {
    console.warn('[seed] SEED_ADMIN_EMAIL/SEED_ADMIN_SENHA nao definidas — pulando seed.');
    console.warn('[seed] Para criar/atualizar o admin, rode manualmente:');
    console.warn('[seed]   SEED_ADMIN_EMAIL=... SEED_ADMIN_SENHA=... node src/seed.js');
    return;
  }
  if (adminSenha.length < 8) {
    console.error('ERRO: SEED_ADMIN_SENHA deve ter no minimo 8 caracteres.');
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(adminSenha, 10);
  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: { senhaHash },
    create: { email: adminEmail, senhaHash }
  });
  console.log('Admin criado/atualizado:', admin.email);

  // Camara de teste e opcional e so acontece se ambas as envs estiverem setadas
  const camaraEmail = process.env.SEED_CAMARA_EMAIL;
  const camaraSenha = process.env.SEED_CAMARA_SENHA;
  if (camaraEmail && camaraSenha) {
    if (camaraSenha.length < 8) {
      console.error('ERRO: SEED_CAMARA_SENHA deve ter no minimo 8 caracteres.');
      process.exit(1);
    }
    const camaraHash = await bcrypt.hash(camaraSenha, 10);
    const camara = await prisma.camara.upsert({
      where: { email: camaraEmail },
      update: {},
      create: {
        nome: process.env.SEED_CAMARA_NOME || 'Camara Municipal de Teste',
        cnpj: process.env.SEED_CAMARA_CNPJ || '00.000.000/0001-00',
        email: camaraEmail,
        senhaHash: camaraHash,
        plano: 'basico',
        ativo: true
      }
    });
    console.log('Camara criada:', camara.nome);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
