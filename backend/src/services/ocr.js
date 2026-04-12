const { createCanvas } = require('canvas');
const { createWorker } = require('tesseract.js');

// Renderiza uma pagina do PDF em um canvas usando pdfjs-dist e retorna PNG buffer
async function renderizarPagina(pdfDoc, pageNum, scale = 2.0) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  // pdfjs-dist espera um CanvasRenderingContext2D compativel
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/png');
}

// Extrai texto de um PDF escaneado via OCR (tesseract.js com portugues)
// Retorna { texto, paginas } onde paginas e o numero de paginas processadas
async function extrairTextoOCR(pdfBuffer) {
  const pdfjsLib = require('pdfjs-dist');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const worker = await createWorker('por');
  const textos = [];

  for (let p = 1; p <= numPages; p++) {
    try {
      const pngBuffer = await renderizarPagina(pdfDoc, p);
      const { data: { text } } = await worker.recognize(pngBuffer);
      if (text && text.trim()) {
        textos.push(text.trim());
      }
      console.log(`[OCR] pagina ${p}/${numPages}: ${text ? text.trim().length : 0} caracteres`);
    } catch (err) {
      console.error(`[OCR] erro na pagina ${p}:`, err.message);
    }
  }

  await worker.terminate();
  return { texto: textos.join('\n\n'), paginas: numPages };
}

module.exports = { extrairTextoOCR };
