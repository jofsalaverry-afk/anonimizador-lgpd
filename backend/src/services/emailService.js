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
// Etapa 7a: sem SMTP_HOST e SMTP_FROM o envio FALHA (EmailIndisponivelError)
// — nunca finge sucesso. Nao ha remetente padrao. Para testes automatizados,
// EMAIL_TRANSPORTE=memoria guarda as mensagens em caixaMemoria.
// Logs mascaram codigos de 6 digitos e enderecos de e-mail.

const nodemailer = require('nodemailer');

class EmailIndisponivelError extends Error {
  constructor(motivo) { super(motivo || 'Envio de e-mail não configurado'); this.name = 'EmailIndisponivelError'; this.code = 'EMAIL_INDISPONIVEL'; }
}

const caixaMemoria = [];
const emMemoria = () => process.env.EMAIL_TRANSPORTE === 'memoria';
// Remetente vem SEMPRE da variavel (sem padrao @anonimizador.local)
const remetente = () => (process.env.SMTP_FROM || '').trim();
function emailConfigurado() {
  if (emMemoria()) return true;
  return !!(process.env.SMTP_HOST && remetente());
}

// Escapa texto vindo de usuario/titular antes de entrar no HTML do e-mail
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Mascara para log: codigos de 6 digitos e e-mails (x***@dominio)
function mascarar(v) {
  return String(v ?? '')
    .replace(/\b\d{6}\b/g, '******')
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, '$1***@$2');
}

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


// Notifica o admin sobre falha de SMTP. Usa trans.sendMail direto (nao
// a funcao enviar() desta mesma lib) para garantir que nunca ha
// recursao — se o alerta tambem falhar, so loga e desiste.
async function notificarFalhaSmtp(trans, { to, subject, err }) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (!adminEmail) return;
  if (to === adminEmail) return; // nao alerta sobre falha de envio para o proprio admin
  try {
    await trans.sendMail({
      from: remetente(),
      to: adminEmail,
      subject: '[Complidata] Falha SMTP detectada',
      text: `Falha ao enviar email pelo serviço de envio.\n\nDestinatário original: ${mascarar(to)}\nAssunto: ${mascarar(subject)}\nErro: ${err.message}\n\nVerifique credenciais SMTP, cota do provedor e conectividade do backend.`
    });
    console.log('[emailService] alerta de falha SMTP enviado para', adminEmail);
  } catch (alertErr) {
    console.error('[emailService] falha ao alertar admin sobre erro SMTP:', alertErr.message);
  }
}

async function enviar({ to, subject, text, html }) {
  if (emMemoria()) {
    caixaMemoria.push({ to, subject, text, html, em: new Date() });
    return { messageId: `memoria-${caixaMemoria.length}` };
  }
  if (!emailConfigurado()) {
    console.warn('[emailService] NÃO enviado (SMTP_HOST/SMTP_FROM não configurados):', mascarar(subject), 'para', mascarar(to));
    throw new EmailIndisponivelError();
  }
  const trans = getTransporter();
  try {
    const info = await trans.sendMail({ from: remetente(), to, subject, text, html });
    console.log('[emailService] enviado:', info.messageId, 'para', mascarar(to));
    return info;
  } catch (err) {
    console.error('[emailService] falha ao enviar para', mascarar(to), err.message);
    notificarFalhaSmtp(trans, { to, subject, err }); // fire-and-forget
    throw err;
  }
}

// ==================== Templates ====================

