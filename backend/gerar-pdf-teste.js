const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();

  const linhas = [
    ['CONTRATO DE PRESTACAO DE SERVICOS N 042/2026', bold, 13],
    ['', font, 11],
    ['CONTRATANTE: Camara Municipal de Exemplo, CNPJ 12.345.678/0001-90,', font, 11],
    ['com sede na Rua das Flores, 100, Centro, Exemplo/SP.', font, 11],
    ['', font, 11],
    ['CONTRATADA: Tech Solucoes LTDA, CNPJ 98.765.432/0001-10,', font, 11],
    ['neste ato representada por Joao da Silva Santos, CPF 123.456.789-00,', font, 11],
    ['RG 12.345.678-9 SSP/SP, residente na Rua das Palmeiras, 250, apto 32,', font, 11],
    ['Bairro Jardim, Exemplo/SP, CEP 01234-567.', font, 11],
    ['Email: joao.silva@gmail.com - Telefone: (11) 98765-4321.', font, 11],
    ['', font, 11],
    ['CLAUSULA 1a - OBJETO', bold, 11],
    ['O presente contrato tem por objeto a prestacao de servicos de TI.', font, 11],
    ['', font, 11],
    ['CLAUSULA 2a - VALOR', bold, 11],
    ['O valor total e de R$ 50.000,00 (cinquenta mil reais).', font, 11],
    ['', font, 11],
    ['CLAUSULA 3a - ASSINATURAS', bold, 11],
    ['Pela Camara: Maria Oliveira Costa, Presidente (agente publico).', font, 11],
    ['Pela Contratada: Joao da Silva Santos, CPF 123.456.789-00.', font, 11],
    ['', font, 11],
    ['Testemunha 1: Ana Paula Ferreira, CPF 987.654.321-00.', font, 11],
    ['Testemunha 2: Carlos Eduardo Lima, CPF 111.222.333-44.', font, 11],
    ['', font, 11],
    ['Exemplo/SP, 06 de abril de 2026.', font, 11],
  ];

  let y = height - 50;
  for (const [texto, f, size] of linhas) {
    if (texto) page.drawText(texto, { x: 50, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size + 6;
  }

  const bytes = await doc.save();
  const outPath = path.join(__dirname, 'teste.pdf');
  fs.writeFileSync(outPath, bytes);
  console.log('Gerado:', outPath, bytes.length, 'bytes');
}

main().catch(e => { console.error(e); process.exit(1); });
