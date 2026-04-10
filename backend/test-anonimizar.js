require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { PDFDocument, rgb } = require('pdf-lib');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const inputPath = path.join(__dirname, 'teste.pdf');
  const outputPath = path.join(__dirname, 'teste-anonimizado.pdf');
  const pdfBufferOriginal = fs.readFileSync(inputPath);
  console.log('PDF lido:', pdfBufferOriginal.length, 'bytes');

  const pdfjsLib = require('pdfjs-dist');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBufferOriginal) });
  const pdfjsDoc = await loadingTask.promise;

  const itens = [];
  for (let p = 1; p <= pdfjsDoc.numPages; p++) {
    const page = await pdfjsDoc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const itemHeight = item.height || 10;
      itens.push({
        indice: itens.length,
        texto: item.str,
        x: item.transform[4],
        y: viewport.height - item.transform[5] - itemHeight,
        width: item.width,
        height: itemHeight,
        pageIndex: p - 1
      });
    }
  }
  console.log('Itens extraidos:', itens.length, 'em', pdfjsDoc.numPages, 'paginas');
  console.log('Conteudo dos itens:');
  itens.forEach(i => console.log(`  [${i.indice}] "${i.texto}"`));

  const itensParaIA = itens.map(i => ({ i: i.indice, t: i.texto }));
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Voce recebe itens de texto extraidos de um PDF. Identifique dados pessoais que DEVEM ser anonimizados conforme LGPD e LAI, retornando o TRECHO EXATO (substring) de cada item que deve ser coberto por tarja — nao a linha inteira.

DEVE tarjar: CPF, RG, nomes de pessoas fisicas privadas (representantes, fornecedores, contratados, testemunhas), emails pessoais, telefones pessoais, enderecos residenciais, CEP residencial.

NAO tarjar: CNPJ, nomes de empresas, nomes de agentes publicos em exercicio (prefeito, vereador, presidente de camara, servidor publico em portaria), enderecos de sede de empresas, valores, datas, numeros de contrato, rotulos como "CPF:", "RG:", "Email:".

Regras do trecho:
- "d" deve ser uma substring EXATA de "t" (mesma capitalizacao, pontuacao, espacos).
- Se o mesmo item tiver varios dados, gere multiplas entradas com o mesmo "i".
- Nao inclua rotulos como "CPF " ou "Email: " — apenas o valor sensivel.

Itens (JSON): ${JSON.stringify(itensParaIA)}

Retorne SOMENTE este JSON, sem comentarios:
{"tarjas": [{"i": 0, "d": "trecho exato"}]}`
    }]
  });

  console.log('Resposta IA:', message.content[0].text.slice(0, 1000));
  let tarjas = [];
  try {
    const parsed = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
    tarjas = Array.isArray(parsed.tarjas) ? parsed.tarjas : [];
  } catch(e) {
    console.error('Erro parsing:', e.message);
  }
  console.log('Tarjas cirurgicas:', tarjas.length);
  tarjas.forEach(t => {
    const it = itens[t.i];
    const found = it ? it.texto.includes(t.d) : false;
    console.log(`  [${t.i}] "${t.d}" ${found ? 'OK' : '(NAO ENCONTRADO)'}`);
  });

  const pdfDoc = await PDFDocument.load(pdfBufferOriginal);
  const pages = pdfDoc.getPages();
  const padding = 1;

  for (const t of tarjas) {
    const item = itens[t.i];
    if (!item || !t.d) continue;
    const page = pages[item.pageIndex];
    if (!page) continue;
    const { height: pageHeight } = page.getSize();

    const texto = item.texto;
    const alvo = t.d;
    if (!texto.length) continue;
    const charWidth = item.width / texto.length;

    let from = 0;
    while (true) {
      const pos = texto.indexOf(alvo, from);
      if (pos === -1) break;
      const xSub = item.x + pos * charWidth;
      const wSub = alvo.length * charWidth;
      const pdfLibY = pageHeight - item.y - item.height;
      page.drawRectangle({
        x: xSub - padding,
        y: pdfLibY - padding,
        width: wSub + padding * 2,
        height: item.height + padding * 2,
        color: rgb(0, 0, 0)
      });
      from = pos + alvo.length;
    }
  }

  const pdfFinal = Buffer.from(await pdfDoc.save());
  fs.writeFileSync(outputPath, pdfFinal);
  console.log('PDF salvo em:', outputPath, '(', pdfFinal.length, 'bytes )');
}

main().catch(e => { console.error(e); process.exit(1); });