function tplOtp({ titularNome, codigo, orgNome }) {
  const text = `Olá, ${titularNome}.

Seu código de verificação para a solicitação de direitos LGPD junto à ${orgNome} é:

    ${codigo}

Este código expira em 10 minutos. Se você não solicitou isto, ignore este email.

--
${orgNome}`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #4f46e5; margin: 0 0 16px;">Código de verificação</h2>
<p>Olá, <strong>${esc(titularNome)}</strong>.</p>
<p>Seu código de verificação para a solicitação de direitos LGPD junto à <strong>${esc(orgNome)}</strong> é:</p>
<div style="background: white; border: 2px dashed #4f46e5; border-radius: 12px; padding: 24px; text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; margin: 24px 0;">${codigo}</div>
<p style="color: #64748b; font-size: 13px;">Este código expira em 10 minutos. Se você não solicitou isto, ignore este email.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${esc(orgNome)}</p>
</body></html>`;

  return { text, html };
}

function tplConfirmacaoSolicitacao({ titularNome, protocolo, dataLimite, orgNome }) {
  // Etapa 7b: dia do prazo no fuso de Sao Paulo; sem prazo ainda (aguardando
  // verificacao da identidade) o texto diz quando ele comeca.
  const prazo = dataLimite
    ? new Date(dataLimite).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '15 dias a partir da verificação da sua identidade pela câmara';
  const text = `Olá, ${titularNome}.

Sua solicitação de direitos LGPD foi registrada.

Protocolo: ${protocolo}
Prazo para resposta: ${prazo}

O prazo de referência para a resposta é de 15 dias a partir do recebimento (para pedidos de acesso, art. 19, II, da LGPD).
Guarde o número do protocolo para acompanhamento.

--
${orgNome}`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #4f46e5; margin: 0 0 16px;">Solicitação registrada</h2>
<p>Olá, <strong>${esc(titularNome)}</strong>.</p>
<p>Sua solicitação de direitos LGPD foi registrada com sucesso.</p>
<table style="background: white; border-radius: 12px; padding: 16px; margin: 16px 0; width: 100%; border-collapse: collapse;">
<tr><td style="padding: 8px; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Protocolo</td></tr>
<tr><td style="padding: 0 8px 16px; font-size: 18px; font-weight: 700; color: #0f172a;">${esc(protocolo)}</td></tr>
<tr><td style="padding: 8px; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid #f1f5f9;">Prazo para resposta</td></tr>
<tr><td style="padding: 0 8px 8px; font-size: 16px; font-weight: 600; color: #1e293b;">${prazo}</td></tr>
</table>
<p style="color: #64748b; font-size: 13px;">O prazo de referência para a resposta é de 15 dias a partir do recebimento (para pedidos de acesso, art. 19, II, da LGPD). Guarde o número do protocolo para acompanhamento.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${esc(orgNome)}</p>
</body></html>`;

  return { text, html };
}

