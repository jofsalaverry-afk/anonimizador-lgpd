const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mammoth = require('mammoth');
const { PrismaClient } = require('@prisma/client');
const Anthropic = require('@anthropic-ai/sdk');
const { PDFDocument, rgb } = require('pdf-lib');

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

async function anonimizarPDFComTarjas(pdfBuffer) {
  const base64PDF = pdfBuffer.toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64PDF }
        },
        {
          type: 'text',
          text: `Analise este documento PDF e identifique TODOS os dados pessoais de pessoas fisicas conforme a LGPD brasileira.
Dados pessoais incluem: nomes de pessoas fisicas, CPF, RG, enderecos residenciais, emails pessoais, telefones pessoais, datas de nascimento.
NAO inclua: nomes de empresas, CNPJs, nomes de orgaos publicos, valores de contratos, datas de assinatura.

Para cada dado pessoal encontrado, retorne sua localizacao aproximada na pagina em porcentagem (0-100) de onde ele aparece na pagina.

Retorne SOMENTE este JSON sem mais nada:
{
  "dados": [
    {"texto": "dado pessoal exato", "pagina": 1, "topo_pct": 25, "tipo": "nome"}
  ],
  "tipo_documento": "contrato"
}`
        }
      ]
    }]
  });

  let dados = [];
  let tipoDocumento = 'contrato';
  try {
    const json = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
    dados = json.dados || [];
    tipoDocumento = json.tipo_documento || 'contrato';
  } catch(e) {
    console.error('Erro ao parsear JSON da IA:', e);
  }

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();

  for (const dado of dados) {
    const pageIndex = (dado.pagina || 1) - 1;
    if (pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    const topoPct = Math.max(0, Math.min(100, dado.topo_pct || 50));
    const y = height - (topoPct / 100) * height - 15;
    const largura = Math.min(dado.texto ? dado.texto.length * 7 : 100, width - 100);
    page.drawRectangle({
      x: 50,
      y: Math.max(0, y),
      width: largura,
      height: 16,
      color: rgb(0, 0, 0)
    });
  }

  const stats = { nome: 0, cpf: 0, rg: 0, endereco: 0, email: 0, telefone: 0, data_nasc: 0, banco: 0 };
  dados.forEach(d => {
    const tipo = d.tipo || 'nome';
    if (stats[tipo] !== undefined) stats[tipo]++;
    else stats.nome++;
  });

  return { pdfBuffer: Buffer.from(await pdfDoc.save()), stats, tipoDocumento };
}

router.post('/anonymize', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
    const mascara = req.body.mascara || 'asterisk';

    if (req.file && req.file.mimetype === 'application/pdf') {
      const { pdfBuffer, stats, tipoDocumento } = await anonimizarPDFComTarjas(req.file.buffer);

      await prisma.documento.create({
        data: { camaraId: req.camara.id, tipoDocumento, qtdDadosMascarados: Object.values(stats).reduce((a,b)=>a+b,0), dadosJson: stats }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
      return res.send(pdfBuffer);
    }

    let texto = '';
    if (req.file && (req.file.mimetype.includes('word') || req.file.originalname.endsWith('.docx'))) {
      const data = await mammoth.extractRawText({ buffer: req.file.buffer });
      texto = data.value;
    } else {
      texto = req.body.texto || '';
    }

    if (!texto.trim()) return res.status(400).json({ erro: 'Nenhum texto fornecido' });

    const mascaraDesc = { asterisk: 'XXXXX', tarjeta: '||||', etiqueta: 'a etiqueta correspondente entre colchetes como [CPF], [NOME], [RG]' };
    const prompt = `Voce e um sistema de anonimizacao de documentos publicos brasileiros conforme a LGPD.
Substitua TODOS os dados pessoais pela mascara ${mascaraDesc[mascara]}.
Retorne SOMENTE o texto com as substituicoes feitas, sem comentarios.
Depois adicione exatamente: ---STATS---
Depois um JSON: {"nome":0,"cpf":0,"rg":0,"endereco":0,"email":0,"telefone":0,"data_nasc":0,"banco":0}
Depois adicione exatamente: ---TIPO---
Depois o tipo: contrato, ata, processo, convenio, folha, saude, ou outro

DOCUMENTO:
${texto}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    });

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

    res.json({ textoAnonimizado, stats, tipoDocumento, leisAplicaveis: baseJuridica[tipoDocumento] || baseJuridica.outro });
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
    const PDFKit = require('pdfkit');
    const buffers = [];
    const doc = new PDFKit({ margin: 50 });
    doc.on('data', chunk => buffers.push(chunk));
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      if (logoBase64) {
        try {
          const imgBuffer = Buffer.from(logoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          doc.image(imgBuffer, 50, 50, { width: 80, height: 80 });
          doc.fontSize(15).font('Helvetica-Bold').fillColor('#1a1a2e').text(nomeCamara, 145, 60, { width: 350 });
          if (cabecalho) doc.fontSize(9).font('Helvetica').fillColor('#555555').text(cabecalho, 145, doc.y + 2, { width: 350 });
        } catch(e) {
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a2e').text(nomeCamara, { align: 'center' });
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a2e').text(nomeCamara, { align: 'center' });
        if (cabecalho) doc.fontSize(9).font('Helvetica').fillColor('#555555').text(cabecalho, { align: 'center' });
      }
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a2e').text('DOCUMENTO ANONIMIZADO - LGPD', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#888888').text('Tipo: ' + tipoDocumento.toUpperCase() + '   |   Gerado em: ' + new Date().toLocaleString('pt-BR'), { align: 'center' });
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
      doc.moveDown(0.8);
      doc.fontSize(11).font('Helvetica').fillColor('#000000').text(textoAnonimizado, { align: 'justify', lineGap: 4 });
      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
      doc.moveDown(0.8);
      if (leisAplicaveis && leisAplicaveis.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Fundamentacao Legal:');
        doc.moveDown(0.3);
        leisAplicaveis.forEach(lei => doc.fontSize(9).font('Helvetica').fillColor('#555555').text('- ' + lei));
      }
      doc.end();
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar PDF' });
  }
});

module.exports = router;
