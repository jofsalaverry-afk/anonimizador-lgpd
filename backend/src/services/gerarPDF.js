const PDFDocument = require('pdfkit');

async function gerarPDFAnonimizado(textoAnonimizado, tipoDocumento = 'outro', leisAplicaveis = [], nomeCamara = 'Camara Municipal', logoBase64 = null, cabecalho = null) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    const topoY = 50;
    if (logoBase64) {
      try {
        const imgBuffer = Buffer.from(logoBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        doc.image(imgBuffer, 50, topoY, { width: 80, height: 80 });
        doc.fontSize(15).font('Helvetica-Bold').fillColor('#1a1a2e').text(nomeCamara, 145, topoY + 10, { width: 350 });
        if (cabecalho) doc.fontSize(9).font('Helvetica').fillColor('#555555').text(cabecalho, 145, doc.y + 2, { width: 350 });
        doc.moveDown(0.5);
      } catch(e) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a2e').text(nomeCamara, { align: 'center' });
        if (cabecalho) doc.fontSize(9).font('Helvetica').fillColor('#555555').text(cabecalho, { align: 'center' });
      }
    } else {
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a2e').text(nomeCamara, { align: 'center' });
      if (cabecalho) doc.fontSize(9).font('Helvetica').fillColor('#555555').text(cabecalho, { align: 'center' });
    }
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a2e').text('DOCUMENTO ANONIMIZADO - LGPD', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#888888').text('Tipo: ' + tipoDocumento.toUpperCase() + '   |   Gerado em: ' + new Date().toLocaleString('pt-BR'), { align: 'center' });
    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
    doc.moveDown(0.8);
    doc.fontSize(11).font('Helvetica').fillColor('#000000').text(textoAnonimizado, { align: 'justify', lineGap: 4 });
    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();
    doc.moveDown(0.8);
    if (leisAplicaveis && leisAplicaveis.length > 0) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Fundamentacao Legal:');
      doc.moveDown(0.3);
      leisAplicaveis.forEach(lei => doc.fontSize(9).font('Helvetica').fillColor('#555555').text('- ' + lei));
      doc.moveDown(1);
    }
    doc.fontSize(8).fillColor('#aaaaaa').text('Documento gerado automaticamente pelo Anonimizador LGPD.', { align: 'center' });
    doc.end();
  });
}

module.exports = { gerarPDFAnonimizado };