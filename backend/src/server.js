require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(cors({
  origin: [
    'https://melodious-emotion-production-c6a6.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const documentRoutes = require('./routes/documents');

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/perfil', require('./routes/perfil'));
app.use('/documents', documentRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Anonimizador LGPD API rodando!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = { prisma };
