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
const { extrairTextoOCR } = require('../services/ocr');

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

// Limiar minimo de caracteres extraidos para considerar o PDF como "com texto".
// Abaixo disso, trata como PDF escaneado e aciona OCR.
const LIMIAR_TEXTO_MIN = 50;

// Pipeline unificado de anonimizacao de PDF — usa tarjador.js com
// regex obrigatorio como fallback para CPFs e filtro sede/residencial.
// Retorna { pdfBuffer, stats, tipoDocumento, ocrUsado }
async function anonimizarPDF(pdfBuffer) {
  const itens = await extrairItens(pdfBuffer);
  const linhas = agruparLinhas(itens);
  const textoExtraido = linhas.map(l => l.texto).join(' ').trim();

  console.log('[anonimizarPDF] itens extraidos:', itens.length, '| linhas:', linhas.length, '| chars:', textoExtraido.length);

  // Se texto extraido e muito curto, provavelmente e PDF escaneado — usar OCR
  if (textoExtraido.length < LIMIAR_TEXTO_MIN) {
    console.log('[anonimizarPDF] texto insuficiente (<', LIMIAR_TEXTO_MIN, 'chars), tentando OCR...');
    try {
      const { texto: textoOCR } = await extrairTextoOCR(pdfBuffer);
      if (!textoOCR || textoOCR.trim().length < 10) {
        return { ocrUsado: true, textoVazio: true };
      }
      console.log('[anonimizarPDF] OCR extraiu', textoOCR.length, 'caracteres');
      // Retorna texto OCR para ser anonimizado pela pipeline de texto
      return { ocrUsado: true, textoOCR: textoOCR.trim() };
    } catch (err) {
      console.error('[anonimizarPDF] erro no OCR:', err.message);
      return { ocrUsado: true, textoVazio: true };
    }
  }

  // PDF com texto normal — pipeline de tarjas
  const CPF_RE = /\d{3}\.?\d{3}\.?\d{3}\s*[-–—]?\s*\d{2}/g;
  const itensComCPF = itens.filter(it => CPF_RE.test(it.texto));
  console.log('[anonimizarPDF] itens com possivel CPF (regex tolerante):', itensComCPF.length);

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
  return { pdfBuffer: pdfFinal, stats, tipoDocumento: 'contrato', ocrUsado: false };
}

// Lista documentos processados pela camara autenticada (filtro multi-tenant
// pelo req.camara.id). Suporta paginacao via ?limit (default 50, max 200)
// e ?offset (default 0). Retorna metadados, nao o PDF em si.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const [items, total] = await Promise.all([
      prisma.documento.findMany({
        where: { camaraId: req.camara.id },
        orderBy: { criadoEm: 'desc' },
        select: { id: true, tipoDocumento: true, qtdDadosMascarados: true, dadosJson: true, criadoEm: true },
        take: limit,
        skip: offset
      }),
      prisma.documento.count({ where: { camaraId: req.camara.id } })
    ]);
    res.json({ total, limit, offset, items });
  } catch (err) {
    console.error('[GET /documents]', err);
    res.status(500).json({ erro: 'Erro ao listar documentos' });
  }
});

router.post('/anonymize', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
    if (req.file && req.file.mimetype === 'application/pdf') {
      const resultado = await anonimizarPDF(req.file.buffer);

      // PDF escaneado — OCR nao conseguiu extrair texto
      if (resultado.textoVazio) {
        return res.status(422).json({
          erro: 'Nao foi possivel ler o documento. Verifique se o arquivo esta legivel e tente novamente.',
          ocrUsado: true
        });
      }

      // PDF escaneado — OCR extraiu texto, anonimizar via pipeline de texto
      if (resultado.textoOCR) {
        // Reutiliza a pipeline de texto (igual a DOCX/texto puro) com o conteudo OCR
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
${resultado.textoOCR}`;

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

        return res.json({
          textoAnonimizado, stats, tipoDocumento,
          leisAplicaveis: baseJuridica[tipoDocumento] || baseJuridica.outro,
          ocrUsado: true
        });
      }

      // PDF normal com texto — retorna PDF com tarjas
      await prisma.documento.create({
        data: { camaraId: req.camara.id, tipoDocumento: resultado.tipoDocumento, qtdDadosMascarados: Object.values(resultado.stats).reduce((a,b)=>a+b,0), dadosJson: resultado.stats }
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
      return res.send(resultado.pdfBuffer);
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