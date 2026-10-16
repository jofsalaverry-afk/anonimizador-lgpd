// Transforma os blocos de um modelo (modelos-documentos/) em texto (previa),
// DOCX (biblioteca docx) e PDF (pdfkit). Toda pagina leva a marca de minuta.
const PDFDocument = require('pdfkit');
const {
  Document, Packer, Paragraph, TextRun, Header, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType
} = require('docx');

const MARCA_MINUTA = 'MINUTA — sujeita à revisão jurídica';

function paraTexto(titulo, blocos) {
  const linhas = [MARCA_MINUTA, '', titulo.toUpperCase(), ''];
  for (const b of blocos) {
    if (b.tipo === 'secao') linhas.push('', b.texto);
    else if (b.tipo === 'paragrafo') linhas.push(b.texto);
    else if (b.tipo === 'lista') b.itens.forEach(i => linhas.push(`• ${i}`));
    else if (b.tipo === 'tabela') {
      linhas.push(b.colunas.join(' | '));
      b.linhas.forEach(l => linhas.push(l.join(' | ')));
    } else if (b.tipo === 'campo') linhas.push(`${b.rotulo}: ______________________________`);
    else if (b.tipo === 'assinatura') linhas.push('', ...b.linhas.flatMap(l => ['', '______________________________', l]));
  }
  return linhas.join('\n');
}

async function paraDocx(titulo, blocos, { orgNome }) {
  const filhos = [
    new Paragraph({ text: titulo, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: orgNome, italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 300 } })
  ];
  for (const b of blocos) {
    if (b.tipo === 'secao') filhos.push(new Paragraph({ text: b.texto, heading: HeadingLevel.HEADING_2, spacing: { before: 240 } }));
    else if (b.tipo === 'paragrafo') filhos.push(new Paragraph({ text: b.texto, alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 } }));
    else if (b.tipo === 'lista') b.itens.forEach(i => filhos.push(new Paragraph({ text: i, bullet: { level: 0 } })));
    else if (b.tipo === 'tabela') {
      const linha = (cels, negrito) => new TableRow({
        children: cels.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(c ?? ''), bold: negrito, size: 18 })] })] }))
      });
      filhos.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [linha(b.colunas, true), ...b.linhas.map(l => linha(l, false))] }));
      filhos.push(new Paragraph({ text: '' }));
    } else if (b.tipo === 'campo') filhos.push(new Paragraph({ text: `${b.rotulo}: ____________________________________________`, spacing: { after: 160 } }));
    else if (b.tipo === 'assinatura') b.linhas.forEach((l, i) => filhos.push(
      new Paragraph({ text: i === 0 ? l : '______________________________', spacing: { before: 400 } }),
      ...(i === 0 ? [] : [new Paragraph({ text: l })])
    ));
  }
  const doc = new Document({
    creator: 'Complidata', title: titulo, description: MARCA_MINUTA,
    sections: [{
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: MARCA_MINUTA, bold: true, color: 'B91C1C' })], alignment: AlignmentType.CENTER })] }) },
      children: filhos
    }]
  });
  return Packer.toBuffer(doc);
}

function paraPdf(titulo, blocos, { orgNome }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 70, bottom: 50, left: 55, right: 55 }, info: { Title: titulo, Subject: MARCA_MINUTA } });
    const partes = [];
    doc.on('data', b => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    const largura = doc.page.width - 110;
    const cabecalho = () => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c').text(MARCA_MINUTA, 55, 30, { width: largura, align: 'center' });
      doc.fillColor('#000').font('Helvetica').fontSize(10);
      doc.y = Math.max(y, 70);
    };
    cabecalho();
    doc.on('pageAdded', cabecalho);
    doc.font('Helvetica-Bold').fontSize(16).text(titulo, { align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(10).text(orgNome, { align: 'center' }).moveDown(1);

    for (const b of blocos) {
      doc.fillColor('#000');
      if (b.tipo === 'secao') doc.moveDown(0.4).font('Helvetica-Bold').fontSize(12).text(b.texto).moveDown(0.2);
      else if (b.tipo === 'paragrafo') doc.font('Helvetica').fontSize(10).text(b.texto, { align: 'justify' }).moveDown(0.4);
      else if (b.tipo === 'lista') { doc.font('Helvetica').fontSize(10).list(b.itens, { bulletRadius: 1.5, textIndent: 10 }); doc.moveDown(0.4); }
      else if (b.tipo === 'tabela') tabelaPdf(doc, b, largura);
      else if (b.tipo === 'campo') doc.font('Helvetica').fontSize(10).text(`${b.rotulo}: ` + '_'.repeat(60)).moveDown(0.4);
      else if (b.tipo === 'assinatura') {
        doc.moveDown(1).font('Helvetica').fontSize(10).text(b.linhas[0]);
        for (const l of b.linhas.slice(1)) doc.moveDown(2).text('______________________________').text(l);
      }
    }
    doc.end();
  });
}

function tabelaPdf(doc, b, largura) {
  const n = b.colunas.length;
  const w = largura / n;
  const x0 = 55;
  const desenhar = (cels, negrito) => {
    doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const alturas = cels.map(c => doc.heightOfString(String(c ?? ''), { width: w - 6 }));
    const h = Math.max(...alturas) + 6;
    if (doc.y + h > doc.page.height - 50) doc.addPage();
    const y = doc.y;
    cels.forEach((c, i) => {
      doc.rect(x0 + i * w, y, w, h).strokeColor('#94a3b8').lineWidth(0.5).stroke();
      doc.fillColor('#000').text(String(c ?? ''), x0 + i * w + 3, y + 3, { width: w - 6 });
    });
    doc.x = x0;
    doc.y = y + h;
  };
  desenhar(b.colunas, true);
  b.linhas.forEach(l => desenhar(l, false));
  doc.moveDown(0.6);
}

module.exports = { paraTexto, paraDocx, paraPdf, MARCA_MINUTA };