function tplAlertaPrazoDPO({ solicitacoes, orgNome }) {
  const linhas = solicitacoes
    .map(s => `- ${s.protocolo} (${s.titularNome}): ${s.diasRestantes} dia(s) restante(s)`)
    .join('\n');

  const text = `Alerta de prazo LGPD — ${orgNome}

As seguintes solicitações estão próximas do prazo de 15 dias:

${linhas}

Acesse o sistema para providenciar as respostas.

--
Sistema Anonimizador LGPD`;

  const linhasHtml = solicitacoes
    .map(s => {
      const cor = s.diasRestantes < 0 ? '#dc2626' : s.diasRestantes < 2 ? '#dc2626' : '#d97706';
      const label = s.diasRestantes < 0 ? `Vencida há ${Math.abs(s.diasRestantes)} dia(s)` : `${s.diasRestantes} dia(s) restante(s)`;
      return `<tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;"><strong>${esc(s.protocolo)}</strong> — ${esc(s.titularNome)}<br><span style="color: ${cor}; font-size: 12px; font-weight: 600;">${label}</span></td></tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #dc2626; margin: 0 0 16px;">Alerta de prazo LGPD</h2>
<p><strong>${esc(orgNome)}</strong> — as seguintes solicitações de direitos de titulares estão próximas do prazo legal de 15 dias:</p>
<table style="background: white; border-radius: 12px; padding: 16px; margin: 16px 0; width: 100%; border-collapse: collapse;">
${linhasHtml}
</table>
<p style="color: #64748b; font-size: 13px;">Acesse o sistema para providenciar as respostas e evitar notificação à ANPD.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">Sistema Anonimizador LGPD</p>
</body></html>`;

  return { text, html };
}

function tplRespostaTitular({ titularNome, protocolo, respostaTexto, orgNome }) {
  const text = `Olá, ${titularNome}.

Sua solicitação ${protocolo} foi respondida.

Resposta:
${respostaTexto}

Caso não esteja satisfeito com a resposta, você tem direito de peticionar diretamente à ANPD (Autoridade Nacional de Proteção de Dados).

--
${orgNome}`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #16a34a; margin: 0 0 16px;">Sua solicitação foi respondida</h2>
<p>Olá, <strong>${esc(titularNome)}</strong>.</p>
<p>Sua solicitação de protocolo <strong>${esc(protocolo)}</strong> foi respondida oficialmente.</p>
<div style="background: white; border-left: 4px solid #16a34a; border-radius: 8px; padding: 20px; margin: 16px 0; white-space: pre-wrap; line-height: 1.6;">${esc(respostaTexto)}</div>
<p style="color: #64748b; font-size: 13px;">Caso não esteja satisfeito com a resposta, você tem direito de peticionar diretamente à ANPD (Autoridade Nacional de Proteção de Dados).</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${esc(orgNome)}</p>
</body></html>`;

  return { text, html };
}

function tplRecuperacaoSenha({ nome, link, minutos }) {
  const text = `Olá, ${nome}.

Recebemos um pedido para criar uma nova senha de acesso à plataforma Complidata.

Para criar a nova senha, abra o link abaixo (vale por ${minutos} minutos e só pode ser usado uma vez):

${link}

Se você não pediu isso, ignore este e-mail: sua senha atual continua valendo.`;
  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #1f2a4d; margin: 0 0 16px;">Criar nova senha</h2>
<p>Olá, <strong>${esc(nome)}</strong>.</p>
<p>Recebemos um pedido para criar uma nova senha de acesso à plataforma Complidata.</p>
<p style="margin: 24px 0;"><a href="${esc(link)}" style="background: #1f2a4d; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Criar nova senha</a></p>
<p style="color: #64748b; font-size: 13px;">O link vale por ${minutos} minutos e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail: sua senha atual continua valendo.</p>
</body></html>`;
  return { text, html };
}

// ==================== API publica ====================

async function enviarOTP({ to, titularNome, codigo, orgNome }) {
  const { text, html } = tplOtp({ titularNome, codigo, orgNome });
  return enviar({ to, subject: `Código de verificação: ${codigo}`, text, html });
}

async function enviarConfirmacaoSolicitacao({ to, titularNome, protocolo, dataLimite, orgNome }) {
  const { text, html } = tplConfirmacaoSolicitacao({ titularNome, protocolo, dataLimite, orgNome });
  return enviar({ to, subject: `Solicitação ${protocolo} registrada`, text, html });
}

async function enviarAlertaPrazoDPO({ to, solicitacoes, orgNome }) {
  const { text, html } = tplAlertaPrazoDPO({ solicitacoes, orgNome });
  return enviar({ to, subject: `Alerta de prazo LGPD: ${solicitacoes.length} solicitação(ões)`, text, html });
}

async function enviarRespostaTitular({ to, titularNome, protocolo, respostaTexto, orgNome }) {
  const { text, html } = tplRespostaTitular({ titularNome, protocolo, respostaTexto, orgNome });
  return enviar({ to, subject: `Resposta à sua solicitação ${protocolo}`, text, html });
}

async function enviarRecuperacaoSenha({ to, nome, link, minutos }) {
  const { text, html } = tplRecuperacaoSenha({ nome, link, minutos });
  return enviar({ to, subject: 'Complidata — criar nova senha', text, html });
}

module.exports = {
  enviar,
  enviarRecuperacaoSenha,
  emailConfigurado,
  EmailIndisponivelError,
  caixaMemoria,
  esc,
  mascarar,
  enviarOTP,
  enviarConfirmacaoSolicitacao,
  enviarAlertaPrazoDPO,
  enviarRespostaTitular
};
