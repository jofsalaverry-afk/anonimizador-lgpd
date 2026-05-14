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
  gerarRelatorio,
  PROMPT_INSTRUCOES,
} = require('../services/tarjador');
const { extrairItensViaAzureOcr } = require('../services/azureOcr');
const { body } = require('express-validator');
const { validar, sanitizarTexto, validarEnum } = require('../middlewares/seguranca');

const router = express.Router();
const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// PDF sem texto extraivel (provavelmente digitalizado). Bloqueia o fluxo;
// o handler mapeia para HTTP 422 com mensagem orientando o usuario a
// procurar o suporte (atendimento manual via Infolock).
class PdfSemTextoError extends Error {
  constructor(detalhes) {
    super('PDF sem texto extraivel');
    this.name = 'PdfSemTextoError';
    this.detalhes = detalhes || {};
  }
}

// Saldo de credito da Anthropic esgotado. Diferente de outras falhas da
// IA (rate-limit, 5xx, rede) que caem em "modo basico", esse caso e
// critico — devolvemos 503 e logamos em [CRITICAL] para alerta.
class AnthropicBillingError extends Error {
  constructor(requestId) {
    super('Anthropic billing exhausted');
    this.name = 'AnthropicBillingError';
    this.requestId = requestId || null;
  }
}

// Inspeciona um erro vindo do SDK da Anthropic e, se for billing
// esgotado (status 400 + mensagem "credit balance is too low"), loga
// como [CRITICAL] e lanca AnthropicBillingError. Caso contrario,
// retorna sem efeito e o chamador segue com o tratamento generico.
function checkAnthropicBilling(err) {
  if (err && err.status === 400 && /credit balance is too low/i.test(err.message || '')) {
    console.error('[CRITICAL] Anthropic billing exhausted', { request_id: err.request_id || null });
    throw new AnthropicBillingError(err.request_id);
  }
}

// Mapeia erros tipados (PdfSemTextoError, AnthropicBillingError) para
// respostas HTTP padronizadas em todos os endpoints que chamam
// anonimizarPDF (/anonymize e /download-pdf). Retorna true se enviou
// resposta (caller deve dar return); false se nao reconheceu o erro
// (caller cai no tratamento generico de 500).
function mapearErroAnonimizacao(req, res, err) {
  if (err instanceof PdfSemTextoError) {
    console.log('[anonimizarPDF] PDF digitalizado bloqueado', {
      user_id: req.usuario && req.usuario.id,
      org_id: req.usuario && req.usuario.organizacaoId,
      filename: req.file && req.file.originalname,
      file_size: req.file && req.file.size,
      chars_extracted: err.detalhes.chars_extracted
    });
    res.status(422).json({
      error: 'pdf_sem_texto_extraivel',
      message: 'Este PDF parece estar digitalizado e não contém texto editável extraível. O Anonimizador processa apenas documentos nativos. Para documentos digitalizados, entre em contato com o suporte.',
      suporte: 'contato@infolock.com.br'
    });
    return true;
  }
  if (err instanceof AnthropicBillingError) {
    const body = {
      error: 'service_unavailable',
      message: 'Serviço temporariamente indisponível. Suporte foi notificado.'
    };
    // Inclui request_id apenas se a Anthropic devolveu um — facilita o
    // suporte abrir ticket com a Anthropic citando o ID. Sem null nem "".
    if (err.requestId) body.request_id = err.requestId;
    res.status(503).json(body);
    return true;
  }
  return false;
}

