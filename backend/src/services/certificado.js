const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { fmtDataExtenso } = require('./datas');

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

// 20 -> "0h20min"; 90 -> "1h30min"; 120 -> "2h"
function cargaHorariaTexto(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 && h > 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}min`;
}

// Fundamento da capacitacao (Etapa 6c — substitui a citacao ao art. 50,
// que trata de boas praticas facultativas).
const BASE_LEGAL_CAPACITACAO = 'Capacitação de servidores e colaboradores que tratam dados pessoais, em apoio às atribuições do encarregado (art. 41, § 2º, III, da LGPD) e às medidas de segurança do art. 46.';

// Logo da camara (data URL PNG/JPEG). Outros formatos sao ignorados.
function logoBuffer(dataUrl) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl || '');
  return m ? Buffer.from(m[2], 'base64') : null;
}

const AZUL = '#1f2a4d';
const DOURADO = '#b08d3c';
const CINZA = '#4b5563';

// Gera o PDF (A4 paisagem) e devolve um Buffer.
// org (opcional): { nome, municipio, uf, encarregadoNome, logoBase64 } —
// dados atuais da camara; sem eles o certificado usa a copia gravada.
async function gerarCertificadoPdf(cert, org = {}) {
  const url = urlVerificacao(cert.codigo);
  const qr = await QRCode.toBuffer(url, { margin: 0, width: 220, color: { dark: AZUL, light: '#ffffff' } });
  const nomeCamara = org.nome || cert.nomeOrganizacao;
  const local = [org.municipio, org.uf].filter(Boolean).join('/');
  const data = fmtDataExtenso(cert.concluidoEm, { pura: false });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Certificado - ${cert.trilhaTitulo}`, Author: nomeCamara, Creator: 'Complidata' } });
    const partes = [];
    doc.on('data', b => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const W = doc.page.width;   // 842
    const H = doc.page.height;  // 595

    // Moldura dupla fina com cantos discretos
    doc.lineWidth(1.2).strokeColor(AZUL).rect(22, 22, W - 44, H - 44).stroke();
    doc.lineWidth(0.5).rect(29, 29, W - 58, H - 58).stroke();
    const canto = 16;
    for (const [x, y, dx, dy] of [[29, 29, 1, 1], [W - 29, 29, -1, 1], [29, H - 29, 1, -1], [W - 29, H - 29, -1, -1]]) {
      doc.lineWidth(1.2).moveTo(x + dx * 5, y + dy * (canto + 5)).lineTo(x + dx * 5, y + dy * 5).lineTo(x + dx * (canto + 5), y + dy * 5).stroke();
    }

    // Topo: logo, nome da camara em versalete e programa
    let y = 64;
    const logo = logoBuffer(org.logoBase64);
    if (logo) {
      try { doc.image(logo, W / 2 - 28, y, { fit: [56, 56], align: 'center' }); y += 62; } catch { /* imagem invalida: segue sem logo */ }
    }
    doc.font('Times-Roman').fontSize(13).fillColor(AZUL)
      .text(nomeCamara.toUpperCase(), 60, y, { width: W - 120, align: 'center', characterSpacing: 2 });
    doc.font('Times-Roman').fontSize(11).fillColor(CINZA)
      .text('Programa de Capacitação em Proteção de Dados Pessoais', 60, doc.y + 4, { width: W - 120, align: 'center' });

    // CERTIFICADO + fio dourado
    y = doc.y + 30;
    doc.font('Times-Roman').fontSize(36).fillColor(AZUL).text('CERTIFICADO', 60, y, { width: W - 120, align: 'center', characterSpacing: 8 });
    y = doc.y + 6;
    doc.lineWidth(1).strokeColor(DOURADO).moveTo(W / 2 - 90, y).lineTo(W / 2 + 90, y).stroke();

    // Nome do servidor em serifa italica, sobre linha
    y += 36;
    doc.font('Times-Roman').fontSize(12).fillColor(CINZA).text('Certificamos que', 60, y, { width: W - 120, align: 'center' });
    y = doc.y + 12;
    doc.font('Times-Italic').fontSize(32).fillColor('#111827').text(cert.nomeUsuario, 60, y, { width: W - 120, align: 'center' });
    y = doc.y + 4;
    doc.lineWidth(0.6).strokeColor(CINZA).moveTo(W / 2 - 200, y).lineTo(W / 2 + 200, y).stroke();

    // Texto
    y += 24;
    doc.font('Times-Roman').fontSize(13).fillColor('#111827').text(
      `concluiu a trilha “${cert.trilhaTitulo}”, com carga horária de ${cargaHorariaTexto(cert.cargaHorariaMin)}, em ${data}.`,
      110, y, { width: W - 220, align: 'center' }
    );
    doc.font('Times-Roman').fontSize(10.5).fillColor(CINZA).text(BASE_LEGAL_CAPACITACAO, 130, doc.y + 12, { width: W - 260, align: 'center' });

    // Rodape em 3 colunas
    const yR = H - 150;
    const col = (W - 120) / 3;
    // 1) local e data por extenso
    doc.font('Times-Roman').fontSize(11).fillColor('#111827')
      .text(local ? `${local}, ${data}.` : `${data}.`, 60, yR + 52, { width: col - 10, align: 'center' });
    // 2) assinatura do encarregado
    const xA = 60 + col;
    doc.lineWidth(0.6).strokeColor('#111827').moveTo(xA + 20, yR + 50).lineTo(xA + col - 20, yR + 50).stroke();
    doc.font('Times-Roman').fontSize(11).fillColor('#111827')
      .text(org.encarregadoNome || ' ', xA, yR + 56, { width: col, align: 'center' });
    doc.font('Times-Italic').fontSize(9.5).fillColor(CINZA)
      .text('Encarregado pelo Tratamento de Dados Pessoais', xA, doc.y + 1, { width: col, align: 'center' });
    // 3) QR code + codigo
    const xQ = 60 + 2 * col;
    doc.image(qr, xQ + col / 2 - 34, yR + 4, { width: 68, height: 68 });
    doc.font('Helvetica').fontSize(8).fillColor(CINZA)
      .text(`Código: ${cert.codigo}`, xQ, yR + 76, { width: col, align: 'center' })
      .text('Confira a autenticidade pelo QR code ou em', xQ, doc.y + 1, { width: col, align: 'center' })
      .text(url, xQ, doc.y + 1, { width: col, align: 'center' });

    doc.end();
  });
}

module.exports = { gerarCodigo, gerarCertificadoPdf, urlVerificacao, cargaHorariaTexto, BASE_LEGAL_CAPACITACAO };
