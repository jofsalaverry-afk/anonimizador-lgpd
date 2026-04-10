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

async function extrairTextoPDFComPosicoes(buffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const itens = content.items.map(item => ({
      str: item.str,
      x: item.transform[4],
      y: viewport.height - item.transform[5],
      width: item.width,
      height: item.height || 10,
      pagina: i
    }));
    paginas.push({ pagina: i, altura: viewport.height, largura: viewport.width, itens });
  }
  return paginas;
}

async function identificarDadosPessoais(texto) {
  const prompt = `Voce e um sistema de identificacao de dados pessoais conforme a LGPD brasileira.
Analise o texto e retorne APENAS um JSON com a lista de dados pessoais encontrados.
Dados pessoais incluem: nomes de pessoas fisicas, CPF, RG, enderecos residenciais, emails pessoais, telefones pessoais, datas de nascimento, dados bancarios, dados de saude, salarios.
NAO inclua: nomes de empresas, CNPJs, nomes de orgaos publicos, valores de contratos, datas de assinatura de contratos, enderecos de sede de empresas.
Retorne SOMENTE este JSON sem mais nada:
{"dados": ["dado1", "dado2", "dado3"]}

TEXTO:
${texto}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const json = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
    return json.dados || [];
  } catch(e) {
    return [];
  }
}

async function aplicarTarjasNoPDF(pdfBuffer, dadosPessoais, paginas) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();

  for (const paginaData of paginas) {
    const page = pages[paginaData.pagina - 1];
    for (const dado of dadosPessoais) {
      const palavras = dado.trim().split(/\s+/);
      for (let i = 0; i < paginaData.itens.length; i++) {
        const item = paginaData.itens[i];
        const textoItem = item.str.trim();
        if (!textoItem) continue;
        if (dado.length > 3 && textoItem.includes(dado.trim())) {
          page.drawRectangle({
            x: item.x - 1,
            y: paginaData.altura - item.y - item.height - 2,
            width: item.width + 2,
            height: item.height + 4,
            color: rgb(0, 0, 0)
          });
        } else if (palavras.length > 1) {
          let textoAcumulado = '';
          let xInicio = null;
          let yPos = null;
          let larguraTotal = 0;
          let alturaMax = 0;
          for (let j = i; j < Math.min(i + palavras.length + 2, paginaData.itens.length); j++) {
            const t = paginaData.itens[j].str.trim();
            if (!t) continue;
            if (xInicio === null) { xInicio = paginaData.itens[j].x; yPos = paginaData.itens[j].y; }
            textoAcumulado += (textoAcumulado ? ' ' : '') + t;
            larguraTotal = paginaData.itens[j].x + paginaData.itens[j].width - xInicio;
            alturaMax = Math.max(alturaMax, paginaData.itens[j].height || 10);
            if (textoAcumulado.includes(dado.trim())) {
              page.drawRectangle({
                x: xInicio - 1,
                y: paginaData.altura - yPos - alturaMax - 2,
                width: larguraTotal + 2,
                height: alturaMax + 4,
                color: rgb(0, 0, 0)
              });
              break;
            }
          }
        }
      }
    }
  }

  return Buffer.from(await pdfDoc.save());
}

router.post('/anonymize', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
    const mascara = req.body.mascara || 'asterisk';

    if (req.file && req.file.mimetype === 'application/pdf') {
      const paginas = await extrairTextoPDFComPosicoes(req.file.buffer);
      const textoCompleto = paginas.flatMap(p => p.itens.map(i => i.str)).join(' ');

      const dadosPessoais = await identificarDadosPessoais(textoCompleto);

      const pdfTarjado = await aplicarTarjasNoPDF(req.file.buffer, dadosPessoais, paginas);

      const stats = { nome: 0, cpf: 0, rg: 0, endereco: 0, email: 0, telefone: 0, data_nasc: 0, banco: 0 };
      dadosPessoais.forEach(d => {
        if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(d)) stats.cpf++;
        else if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(d)) stats.data_nasc++;
        else stats.nome++;
      });

      await prisma.documento.create({
        data: { camaraId: req.camara.id, tipoDocumento: 'contrato', qtdDadosMascarados: dadosPessoais.length, dadosJson: stats }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
      return res.send(pdfTarjado);
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
