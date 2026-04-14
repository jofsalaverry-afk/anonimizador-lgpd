// Email Service — wrapper sobre nodemailer com fallback dev-mode.
//
// Em producao, configure via env vars:
//   SMTP_HOST=smtp.exemplo.com
//   SMTP_PORT=587
//   SMTP_SECURE=false
//   SMTP_USER=usuario
//   SMTP_PASS=senha
//   SMTP_FROM="Anonimizador LGPD <nao-responda@exemplo.com>"
//
// Em dev (sem SMTP_HOST configurado), os emails sao logados no console.

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
  return transporter;
}

const FROM = process.env.SMTP_FROM || 'Anonimizador LGPD <nao-responda@anonimizador.local>';

// Notifica o admin sobre falha de SMTP. Usa trans.sendMail direto (nao
// a funcao enviar() desta mesma lib) para garantir que nunca ha
// recursao — se o alerta tambem falhar, so loga e desiste.
async function notificarFalhaSmtp(trans, { to, subject, err }) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (!adminEmail) return;
  if (to === adminEmail) return; // nao alerta sobre falha de envio para o proprio admin
  try {
    await trans.sendMail({
      from: FROM,
      to: adminEmail,
      subject: '[Complidata] Falha SMTP detectada',
      text: `Falha ao enviar email pelo servico de envio.\n\nDestinatario original: ${to}\nAssunto: ${subject}\nErro: ${err.message}\n\nVerifique credenciais SMTP, cota do provedor e conectividade do backend.`
    });
    console.log('[emailService] alerta de falha SMTP enviado para', adminEmail);
  } catch (alertErr) {
    console.error('[emailService] falha ao alertar admin sobre erro SMTP:', alertErr.message);
  }
}

async function enviar({ to, subject, text, html }) {
  const trans = getTransporter();
  if (!trans) {
    console.log('[emailService:dev]', { to, subject, preview: (text || html || '').slice(0, 200) });
    return { devMode: true };
  }
  try {
    const info = await trans.sendMail({ from: FROM, to, subject, text, html });
    console.log('[emailService] enviado:', info.messageId, 'para', to);
    return info;
  } catch (err) {
    console.error('[emailService] falha ao enviar para', to, err.message);
    notificarFalhaSmtp(trans, { to, subject, err }); // fire-and-forget
    throw err;
  }
}

// ==================== Templates ====================

function tplOtp({ titularNome, codigo, orgNome }) {
  const text = `Ola, ${titularNome}.

Seu codigo de verificacao para a solicitacao de direitos LGPD junto a ${orgNome} e:

    ${codigo}

Este codigo expira em 10 minutos. Se voce nao solicitou isto, ignore este email.

--
${orgNome}`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #4f46e5; margin: 0 0 16px;">Codigo de verificacao</h2>
<p>Ola, <strong>${titularNome}</strong>.</p>
<p>Seu codigo de verificacao para a solicitacao de direitos LGPD junto a <strong>${orgNome}</strong> e:</p>
<div style="background: white; border: 2px dashed #4f46e5; border-radius: 12px; padding: 24px; text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; margin: 24px 0;">${codigo}</div>
<p style="color: #64748b; font-size: 13px;">Este codigo expira em 10 minutos. Se voce nao solicitou isto, ignore este email.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${orgNome}</p>
</body></html>`;

  return { text, html };
}

function tplConfirmacaoSolicitacao({ titularNome, protocolo, dataLimite, orgNome }) {
  const prazo = new Date(dataLimite).toLocaleDateString('pt-BR');
  const text = `Ola, ${titularNome}.

Sua solicitacao de direitos LGPD foi registrada.

Protocolo: ${protocolo}
Prazo para resposta: ${prazo}

O prazo legal e de 15 dias corridos a partir do recebimento (LGPD Art. 19, paragrafo 1).
Guarde o numero do protocolo para acompanhamento.

--
${orgNome}`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #4f46e5; margin: 0 0 16px;">Solicitacao registrada</h2>
<p>Ola, <strong>${titularNome}</strong>.</p>
<p>Sua solicitacao de direitos LGPD foi registrada com sucesso.</p>
<table style="background: white; border-radius: 12px; padding: 16px; margin: 16px 0; width: 100%; border-collapse: collapse;">
<tr><td style="padding: 8px; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Protocolo</td></tr>
<tr><td style="padding: 0 8px 16px; font-size: 18px; font-weight: 700; color: #0f172a;">${protocolo}</td></tr>
<tr><td style="padding: 8px; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid #f1f5f9;">Prazo para resposta</td></tr>
<tr><td style="padding: 0 8px 8px; font-size: 16px; font-weight: 600; color: #1e293b;">${prazo}</td></tr>
</table>
<p style="color: #64748b; font-size: 13px;">O prazo legal e de 15 dias corridos a partir do recebimento conforme o Art. 19, paragrafo 1 da LGPD. Guarde o numero do protocolo para acompanhamento.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${orgNome}</p>
</body></html>`;

  return { text, html };
}

