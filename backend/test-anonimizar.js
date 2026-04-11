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
  console.log('Itens extraidos:', itens.length, 'em', pdfjsDoc.numPages, 'paginas');
  console.log('Conteudo dos itens:');
  itens.forEach(i => console.log(`  [${i.indice}] "${i.texto}"`));

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

  console.log('Resposta IA:', message.content[0].text.slice(0, 1000));
  let tarjas = [];
  try {
    const parsed = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
    tarjas = Array.isArray(parsed.tarjas) ? parsed.tarjas : [];
  } catch(e) {
    console.error('Erro parsing:', e.message);
  }
  const cpfRegex = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;
  const jaTemTarja = (i, d) => tarjas.some(t => t.i === i && t.d === d);
  const adicionadas = [];
  for (const item of itens) {
    const re = new RegExp(cpfRegex.source, 'g');
    let m;
    while ((m = re.exec(item.texto)) !== null) {
      if (!jaTemTarja(item.indice, m[0])) {
        tarjas.push({ i: item.indice, d: m[0] });
        adicionadas.push(`[${item.indice}] "${m[0]}"`);
      }
    }
  }
  if (adicionadas.length) {
    console.log('CPFs adicionados via regex fallback:', adicionadas.length);
    adicionadas.forEach(a => console.log('  +', a));
  }

  console.log('Tarjas cirurgicas (total):', tarjas.length);
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
  fs.writeFileSync(outputPath, pdfFinal);
  console.log('PDF salvo em:', outputPath, '(', pdfFinal.length, 'bytes )');
}

main().catch(e => { console.error(e); process.exit(1); });
