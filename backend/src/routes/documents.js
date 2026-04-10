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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
    const mascara = req.body.mascara || 'asterisk';
    const mascaraDesc = {
      asterisk: 'XXXXX',
      tarjeta: '||||',
      etiqueta: 'a etiqueta correspondente entre colchetes como [CPF], [NOME], [RG]'
    };

    const prompt = `Voce e um sistema de anonimizacao de documentos publicos brasileiros conforme a LGPD.
Leia TODO o conteudo do documento e substitua TODOS os dados pessoais pela mascara ${mascaraDesc[mascara]}.
Dados pessoais incluem: nomes de pessoas fisicas, CPF, RG, enderecos residenciais, emails pessoais, telefones, datas de nascimento, dados bancarios, dados de saude, salarios.
NAO anonimize: nomes de empresas, CNPJs, nomes de orgaos publicos, valores de contratos, datas de assinatura.
Retorne SOMENTE o texto anonimizado com as substituicoes feitas, sem comentarios adicionais.
Depois adicione exatamente: ---STATS---
Depois um JSON: {"nome":0,"cpf":0,"rg":0,"endereco":0,"email":0,"telefone":0,"data_nasc":0,"banco":0}
Depois adicione exatamente: ---TIPO---
Depois o tipo: contrato, ata, processo, convenio, folha, saude, ou outro`;

    let message;

    if (req.file && req.file.mimetype === 'application/pdf') {
      const base64PDF = req.file.buffer.toString('base64');
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64PDF
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      });
    } else if (req.file && (req.file.mimetype.includes('word') || req.file.originalname.endsWith('.docx'))) {
      const data = await mammoth.extractRawText({ buffer: req.file.buffer });
      const texto = data.value;
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt + '\n\nDOCUMENTO:\n' + texto }]
      });
    } else {
      const texto = req.body.texto || '';
      if (!texto.trim()) return res.status(400).json({ erro: 'Nenhum texto fornecido' });
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt + '\n\nDOCUMENTO:\n' + texto }]
      });
    }

    const resposta = message.content[0].text;
    const partes = resposta.split('---STATS---');
    const textoAnonimizado = partes[0].trim();
    let stats = {};
    let tipoDocumento = 'outro';

    if (partes[1]) {
      const partes2 = partes[1].split('---TIPO---');
      try { stats = JSON.parse(partes2[0].match(/\{[\s\S]*\}/)[0]); } catch(e) {}
      if (partes2[1]) tipoDocumento = partes2[1].trim().toLowerCase().split('\n')[0].trim();
    }

    const qtdTotal = Object.values(stats).reduce((a, b) => a + b, 0);
    await prisma.documento.create({
      data: { camaraId: req.camara.id, tipoDocumento, qtdDadosMascarados: qtdTotal, dadosJson: stats }
    });

    res.json({
      textoAnonimizado,
      stats,
      tipoDocumento,
      leisAplicaveis: baseJuridica[tipoDocumento] || baseJuridica.outro
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao processar documento' });
  }
});

router.post('/download-pdf', authMiddleware, async (req, res) => {
  try {
    const { textoAnonimizado, tipoDocumento, leisAplicaveis } = req.body;
    const camara = await prisma.camara.findUnique({ where: { id: req.camara.id } });
    const nomeCamara = camara?.nome || 'Camara Municipal';
    const logoBase64 = camara?.logoBase64 || null;
    const cabecalho = camara?.cabecalho || null;
    const pdfBuffer = await gerarPDFAnonimizado(textoAnonimizado, tipoDocumento, leisAplicaveis, nomeCamara, logoBase64, cabecalho);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar PDF' });
  }
});

module.exports = router;
