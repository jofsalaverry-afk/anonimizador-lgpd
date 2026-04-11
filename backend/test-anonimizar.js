require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const {
  extrairItens,
  agruparLinhas,
  construirTarjas,
  aplicarTarjas,
  buildPromptItens,
  PROMPT_INSTRUCOES,
  linhaEhSedeEmpresa,
  linhaEhResidencia,
} = require('./src/services/tarjador');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const inputPath = path.join(__dirname, 'teste.pdf');
  const outputPath = path.join(__dirname, 'teste-anonimizado.pdf');
  const pdfBuffer = fs.readFileSync(inputPath);
  console.log('PDF lido:', pdfBuffer.length, 'bytes');

  const itens = await extrairItens(pdfBuffer);
  const linhas = agruparLinhas(itens);
  console.log(`Itens: ${itens.length} | Linhas: ${linhas.length}`);
  linhas.forEach((l, k) => {
    const tags = [];
    if (linhaEhSedeEmpresa(l.texto)) tags.push('SEDE');
    if (linhaEhResidencia(l.texto)) tags.push('RESID');
    console.log(`  L${k} [p${l.pageIndex}] ${tags.join(',')} ${l.texto}`);
  });

  const itensParaIA = buildPromptItens(itens, linhas);
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `${PROMPT_INSTRUCOES}\n\nItens (JSON):\n${JSON.stringify(itensParaIA)}`
    }]
  });

  let respostaIA = { tarjas: [] };
  try {
    respostaIA = JSON.parse(message.content[0].text.match(/\{[\s\S]*\}/)[0]);
  } catch (e) {
    console.error('Erro parsing IA:', e.message);
    console.log(message.content[0].text.slice(0, 500));
  }
  console.log(`Tarjas IA: ${(respostaIA.tarjas || []).length}`);

  const tarjasFinais = construirTarjas(itens, linhas, respostaIA);
  console.log(`Tarjas finais (apos regex+filtro contexto): ${tarjasFinais.length}`);
  const porOrigem = {};
  tarjasFinais.forEach(t => { porOrigem[t.origem] = (porOrigem[t.origem] || 0) + 1; });
  console.log('  por origem:', porOrigem);
  tarjasFinais.forEach(t => {
    const it = itens[t.i];
    if (!it) return;
    const trecho = it.texto.slice(t.start, t.end);
    console.log(`  [${t.i}:${t.start}-${t.end}] (${t.origem}) "${trecho}"`);
  });

  const pdfFinal = await aplicarTarjas(pdfBuffer, itens, tarjasFinais);
  fs.writeFileSync(outputPath, pdfFinal);
  console.log('Salvo em:', outputPath, '(', pdfFinal.length, 'bytes )');
}

main().catch(e => { console.error(e); process.exit(1); });