function tplAlertaPrazoDPO({ solicitacoes, orgNome }) {
  const linhas = solicitacoes
    .map(s => `- ${s.protocolo} (${s.titularNome}): ${s.diasRestantes} dia(s) restante(s)`)
    .join('\n');

  const text = `Alerta de prazo LGPD — ${orgNome}

As seguintes solicitacoes estao proximas do prazo de 15 dias:

${linhas}

Acesse o sistema para providenciar as respostas.

--
Sistema Anonimizador LGPD`;

  const linhasHtml = solicitacoes
    .map(s => {
      const cor = s.diasRestantes < 0 ? '#dc2626' : s.diasRestantes < 2 ? '#dc2626' : '#d97706';
      const label = s.diasRestantes < 0 ? `Vencida ha ${Math.abs(s.diasRestantes)} dia(s)` : `${s.diasRestantes} dia(s) restante(s)`;
      return `<tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;"><strong>${s.protocolo}</strong> — ${s.titularNome}<br><span style="color: ${cor}; font-size: 12px; font-weight: 600;">${label}</span></td></tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #dc2626; margin: 0 0 16px;">Alerta de prazo LGPD</h2>
<p><strong>${orgNome}</strong> — as seguintes solicitacoes de direitos de titulares estao proximas do prazo legal de 15 dias:</p>
<table style="background: white; border-radius: 12px; padding: 16px; margin: 16px 0; width: 100%; border-collapse: collapse;">
${linhasHtml}
</table>
<p style="color: #64748b; font-size: 13px;">Acesse o sistema para providenciar as respostas e evitar notificacao a ANPD.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">Sistema Anonimizador LGPD</p>
</body></html>`;

  return { text, html };
}

function tplRespostaTitular({ titularNome, protocolo, respostaTexto, orgNome }) {
  const text = `Ola, ${titularNome}.

Sua solicitacao ${protocolo} foi respondida.

Resposta:
${respostaTexto}

Caso nao esteja satisfeito com a resposta, voce tem direito de peticionar diretamente a ANPD (Autoridade Nacional de Protecao de Dados).

--
${orgNome}`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #16a34a; margin: 0 0 16px;">Sua solicitacao foi respondida</h2>
<p>Ola, <strong>${titularNome}</strong>.</p>
<p>Sua solicitacao de protocolo <strong>${protocolo}</strong> foi respondida oficialmente.</p>
<div style="background: white; border-left: 4px solid #16a34a; border-radius: 8px; padding: 20px; margin: 16px 0; white-space: pre-wrap; line-height: 1.6;">${respostaTexto}</div>
<p style="color: #64748b; font-size: 13px;">Caso nao esteja satisfeito com a resposta, voce tem direito de peticionar diretamente a ANPD (Autoridade Nacional de Protecao de Dados).</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${orgNome}</p>
</body></html>`;

  return { text, html };
}

// ==================== API publica ====================

async function enviarOTP({ to, titularNome, codigo, orgNome }) {
  const { text, html } = tplOtp({ titularNome, codigo, orgNome });
  return enviar({ to, subject: `Codigo de verificacao: ${codigo}`, text, html });
}

async function enviarConfirmacaoSolicitacao({ to, titularNome, protocolo, dataLimite, orgNome }) {
  const { text, html } = tplConfirmacaoSolicitacao({ titularNome, protocolo, dataLimite, orgNome });
  return enviar({ to, subject: `Solicitacao ${protocolo} registrada`, text, html });
}

async function enviarAlertaPrazoDPO({ to, solicitacoes, orgNome }) {
  const { text, html } = tplAlertaPrazoDPO({ solicitacoes, orgNome });
  return enviar({ to, subject: `Alerta de prazo LGPD: ${solicitacoes.length} solicitacao(oes)`, text, html });
}

async function enviarRespostaTitular({ to, titularNome, protocolo, respostaTexto, orgNome }) {
  const { text, html } = tplRespostaTitular({ titularNome, protocolo, respostaTexto, orgNome });
  return enviar({ to, subject: `Resposta a sua solicitacao ${protocolo}`, text, html });
}

module.exports = {
  enviar,
  enviarOTP,
  enviarConfirmacaoSolicitacao,
  enviarAlertaPrazoDPO,
  enviarRespostaTitular
};
