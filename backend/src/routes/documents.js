const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mammoth = require('mammoth');
const { PrismaClient } = require('@prisma/client');
const Anthropic = require('@anthropic-ai/sdk');
const { gerarPDFAnonimizado } = require('../services/gerarPDF');

const router = express.Router();
const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const upload = multer({ storage: multer.memoryStorage() });

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token nao fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.camara = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token invalido' });
  }
};

const baseJuridica = {
  contrato: ['LGPD Art. 5, I', 'LGPD Art. 7', 'LAI Art. 31', 'Lei 14.133/2021 Art. 174'],
  ata: ['LGPD Art. 5, I', 'LGPD Art. 7', 'LAI Art. 3', 'LAI Art. 6'],
  processo: ['LGPD Art. 5, I', 'LGPD Art. 7', 'LGPD Art. 23', 'LAI Art. 31'],
  convenio: ['LGPD Art. 5, I', 'LGPD Art. 7', 'LRF Art. 48', 'LAI Art. 31'],
  folha: ['LGPD Art. 5, I', 'LGPD Art. 7', 'LRF Art. 48', 'Lei 8.112 Art. 116'],
  saude: ['LGPD Art. 11 (dado sensivel)', 'LGPD Art. 5, II'],
  outro: ['LGPD Art. 5, I', 'LGPD Art. 7', 'LAI Art. 31']
};

router.post('/anonymize', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
    let texto = '';
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
        const doc = await pdfjs.getDocument({ data: new Uint8Array(req.file.buffer) }).promise;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          texto += content.items.map(item => item.str).join(' ') + '\n';
        }
      } else if (req.file.mimetype.includes('word') || req.file.originalname.endsWith('.docx')) {
        const data = await mammoth.extractRawText({ buffer: req.file.buffer });
        texto = data.value;
      }
    } else {
      texto = req.body.texto || '';
    }

    if (!texto.trim()) return res.status(400).json({ erro: 'Nenhum texto fornecido' });

    const mascara = req.body.mascara || 'asterisk';
    const mascaraDesc = {
      asterisk: 'XXXXX',
      tarjeta: '||||',
      etiqueta: 'a etiqueta correspondente entre colchetes como [CPF], [NOME], [RG]'
    };

    const prompt = `Voce e um sistema de anonimizacao de documentos publicos brasileiros conforme a LGPD.
Substitua TODOS os dados pessoais pela mascara ${mascaraDesc[mascara]}.
Retorne SOMENTE
