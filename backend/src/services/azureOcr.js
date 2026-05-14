// Servico de OCR via Azure AI Document Intelligence (modelo
// prebuilt-read). Usado como fallback quando pdfjs-dist extrai
// texto insuficiente do PDF. Configuracao por env:
//   AZURE_DOCINTEL_ENDPOINT
//   AZURE_DOCINTEL_KEY
//   AZURE_DOCINTEL_ENABLED === 'true' (feature flag; default OFF)
//
// Retorna array de itens no MESMO shape de extrairItens do
// tarjador.js (indice, texto, x, baseline, width, height,
// pageIndex) acrescido de origem: 'azure-ocr'. Em qualquer
// falha (rede, 401/403, timeout, vazio), retorna null e o
// chamador (anonimizarPDF em documents.js) decide o fallback
// para PdfSemTextoError. Nao lanca excecoes.

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;
const SUBMIT_API_VERSION = '2024-11-30';
const CONFIDENCE_MIN = 0.3;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Converte uma word do Azure (polygon em inches, origem top-left)
// para o item do tarjador (PDF points, origem bottom-left).
// Assume polygon retangular eixo-alinhado (TL -> TR -> BR -> BL).
// Polygons trapezoidais (scan torto) sao aproximados pela bbox
// eixo-alinhada que os envolve — divida tecnica conhecida,
// suficiente para 95% dos scans de cliente real.
function wordParaItem(word, pageHeightInch, pageNumber, indice) {
  const p = word.polygon;
  const xMin = Math.min(p[0], p[2], p[4], p[6]);
  const yMin = Math.min(p[1], p[3], p[5], p[7]);
  const xMax = Math.max(p[0], p[2], p[4], p[6]);
  const yMax = Math.max(p[1], p[3], p[5], p[7]);
  return {
    indice,
    texto: word.content,
    x: xMin * 72,
    baseline: (pageHeightInch - yMax) * 72,
    width: (xMax - xMin) * 72,
    height: (yMax - yMin) * 72,
    pageIndex: pageNumber - 1,
    origem: 'azure-ocr'
  };
}

async function extrairItensViaAzureOcr(pdfBuffer) {
  // Validacao de config ANTES de qualquer HTTP. Lista exatamente quais
  // env vars faltam — facilita debug (sem isso, key vazia cai em 401 e
  // o log generico nao diz se foi key errada ou key ausente).
  const endpoint = (process.env.AZURE_DOCINTEL_ENDPOINT || '').replace(/\/$/, '');
  const key = process.env.AZURE_DOCINTEL_KEY;
  const ausentes = [];
  if (!endpoint) ausentes.push('AZURE_DOCINTEL_ENDPOINT');
  if (!key) ausentes.push('AZURE_DOCINTEL_KEY');
  if (ausentes.length) {
    console.error(`[azure-ocr] config ausente: ${ausentes.join(', ')}`);
    return null;
  }

  const t0 = Date.now();
  console.log(`[azure-ocr] tentando OCR: bytes=${pdfBuffer.length} pages=?`);

  // 1) Submit
  const submitUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${SUBMIT_API_VERSION}`;
  let submitRes;
  try {
    submitRes = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/pdf'
      },
      body: pdfBuffer
    });
  } catch (e) {
    console.error(`[azure-ocr] falhou: erro="rede no submit: ${e && e.message}" tempo_ms=${Date.now() - t0}`);
    return null;
  }

  if (submitRes.status === 401) {
    console.error(`[azure-ocr] falhou: erro="401 Unauthorized — KEY invalida ou expirada" tempo_ms=${Date.now() - t0}`);
    return null;
  }
  if (submitRes.status === 403) {
    console.error(`[azure-ocr] falhou: erro="403 Forbidden — sem permissao no recurso" tempo_ms=${Date.now() - t0}`);
    return null;
  }
  if (submitRes.status !== 202) {
    const body = await submitRes.text().catch(() => '');
    console.error(`[azure-ocr] falhou: erro="submit status=${submitRes.status} body=${(body || '').slice(0, 200)}" tempo_ms=${Date.now() - t0}`);
    return null;
  }

  const opLocation = submitRes.headers.get('operation-location');
  if (!opLocation) {
    console.error(`[azure-ocr] falhou: erro="resposta 202 sem header Operation-Location" tempo_ms=${Date.now() - t0}`);
    return null;
  }

  // 2) Polling com deadline absoluto de 60s
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let result = null;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let pollRes;
    try {
      pollRes = await fetch(opLocation, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    } catch (e) {
      continue;
    }
    if (!pollRes.ok) continue;
    let body;
    try {
      body = await pollRes.json();
    } catch (e) {
      continue;
    }
    if (body.status === 'succeeded') { result = body; break; }
    if (body.status === 'failed') {
      console.error(`[azure-ocr] falhou: erro="status=failed err=${JSON.stringify(body.error || {})}" tempo_ms=${Date.now() - t0}`);
      return null;
    }
    // status === 'notStarted' | 'running' — continua o loop
  }
  if (!result) {
    console.error(`[azure-ocr] falhou: erro="polling timeout ${POLL_TIMEOUT_MS}ms" tempo_ms=${Date.now() - t0}`);
    return null;
  }

  // 3) Parse + conversao de coords + filtro de confidence
  const pages = (result.analyzeResult && result.analyzeResult.pages) || [];
  const itens = [];
  let descartadasPorConfidence = 0;
  for (const page of pages) {
    const pageHeightInch = page.height;
    const words = page.words || [];
    for (const w of words) {
      if (typeof w.confidence === 'number' && w.confidence < CONFIDENCE_MIN) {
        descartadasPorConfidence++;
        continue;
      }
      itens.push(wordParaItem(w, pageHeightInch, page.pageNumber, itens.length));
    }
  }

  const tempoMs = Date.now() - t0;
  console.log(`[azure-ocr] sucesso: pages=${pages.length} words=${itens.length} tempo_ms=${tempoMs}`);
  if (descartadasPorConfidence > 0) {
    console.log(`[azure-ocr] words descartadas por confidence < ${CONFIDENCE_MIN}: ${descartadasPorConfidence}`);
  }
  return itens;
}

module.exports = { extrairItensViaAzureOcr };
