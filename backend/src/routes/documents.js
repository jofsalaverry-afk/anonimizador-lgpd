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

async function extrairItensComPosicao(pdfBuffer) {
 const pdfjsLib = require('pdfjs-dist');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const resultado = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      resultado.push({
        str: item.str,
        x: item.transform[4],
        y: viewport.height - item.transform[5] - (item.height || 12),
        width: item.width,
        height: item.height || 12,
        pagina: p,
        alturaPage: viewport.height
      });
    }
  }
  return resultado;
}

async function identificarDadosParaTarjar(pdfBuffer) {
  const base64PDF = pdfBuffer.toString('base64');
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64PDF } },
        {
          type: 'text',
          text: `Analise este documento e liste APENAS os dados que devem ser anonimizados conforme LGPD e LAI brasileiras.

DEVE anonimizar:
- CPF de qualquer pessoa (formato XXX.XXX.XXX-XX)
- RG
- Enderecos residenciais de pessoas fisicas
- Nomes de pessoas fisicas privadas (representantes de empresas, fornecedores, contratados privados)
- Emails e telefones pessoais
- Datas de nascimento

NAO deve anonimizar:
- Nomes de agentes publicos no exercicio de suas funcoes (prefeito, vereador, presidente de camara, servidor nomeado em portaria)
- Nomes de empresas e CNPJs
- Enderecos de sede de empresas
- Valores de contratos
- Datas de assinatura

Retorne SOMENTE este JSON:
{"dados": ["texto exato 1", "texto exato 2"], "tipo": "contrato"}`
        }
      ]
    }]
  });

  try {
    const json = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
    return { dados: json.dados || [], tipo: json.tipo || 'contrato' };
  } catch(e) {
    return { dados: [], tipo: 'contrato' };
  }
}

async function anonimizarPDFComTarjas(pdfBuffer) {
  const [itens, { dados, tipo }] = await Promise.all([
    extrairItensComPosicao(pdfBuffer),
    identificarDadosParaTarjar(pdfBuffer)
  ]);

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();

  for (const dado of dados) {
    const dadoLower = dado.toLowerCase().trim();
    const palavras = dadoLower.split(/\s+/);

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const itemLower = item.str.toLowerCase().trim();

      if (palavras.length === 1) {
        if (itemLower.includes(dadoLower) || dadoLower.includes(itemLower)) {
          const page = pages[item.pagina - 1];
          if (!page) continue;
          const { height } = page.getSize();
          page.drawRectangle({
            x: Math.max(0, item.x - 1),
            y: Math.max(0, height - item.y - item.height - 2),
            width: Math.max(item.width + 2, 40),
            height: item.height + 4,
            color: rgb(0, 0, 0)
          });
        }
      } else {
        let textoAcum = '';
        let xInicio = null;
        let yPos = null;
        let paginaMatch = null;
        let largura = 0;
        let alturaMax = 0;

        for (let j = i; j < Math.min(i + palavras.length * 2, itens.length); j++) {
          const t = itens[j];
          if (t.pagina !== item.pagina) break;
          if (!t.str.trim()) continue;

          if (xInicio === null) {
            xInicio = t.x;
            yPos = t.y;
            paginaMatch = t.pagina;
          }

          textoAcum += (textoAcum ? ' ' : '') + t.str.trim();
          largura = t.x + t.width - xInicio;
          alturaMax = Math.max(alturaMax, t.height || 12);

          if (textoAcum.toLowerCase().includes(dadoLower)) {
            const page = pages[paginaMatch - 1];
            if (!page) break;
            const { height } = page.getSize();
            page.drawRectangle({
              x: Math.max(0, xInicio - 1),
              y: Math.max(0, height - yPos - alturaMax - 2),
              width: Math.max(largura + 2, 40),
              height: alturaMax + 4,
              color: rgb(0, 0, 0)
            });
            break;
          }
        }
      }
    }
  }

  const stats = { nome: 0, cpf: 0, rg: 0, endereco: 0, email: 0, telefone: 0, data_nasc: 0, banco: 0 };
  dados.forEach(d => {
    if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(d)) stats.cpf++;
    else if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(d)) stats.data_nasc++;
    else if (d.includes('@')) stats.email++;
    else stats.nome++;
  });

  return { pdfBuffer: Buffer.from(await pdfDoc.save()), stats, tipoDocumento: tipo };
}

router.post('/anonymize', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
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

    const mascara = req.body.mascara || 'asterisk';
    const mascaraDesc = { asterisk: 'XXXXX', tarjeta: '||||', etiqueta: 'a etiqueta correspondente entre colchetes como [CPF], [NOME], [RG]' };
    const prompt = `Voce e um sistema de anonimizacao de documentos publicos brasileiros conforme a LGPD e LAI.
Substitua TODOS os dados pessoais de pessoas fisicas privadas pela mascara ${mascaraDesc[mascara]}.
NAO substitua nomes de agentes publicos no exercicio de suas funcoes.
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