// Prompt de anonimizacao de texto (DOCX, texto puro, OCR) com marco LAI/LGPD
function buildPromptTexto(texto, mascara) {
  const mascaraDesc = { asterisk: 'XXXXX', tarjeta: '||||', etiqueta: 'a etiqueta correspondente entre colchetes como [CPF], [NOME], [RG]' };
  return `Voce e um sistema de anonimizacao de documentos publicos de camaras municipais brasileiras. Aplique o marco juridico LAI (Lei 12.527/2011) + LGPD (Lei 13.709/2018).

REGRA DE OURO: Transparencia e a regra (LAI), sigilo e a excecao (LGPD so para dados pessoais).

=== SUBSTITUIR pela mascara ${mascaraDesc[mascara]} ===
- CPF (XXX.XXX.XXX-XX) — SEMPRE, de qualquer pessoa, inclusive agente publico ou servidor
- RG (com ou sem orgao emissor)
- Endereco RESIDENCIAL ("residente em", "domiciliado em", "morador") — logradouro, numero, complemento, bairro, CEP
- Email PESSOAL (@gmail, @hotmail, @yahoo, @outlook, etc.)
- Telefone/celular pessoal
- Dados bancarios pessoais (agencia, conta)
- Nome de pessoa fisica SEM cargo publico ou funcao identificavel no contexto do documento

=== PRESERVAR (NAO substituir) ===
- Nome de agente publico COM cargo: Presidente, Vereador, Prefeito, Secretario, Diretor, Servidor, Fiscal, Gestor, Procurador, Assessor, Coordenador, Tesoureiro, Contador, Pregoeiro, etc.
- Nome de representante legal de empresa em contrato publico (socio, diretor, representante legal)
- Nome de signatario ou testemunha de ato administrativo
- CNPJ, razao social de empresa
- Endereco de SEDE de empresa ou orgao publico ("com sede em", "sediada em")
- Email INSTITUCIONAL (@camara.gov.br, @prefeitura.gov.br, @jus.br)
- Cargo, funcao, matricula funcional
- Valores, datas, prazos, numeros de contrato/processo/portaria
- Clausulas, objeto, texto descritivo

=== COMO DECIDIR NOMES ===
- Se o nome aparece junto a um cargo publico ou funcao → PRESERVAR (dado publico pela LAI)
- Se o nome aparece como parte civil sem cargo, sem funcao, sem vinculo → SUBSTITUIR (dado pessoal pela LGPD)
- Na duvida → PRESERVAR (LAI prioriza transparencia)

Retorne SOMENTE o texto com as substituicoes feitas, sem comentarios.
Depois adicione exatamente: ---STATS---
Depois um JSON com contagem de cada tipo substituido: {"nome":0,"cpf":0,"rg":0,"endereco":0,"email":0,"telefone":0,"data_nasc":0,"banco":0}
Depois adicione exatamente: ---TIPO---
Depois o tipo: contrato, ata, processo, convenio, folha, saude, ou outro

DOCUMENTO:
${texto}`;
}

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
};

// Middleware que verifica se o modulo esta ativo para a organizacao do usuario.
// Uso: router.post('/rota', authMiddleware, requireModulo('anonimizador'), ...)
function requireModulo(modulo) {
  return async (req, res, next) => {
    try {
      const org = await prisma.organizacao.findUnique({
        where: { id: req.usuario.organizacaoId },
        select: { modulosAtivos: true }
      });
      if (!org || !org.modulosAtivos.includes(modulo)) {
        return res.status(403).json({ erro: `Módulo "${modulo}" não está ativo para sua organização.` });
      }
      next();
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao verificar módulos' });
    }
  };
}

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
// Abaixo disso, tratamos como PDF digitalizado e bloqueamos (PdfSemTextoError).
// OCR foi removido — casos digitalizados sao atendidos manualmente via suporte.
const LIMIAR_TEXTO_MIN = 50;

// Classificacoes aceitas no aprendizado (alinhadas com LABELS_CATEGORIA
// do tarjador + "nao_pessoal" para marcar falsos positivos).
const CLASSIFICACOES_VALIDAS = ['cpf', 'rg', 'email', 'telefone', 'endereco', 'nome', 'nao_pessoal'];

// Busca todas as correcoes globais de aprendizado e retorna um Map
// normalizado (trecho lowercase -> classificacao). Usado pelo
// gerarRelatorio para sobrescrever a heuristica.
// Defensivo: se o client Prisma nao foi regenerado apos a migration ou
// a tabela nao existe, retorna um Map vazio para nao quebrar a
// anonimizacao inteira — o relatorio simplesmente nao tera aprendizado.
async function carregarAprendizado() {
  try {
    if (!prisma.dsarAprendizado) return new Map();
    const rows = await prisma.dsarAprendizado.findMany({
      select: { trechoNormalizado: true, classificacaoCorreta: true }
    });
    const map = new Map();
    for (const r of rows) map.set(r.trechoNormalizado, r.classificacaoCorreta);
    return map;
  } catch (err) {
    console.error('[carregarAprendizado] fallback para Map vazio:', err.message);
    return new Map();
  }
}

