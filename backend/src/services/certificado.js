const crypto = require('crypto');
const PDFDocument = require('pdfkit');

// URL publica do frontend para o link de verificacao impresso no
// certificado. PUBLIC_APP_URL e opcional; sem ela, usa o dominio oficial.
const { APP_URL } = require('./appUrl');

// Codigo de verificacao: 12 caracteres base32 sem ambiguos (0/O, 1/I),
// agrupados em 3x4. ~60 bits de entropia — nao da para adivinhar.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function gerarCodigo() {
  const bytes = crypto.randomBytes(12);
  let c = '';
  for (const b of bytes) c += ALFABETO[b % ALFABETO.length];
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

function urlVerificacao(codigo) {
  return `${APP_URL}/#certificado/${codigo}`;
}

function cargaHorariaTexto(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} minutos`;
  return m === 0 ? `${h} hora(s)` : `${h} hora(s) e ${m} minutos`;
}

function dataPorExtenso(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

// Gera o PDF (A4 paisagem) e devolve um Buffer.
function gerarCertificadoPdf(cert) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50, info: { Title: `Certificado - ${cert.trilhaTitulo}` } });
    const partes = [];
    doc.on('data', b => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const w = doc.page.width;
    const h = doc.page.height;
    doc.rect(25, 25, w - 50, h - 50).lineWidth(2).strokeColor('#1a1a2e').stroke();
    doc.rect(32, 32, w - 64, h - 64).lineWidth(0.5).strokeColor('#94a3b8').stroke();

    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(30).fillColor('#1a1a2e').text('CERTIFICADO', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(13).fillColor('#475569').text('de conclusão de treinamento em proteção de dados pessoais', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(14).fillColor('#000').text('Certificamos que', { align: 'center' });
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(24).text(cert.nomeUsuario, { align: 'center' });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(14).text(`concluiu a trilha "${cert.trilhaTitulo}", com carga horária de ${cargaHorariaTexto(cert.cargaHorariaMin)},`, { align: 'center' });
    doc.text(`em ${dataPorExtenso(cert.concluidoEm)}, oferecida por ${cert.nomeOrganizacao}`, { align: 'center' });
    doc.text('em atendimento ao art. 50, I, "g", da Lei 13.709/2018 (LGPD).', { align: 'center' });

    doc.font('Helvetica').fontSize(10).fillColor('#475569');
    doc.text(`Código de verificação: ${cert.codigo}`, 50, h - 110, { align: 'center', width: w - 100 });
    doc.text(`Verifique a autenticidade em ${urlVerificacao(cert.codigo)}`, { align: 'center', width: w - 100 });
    doc.end();
  });
}

module.exports = { gerarCodigo, gerarCertificadoPdf, urlVerificacao, cargaHorariaTexto };
