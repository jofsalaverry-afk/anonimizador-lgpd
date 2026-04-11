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
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const doc = await loadingTask.promise;
  const resultado = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      resultado.push({
        str: item.str,
        x: item.transform[4],
        y: viewport.height - item.transform[5] - (item.height || 10),
        width: item.width,
        height: item.height || 10,
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
          text: `Analise este documento e liste os dados que devem ser anonimizados conforme LGPD e LAI.

DEVE anonimizar: CPF (formato XXX.XXX.XXX-XX), RG, enderecos residenciais de pessoas fisicas, nomes de pessoas fisicas privadas (representantes de empresas, fornecedores), emails e telefones pessoais.

NAO deve anonimizar: nomes de agentes publicos em exercicio (prefeito, vereador, presidente de camara, servidor em portaria), nomes de empresas, CNPJs, enderecos de sede de empresas, valores, datas de assinatura.

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
    const dadoNorm = dado.trim().toLowerCase();
    if (!dadoNorm) continue;

    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const itemNorm = item.str.trim().toLowerCase();
      if (!itemNorm) continue;

      // Tenta match direto
      if (itemNorm === dadoNorm || itemNorm.includes(dadoNorm)) {
        const page = pages[item.pagina - 1];
        if (!page) continue;
        const { height } = page.getSize();
        page.drawRectangle({
          x: Math.max(0, item.x - 1),
          y: Math.max(0, height - item.y - item.height - 2),
          width: Math.max(item.width + 2, 30),
          height: item.height + 4,
          color: rgb(0, 0, 0)
        });
        continue;
      }

      // Tenta match acumulando itens consecutivos da mesma pagina
      let acum = '';
      let xInicio = null;
      let yPos = null;
      let largura = 0;
      let alturaMax = 0;
      const paginaBase = item.pagina;

      for (let j = i; j < Math.min(i + 15, itens.length); j++) {
        if (itens[j].pagina !== paginaBase) break;
        const t = itens[j].str.trim();
        if (!t) continue;
        if (xInicio === null) {
          xInicio = itens[j].x;
          yPos = itens[j].y;
        }
        acum += (acum ? ' ' : '') + t;
        largura = itens[j].x + itens[j].width - xInicio;
        alturaMax = Math.max(alturaMax, itens[j].height || 10);

        if (acum.toLowerCase().includes(dadoNorm) && dadoNorm.length > 4) {
          const page = pages[paginaBase - 1];
          if (!page) break;
          const { height } = page.getSize();
          page.drawRectangle({
            x: Math.max(0, xInicio - 1),
            y: Math.max(0, height - yPos - alturaMax - 2),
            width: Math.max(largura + 2, 30),
            height: alturaMax + 4,
            color: rgb(0, 0, 0)
          });
          break;
        }
      }
    }
  }

  const stats = { nome: 0, cpf: 0, rg: 0, endereco: 0, email: 0, telefone: 0, data_nasc: 0, banco: 0 };
  dados.forEach(d => {
    if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(d)) stats.cpf++;
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

router.post('/download-pdf', authMiddleware, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ erro: 'Envie um PDF no campo "arquivo"' });
    }
    const pdfBufferOriginal = req.file.buffer;

    const pdfjsLib = require('pdfjs-dist');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBufferOriginal) });
    const pdfjsDoc = await loadingTask.promise;

    const itens = [];
    for (let p = 1; p <= pdfjsDoc.numPages; p++) {
      const page = await pdfjsDoc.getPage(p);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const itemHeight = item.height || 10;
        itens.push({
          indice: itens.length,
          texto: item.str,
          x: item.transform[4],
          baseline: item.transform[5],
          width: item.width,
          height: itemHeight,
          pageIndex: p - 1
        });
      }
    }

    const itensParaIA = itens.map(i => ({ i: i.indice, t: i.texto }));
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Voce recebe itens de texto extraidos de um PDF de documento publico brasileiro. Identifique dados pessoais de PESSOA FISICA PRIVADA que DEVEM ser anonimizados conforme LGPD e LAI, retornando o TRECHO EXATO (substring) de cada item que deve ser coberto por tarja.

DEVE TARJAR (dados de pessoa fisica privada):
- CPF no formato XXX.XXX.XXX-XX (11 digitos com pontos e hifen)
- RG (qualquer formato)
- Nomes completos de pessoas fisicas privadas: representantes legais, socios, contratados, fornecedores pessoa fisica, testemunhas, beneficiarios
- Emails pessoais (gmail, hotmail, yahoo, outlook, etc.)
- Telefones/celulares pessoais
- Enderecos RESIDENCIAIS: identificados por "residente em/na", "domiciliado em/na", "morador de", "residencia"
- CEP residencial

NAO TARJAR (mesmo se parecerem dados pessoais):
- CNPJ (formato XX.XXX.XXX/XXXX-XX)
- Nomes de empresas (contem LTDA, S.A., S/A, EIRELI, ME, EPP, MEI, ou "Empresa", "Comercial", "Servicos")
- Nomes de agentes publicos em exercicio (prefeito, vereador, presidente de camara, secretario, servidor publico citado em portaria ou no documento oficial)
- Enderecos de SEDE de empresa: identificados por "com sede em/na", "sediada em/na", "estabelecida em/na", "localizada em/na", "endereco comercial"
- Valores monetarios, datas, numeros de contrato/processo/portaria
- Rotulos/labels como "CPF:", "RG:", "Email:", "Telefone:", "Endereco:"

REGRAS CRITICAS:
1. Se um endereco aparece junto de um CNPJ ou razao social de empresa, ele e sede comercial — NAO TARJAR.
2. Se um endereco aparece junto de um CPF ou nome de pessoa fisica com "residente", "domiciliado" — TARJAR.
3. Para CPFs: SEMPRE tarjar qualquer sequencia no padrao XXX.XXX.XXX-XX, mesmo no meio de texto corrido.
4. "d" deve ser substring EXATA de "t" (mesma capitalizacao, pontuacao, espacos).
5. Um mesmo item pode gerar varias tarjas com o mesmo "i".
6. Nao inclua rotulos (ex: "CPF:") na tarja — so o valor.

Itens (JSON): ${JSON.stringify(itensParaIA)}

Retorne SOMENTE este JSON, sem comentarios:
{"tarjas": [{"i": 0, "d": "trecho exato"}]}`
      }]
    });

    let tarjas = [];
    try {
      const parsed = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
      tarjas = Array.isArray(parsed.tarjas) ? parsed.tarjas : [];
    } catch(e) {
      tarjas = [];
    }

    const cpfRegex = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;
    const jaTemTarja = (i, d) => tarjas.some(t => t.i === i && t.d === d);
    for (const item of itens) {
      const re = new RegExp(cpfRegex.source, 'g');
      let m;
      while ((m = re.exec(item.texto)) !== null) {
        if (!jaTemTarja(item.indice, m[0])) tarjas.push({ i: item.indice, d: m[0] });
      }
    }

    const pdfDoc = await PDFDocument.load(pdfBufferOriginal);
    const pages = pdfDoc.getPages();
    const padding = 1;

    for (const t of tarjas) {
      const item = itens[t.i];
      if (!item || !t.d) continue;
      const page = pages[item.pageIndex];
      if (!page) continue;

      const texto = item.texto;
      const alvo = t.d;
      if (!texto.length) continue;
      const charWidth = item.width / texto.length;
      const descenderPad = Math.max(2, item.height * 0.25);

      let from = 0;
      while (true) {
        const pos = texto.indexOf(alvo, from);
        if (pos === -1) break;
        const xSub = item.x + pos * charWidth;
        const wSub = alvo.length * charWidth;
        page.drawRectangle({
          x: xSub - padding,
          y: item.baseline - descenderPad,
          width: wSub + padding * 2,
          height: item.height + descenderPad + padding,
          color: rgb(0, 0, 0)
        });
        from = pos + alvo.length;
      }
    }

    const pdfFinal = Buffer.from(await pdfDoc.save());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
    res.send(pdfFinal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar PDF' });
  }
});

module.exports = router;