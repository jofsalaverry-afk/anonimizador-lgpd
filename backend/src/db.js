// Etapa 7a: UM PrismaClient para todo o backend. Cada `new PrismaClient()`
// abre o proprio pool de conexoes; com 30+ modulos isso podia esgotar as
// conexoes do Postgres. Todo o codigo deve importar daqui:
//   const { prisma } = require('../db');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = { prisma };