// Pipeline unificado de anonimizacao de PDF — usa tarjador.js com
// regex obrigatorio como fallback para CPFs e filtro sede/residencial.
// Retorna { pdfBuffer, stats, relatorio, tipoDocumento, modoBasico }.
// Se o PDF nao tiver texto extraivel suficiente, lanca PdfSemTextoError.
async function anonimizarPDF(pdfBuffer) {
  let itens = await extrairItens(pdfBuffer);
  let linhas = agruparLinhas(itens);
  let textoExtraido = linhas.map(l => l.texto).join(' ').trim();

  console.log('[anonimizarPDF] itens extraidos:', itens.length, '| linhas:', linhas.length, '| chars:', textoExtraido.length);

  // Texto extraido pelo pdfjs muito curto — provavelmente PDF digitalizado.
  // Antes de bloquear (PdfSemTextoError -> HTTP 422), tenta OCR Azure como
  // fallback se a feature estiver ativada via AZURE_DOCINTEL_ENABLED='true'.
  // Se o OCR tambem nao trouxer >= LIMIAR_TEXTO_MIN chars, bloqueia como
  // antes — empurrar lixo de OCR pro detector geraria PDF "anonimizado"
  // com PII intacta, pior que mostrar o modal 422.
  if (textoExtraido.length < LIMIAR_TEXTO_MIN) {
    let recuperado = false;
    if (process.env.AZURE_DOCINTEL_ENABLED === 'true') {
      const ocrItens = await extrairItensViaAzureOcr(pdfBuffer);
      if (ocrItens && ocrItens.length > 0) {
        itens = ocrItens;
        linhas = agruparLinhas(itens);
        textoExtraido = linhas.map(l => l.texto).join(' ').trim();
        console.log('[anonimizarPDF] OCR Azure substituiu itens:', itens.length, '| linhas:', linhas.length, '| chars:', textoExtraido.length);
        if (textoExtraido.length >= LIMIAR_TEXTO_MIN) recuperado = true;
      }
    }
    if (!recuperado) {
      throw new PdfSemTextoError({ chars_extracted: textoExtraido.length });
    }
  }

  // PDF com texto normal — pipeline de tarjas
  const CPF_RE = /\d{3}\.?\d{3}\.?\d{3}\s*[-–—]?\s*\d{2}/g;
  const itensComCPF = itens.filter(it => CPF_RE.test(it.texto));
  console.log('[anonimizarPDF] itens com possivel CPF (regex tolerante):', itensComCPF.length);

  const itensParaIA = buildPromptItens(itens, linhas);
  let respostaIA = { tarjas: [] };
  let iaFalhou = false;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `${PROMPT_INSTRUCOES}\n\nItens (JSON):\n${JSON.stringify(itensParaIA)}`
      }]
    });
    try {
      respostaIA = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
    } catch (e) {
      console.log('[anonimizarPDF] falha ao parsear resposta da IA:', e.message);
    }
  } catch (err) {
    // Billing esgotado tem prioridade sobre o "modo basico": se nao temos
    // credito na Anthropic, devolver um PDF "anonimizado" so com regex
    // basico esconde o problema do operador. Aborta o request com 503.
    checkAnthropicBilling(err);
    // API da Anthropic indisponivel (529, timeout, 5xx, rede). Continua
    // em "modo basico" — so as tarjas de construirTarjas (regex CPF/RG/
    // email/telefone por item e por linha) entram no PDF. Cobertura
    // menor (sem nomes/enderecos via IA) mas documento ainda e entregue.
    console.error('[anonimizarPDF] IA indisponivel, modo basico:', err.status || '', err.message);
    iaFalhou = true;
  }
  console.log('[anonimizarPDF] tarjas da IA:', (respostaIA.tarjas || []).length, 'iaFalhou:', iaFalhou);

  const tarjas = construirTarjas(itens, linhas, respostaIA);
  const porOrigem = {};
  tarjas.forEach(t => { porOrigem[t.origem] = (porOrigem[t.origem] || 0) + 1; });
  console.log('[anonimizarPDF] tarjas finais:', tarjas.length, 'origem:', porOrigem);

  const aprendizado = await carregarAprendizado();
  const relatorio = gerarRelatorio(itens, linhas, tarjas, aprendizado);
  // Stats canonicos baseados no relatorio simplificado. Mantem o schema
  // antigo (nome, cpf, rg, endereco, email, telefone, data_nasc, banco)
  // para o Documento no banco, mapeando telefone e demais categorias.
  const cats = relatorio.resumo.categorias;
  const stats = {
    nome: cats.nome || 0,
    cpf: cats.cpf || 0,
    rg: cats.rg || 0,
    endereco: cats.endereco || 0,
    email: cats.email || 0,
    telefone: cats.telefone || 0,
    data_nasc: 0,
    banco: 0
  };

  const pdfFinal = await aplicarTarjas(pdfBuffer, itens, tarjas);
  return { pdfBuffer: pdfFinal, stats, relatorio, tipoDocumento: 'contrato', modoBasico: iaFalhou };
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
        where: { organizacaoId: req.usuario.organizacaoId },
        orderBy: { criadoEm: 'desc' },
        select: { id: true, tipoDocumento: true, qtdDadosMascarados: true, dadosJson: true, criadoEm: true },
        take: limit,
        skip: offset
      }),
      prisma.documento.count({ where: { organizacaoId: req.usuario.organizacaoId } })
    ]);
    res.json({ total, limit, offset, items });
  } catch (err) {
    console.error('[GET /documents]', err);
    res.status(500).json({ erro: 'Erro ao listar documentos' });
  }
});

