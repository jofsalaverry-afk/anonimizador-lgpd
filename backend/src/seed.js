require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const senhaAdmin = await bcrypt.hash('admin123', 10);
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@anonimizador.com' },
    update: {},
    create: { email: 'admin@anonimizador.com', senhaHash: senhaAdmin }
  });
  console.log('Admin criado:', admin.email);

  const senhaCamara = await bcrypt.hash('camara123', 10);
  const camara = await prisma.camara.upsert({
    where: { email: 'teste@camarateste.gov.br' },
    update: {},
    create: {
      nome: 'Câmara Municipal Teste',
      cnpj: '00.000.000/0001-00',
      email: 'teste@camarateste.gov.br',
      senhaHash: senhaCamara,
      plano: 'basico',
      ativo: true
    }
  });
  console.log('Câmara criada:', camara.nome);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());