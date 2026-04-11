const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mammoth = require('mammoth');
const { PrismaClient } = require('@prisma/client');
const Anthropic = require('@anthropic-ai/sdk');
const {
  extrairItens,
  agruparLinhas,
  construirTarjas,
  aplicarTarjas,
  buildPromptItens,
  PROMPT_INSTRUCOES,
} = require('../services/tarjador');

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

// Pipeline unificado de anonimizacao de PDF — usa tarjador.js com
// regex obrigatorio como fallback para CPFs e filtro sede/residencial.
async function anonimizarPDF(pdfBuffer) {
  const itens = await extrairItens(pdfBuffer);
  const linhas = agruparLinhas(itens);

  // DEBUG: mostrar como o pdfjs-dist extraiu o texto em producao
  const CPF_RE = /\d{3}\.?\d{3}\.?\d{3}\s*[-–—]?\s*\d{2}/g;
  const itensComCPF = itens.filter(it => CPF_RE.test(it.texto));
  console.log('[anonimizarPDF] itens extraidos:', itens.length, '| linhas:', linhas.length);
  console.log('[anonimizarPDF] itens com possivel CPF (regex tolerante):', itensComCPF.length);
  itensComCPF.forEach(it => console.log(`  item[${it.indice}] "${it.texto}"`));
  // Tambem scan em linhas reconstruidas (pega CPFs split entre itens)
  const linhasComCPF = linhas.filter(l => CPF_RE.test(l.texto));
  console.log('[anonimizarPDF] linhas com possivel CPF:', linhasComCPF.length);
  linhasComCPF.forEach(l => console.log(`  linha "${l.texto.slice(0, 200)}"`));

  const itensParaIA = buildPromptItens(itens, linhas);
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `${PROMPT_INSTRUCOES}\n\nItens (JSON):\n${JSON.stringify(itensParaIA)}`
    }]
  });

  let respostaIA = { tarjas: [] };
  try {
    respostaIA = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
  } catch (e) {
    console.log('[anonimizarPDF] falha ao parsear resposta da IA:', e.message);
  }
  console.log('[anonimizarPDF] tarjas da IA:', (respostaIA.tarjas || []).length);

  const tarjas = construirTarjas(itens, linhas, respostaIA);
  const porOrigem = {};
  tarjas.forEach(t => { porOrigem[t.origem] = (porOrigem[t.origem] || 0) + 1; });
  console.log('[anonimizarPDF] tarjas finais:', tarjas.length, 'origem:', porOrigem);

  const stats = { nome: 0, cpf: 0, rg: 0, endereco: 0, email: 0, telefone: 0, data_nasc: 0, banco: 0 };
  for (const t of tarjas) {
    const it = itens[t.i];
    if (!it) continue;
    const trecho = it.texto.slice(t.start, t.end);
    if (/\d{3}\.?\d{3}\.?\d{3}\s*[-–—]\s*\d{2}/.test(trecho)) stats.cpf++;
    else if (/@/.test(trecho)) stats.email++;
    else if (/\d/.test(trecho)) stats.endereco++;
  }

  const pdfFinal = await aplicarTarjas(pdfBuffer, itens, tarjas);
  return { pdfBuffer: pdfFinal, stats, tipoDocumento: 'contrato' };
}

router.post('/anonymize', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
    if (req.file && req.file.mimetype === 'application/pdf') {
      const { pdfBuffer, stats, tipoDocumento } = await anonimizarPDF(req.file.buffer);
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

router.post('/download-pdf', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ erro: 'Envie um PDF no campo "arquivo"' });
    }
    const { pdfBuffer } = await anonimizarPDF(req.file.buffer);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar PDF' });
  }
});

module.exports = router;