// Recebe correcao de classificacao feita no relatorio de devolutiva.
// Global (nao por organizacao) — todas as camaras se beneficiam do
// aprendizado. Body: { trecho, classificacaoCorreta, classificacaoErrada?, contexto? }.
const validadoresAprendizado = [
  sanitizarTexto('trecho', { min: 1, max: 500 }),
  validarEnum('classificacaoCorreta', CLASSIFICACOES_VALIDAS),
  body('classificacaoErrada').optional({ checkFalsy: true }).isString().isLength({ max: 100 }),
  body('contexto').optional({ checkFalsy: true }).isString().isLength({ max: 500 }),
  validar
];

router.post('/aprendizado', authMiddleware, requireModulo('anonimizador'), validadoresAprendizado, async (req, res) => {
  try {
    const { trecho, classificacaoCorreta, classificacaoErrada, contexto } = req.body || {};
    if (typeof trecho !== 'string' || !trecho.trim()) {
      return res.status(400).json({ erro: 'Campo "trecho" é obrigatório' });
    }
    if (!CLASSIFICACOES_VALIDAS.includes(classificacaoCorreta)) {
      return res.status(400).json({ erro: `classificacaoCorreta deve ser uma de: ${CLASSIFICACOES_VALIDAS.join(', ')}` });
    }
    const trechoLimpo = trecho.trim();
    const normalizado = trechoLimpo.toLowerCase();
    const row = await prisma.dsarAprendizado.create({
      data: {
        trecho: trechoLimpo,
        trechoNormalizado: normalizado,
        classificacaoCorreta,
        classificacaoErrada: typeof classificacaoErrada === 'string' ? classificacaoErrada : null,
        contexto: typeof contexto === 'string' ? contexto.slice(0, 500) : null
      }
    });
    res.json({ id: row.id });
  } catch (err) {
    console.error('[POST /documents/aprendizado]', err);
    res.status(500).json({ erro: 'Erro ao salvar aprendizado' });
  }
});

router.post('/anonymize', authMiddleware, requireModulo('anonimizador'), upload.single('arquivo'), async (req, res) => {
  try {
    if (req.file && req.file.mimetype === 'application/pdf') {
      const resultado = await anonimizarPDF(req.file.buffer);

      // PDF nativo com texto — retorna JSON com PDF em base64 + relatorio
      // simplificado para exibir ao usuario. O frontend decodifica o base64
      // para disparar o download e renderiza o relatorio na tela.
      await prisma.documento.create({
        data: { organizacaoId: req.usuario.organizacaoId, tipoDocumento: resultado.tipoDocumento, qtdDadosMascarados: Object.values(resultado.stats).reduce((a,b)=>a+b,0), dadosJson: resultado.stats }
      });
      return res.json({
        pdfBase64: resultado.pdfBuffer.toString('base64'),
        relatorio: resultado.relatorio,
        stats: resultado.stats,
        tipoDocumento: resultado.tipoDocumento,
        leisAplicaveis: baseJuridica[resultado.tipoDocumento] || baseJuridica.outro,
        modoBasico: resultado.modoBasico || false,
        avisoIA: resultado.modoBasico ? 'Processado em modo básico (IA indisponível). Apenas CPF, RG, email e telefone detectados por regex foram tarjados.' : undefined
      });
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
    const prompt = buildPromptTexto(texto, mascara);

    let message;
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      });
    } catch (err) {
      checkAnthropicBilling(err);
      throw err;
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
      data: { organizacaoId: req.usuario.organizacaoId, tipoDocumento, qtdDadosMascarados: qtdTotal, dadosJson: stats }
    });

    res.json({ textoAnonimizado, stats, tipoDocumento, leisAplicaveis: baseJuridica[tipoDocumento] || baseJuridica.outro });
  } catch (err) {
    if (mapearErroAnonimizacao(req, res, err)) return;
    // Log completo para debug no Railway + retorna detalhes ao frontend
    // para ficar visivel no DevTools (temporario — remover depois de debug).
    console.error('[POST /documents/anonymize] erro:', err);
    console.error('[POST /documents/anonymize] stack:', err && err.stack);
    res.status(500).json({
      erro: 'Erro ao processar documento',
      mensagem: err && err.message,
      stack: err && err.stack,
      nome: err && err.name,
      codigo: err && err.code
    });
  }
});

router.post('/download-pdf', authMiddleware, requireModulo('anonimizador'), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ erro: 'Envie um PDF no campo "arquivo"' });
    }
    const { pdfBuffer } = await anonimizarPDF(req.file.buffer);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=documento-anonimizado.pdf');
    res.send(pdfBuffer);
  } catch (err) {
    if (mapearErroAnonimizacao(req, res, err)) return;
    console.error('[POST /documents/download-pdf] erro:', err);
    res.status(500).json({ erro: 'Erro ao gerar PDF' });
  }
});

module.exports = router;