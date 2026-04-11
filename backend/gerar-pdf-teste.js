const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { height, width } = page.getSize();

  const draw = (texto, x, y, f = font, size = 10) => {
    if (texto) page.drawText(texto, { x, y, size, font: f, color: rgb(0, 0, 0) });
  };

  // Cabecalho (largura total)
  let y = height - 50;
  draw('CONTRATO DE PRESTACAO DE SERVICOS N 042/2026', 50, y, bold, 13);
  y -= 20;
  draw('Camara Municipal de Exemplo - Processo Administrativo 555/2026', 50, y, font, 9);
  y -= 25;

  // Paragrafo de abertura (largura total) com CPF NO MEIO de frase longa
  const abertura = [
    'Pelo presente instrumento particular, de um lado a CAMARA MUNICIPAL DE EXEMPLO,',
    'pessoa juridica de direito publico, CNPJ 12.345.678/0001-90, com sede na Rua das',
    'Flores, 100, Centro, Exemplo/SP, neste ato representada por seu Presidente, o',
    'Vereador Marcos Antonio Pereira (agente publico em exercicio), e de outro lado a',
    'empresa TECH SOLUCOES LTDA, CNPJ 98.765.432/0001-10, com sede na Avenida',
    'Paulista, 1000, Bela Vista, Sao Paulo/SP, CEP 01310-100, neste ato representada',
    'por seu socio administrador, o Sr. Joao da Silva Santos, brasileiro, casado,',
    'inscrito no CPF sob o numero 123.456.789-00 e portador da Cedula de Identidade',
    'RG 12.345.678-9 SSP/SP, residente e domiciliado na Rua das Palmeiras, 250, apto',
    '32, Bairro Jardim, Exemplo/SP, CEP 01234-567, doravante denominada CONTRATADA,',
    'resolvem celebrar o presente contrato, mediante as clausulas e condicoes a seguir.',
  ];
  for (const linha of abertura) { draw(linha, 50, y); y -= 13; }
  y -= 8;

  // Duas colunas a partir daqui
  const col1X = 50;
  const col2X = 310;
  const colWidth = 240;
  let y1 = y;
  let y2 = y;

  draw('CLAUSULA 1 - OBJETO', col1X, y1, bold, 10); y1 -= 14;
  const col1 = [
    'O presente contrato tem por objeto a',
    'prestacao de servicos tecnicos de TI, tendo',
    'como responsavel tecnica a engenheira',
    'Fernanda Oliveira Ramos, inscrita no CPF',
    'sob o numero 990.477.050-68, a qual',
    'atuara como consultora principal durante',
    'toda a vigencia contratual.',
    '',
    'Atuara como fiscal do contrato o servidor',
    'publico Sr. Ricardo Alves Mendes, Matricula',
    '4521, ja designado pela Portaria 10/2026,',
    'sendo que o preposto da contratada sera o',
    'Sr. Bruno Carvalho Lima, CPF 723.271.039-91,',
    'com email pessoal bruno.lima@gmail.com e',
    'telefone (11) 98765-4321, residente na Rua',
    'dos Ipes, 45, apto 12, Sao Paulo/SP.',
  ];
  for (const l of col1) { draw(l, col1X, y1); y1 -= 12; }

  draw('CLAUSULA 2 - VALOR E PRAZO', col2X, y2, bold, 10); y2 -= 14;
  const col2 = [
    'O valor global do contrato e de',
    'R$ 150.000,00 (cento e cinquenta mil reais),',
    'a ser pago em 12 parcelas mensais.',
    '',
    'A vigencia sera de 12 meses contados da',
    'assinatura, podendo ser prorrogado nos',
    'termos da Lei 14.133/2021.',
    '',
    'CLAUSULA 3 - ASSINATURAS',
    '',
    'Pela Camara: Vereador Marcos Antonio',
    'Pereira, Presidente (agente publico).',
    '',
    'Pela Contratada: Joao da Silva Santos,',
    'CPF 123.456.789-00.',
    '',
    'Testemunha 1: Ana Paula Ferreira,',
    'CPF 987.654.321-00.',
    'Testemunha 2: Carlos Eduardo Lima,',
    'CPF 111.222.333-44.',
  ];
  for (const l of col2) { draw(l, col2X, y2); y2 -= 12; }

  const bytes = await doc.save();
  const outPath = path.join(__dirname, 'teste.pdf');
  fs.writeFileSync(outPath, bytes);
  console.log('Gerado:', outPath, bytes.length, 'bytes');
}

main().catch(e => { console.error(e); process.exit(1); });
