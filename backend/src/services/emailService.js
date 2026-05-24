// Email Service — wrapper sobre Resend (HTTPS API) com fallback dev-mode.
//
// Em producao, configure via env vars:
//   RESEND_API_KEY=re_xxxxxxxxxxxx
//   RESEND_FROM="Anonimizador LGPD <nao-responda@dominio-verificado.com>"  // opcional
//   ADMIN_ALERT_EMAIL=admin@dominio.com                                     // opcional
//
// Em dev (sem RESEND_API_KEY configurada), os emails sao logados no console.

const { Resend } = require('resend');

let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.RESEND_API_KEY) return null;
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

const FROM = process.env.RESEND_FROM || 'Anonimizador LGPD <onboarding@resend.dev>';

// Notifica o admin sobre falha de envio. Usa o cliente Resend direto (nao
// a funcao enviar() desta mesma lib) para garantir que nunca ha recursao —
// se o alerta tambem falhar, so loga e desiste.
async function notificarFalhaEnvio(c, { to, subject, err }) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (!adminEmail) return;
  if (to === adminEmail) return; // nao alerta sobre falha de envio para o proprio admin
  try {
    const { data, error } = await c.emails.send({
      from: FROM,
      to: adminEmail,
      subject: '[Complidata] Falha de envio detectada',
      text: `Falha ao enviar email pelo serviço de envio.\n\nDestinatário original: ${to}\nAssunto: ${subject}\nErro: ${err.name || 'unknown'} — ${err.message}\n\nVerifique a chave Resend (RESEND_API_KEY), cota do plano e domínio verificado.`
    });
    if (error) {
      console.error('[emailService] falha ao alertar admin:', error.name, error.message);
      return;
    }
    console.log('[emailService] alerta de falha enviado para', adminEmail, '(id:', data?.id, ')');
  } catch (alertErr) {
    console.error('[emailService] falha ao alertar admin sobre erro de envio:', alertErr.message);
  }
}

async function enviar({ to, subject, text, html }) {
  const c = getClient();
  if (!c) {
    console.log('[emailService:dev]', { to, subject, preview: (text || html || '').slice(0, 200) });
    return { devMode: true };
  }
  let result;
  try {
    result = await c.emails.send({
      from: FROM,
      to: Array.isArray(to) ? to : String(to).split(',').map(s => s.trim()).filter(Boolean),
      subject, text, html
    });
  } catch (netErr) {
    // Erros de rede (timeout, DNS) — o SDK do Resend pode lançar em vez de
    // retornar { error }. Tratado separado pra log identificar a categoria.
    console.error('[emailService] erro de rede para', to, '— code:', netErr.code || netErr.name, '— message:', netErr.message);
    notificarFalhaEnvio(c, { to, subject, err: netErr }); // fire-and-forget
    throw netErr;
  }
  const { data, error } = result;
  if (error) {
    console.error('[emailService] falha API Resend para', to, '— name:', error.name, '— message:', error.message, '— statusCode:', error.statusCode);
    notificarFalhaEnvio(c, { to, subject, err: error }); // fire-and-forget
    const e = new Error(error.message || 'Resend API error');
    e.name = error.name || 'ResendError';
    e.statusCode = error.statusCode;
    throw e;
  }
  console.log('[emailService] enviado:', data?.id, 'para', to);
  return { messageId: data?.id, ...data };
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
<p>Olá, <strong>${titularNome}</strong>.</p>
<p>Seu código de verificação para a solicitação de direitos LGPD junto à <strong>${orgNome}</strong> é:</p>
<div style="background: white; border: 2px dashed #4f46e5; border-radius: 12px; padding: 24px; text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; margin: 24px 0;">${codigo}</div>
<p style="color: #64748b; font-size: 13px;">Este código expira em 10 minutos. Se você não solicitou isto, ignore este email.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${orgNome}</p>
</body></html>`;

  return { text, html };
}

function tplConfirmacaoSolicitacao({ titularNome, protocolo, dataLimite, orgNome }) {
  const prazo = new Date(dataLimite).toLocaleDateString('pt-BR');
  const text = `Olá, ${titularNome}.

Sua solicitação de direitos LGPD foi registrada.

Protocolo: ${protocolo}
Prazo para resposta: ${prazo}

O prazo legal é de 15 dias corridos a partir do recebimento (LGPD Art. 19, parágrafo 1).
Guarde o número do protocolo para acompanhamento.

--
${orgNome}`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #4f46e5; margin: 0 0 16px;">Solicitação registrada</h2>
<p>Olá, <strong>${titularNome}</strong>.</p>
<p>Sua solicitação de direitos LGPD foi registrada com sucesso.</p>
<table style="background: white; border-radius: 12px; padding: 16px; margin: 16px 0; width: 100%; border-collapse: collapse;">
<tr><td style="padding: 8px; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Protocolo</td></tr>
<tr><td style="padding: 0 8px 16px; font-size: 18px; font-weight: 700; color: #0f172a;">${protocolo}</td></tr>
<tr><td style="padding: 8px; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid #f1f5f9;">Prazo para resposta</td></tr>
<tr><td style="padding: 0 8px 8px; font-size: 16px; font-weight: 600; color: #1e293b;">${prazo}</td></tr>
</table>
<p style="color: #64748b; font-size: 13px;">O prazo legal é de 15 dias corridos a partir do recebimento conforme o Art. 19, parágrafo 1 da LGPD. Guarde o número do protocolo para acompanhamento.</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${orgNome}</p>
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
      return `<tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;"><strong>${s.protocolo}</strong> — ${s.titularNome}<br><span style="color: ${cor}; font-size: 12px; font-weight: 600;">${label}</span></td></tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 32px auto; padding: 32px; background: #f8fafc; color: #1e293b;">
<h2 style="color: #dc2626; margin: 0 0 16px;">Alerta de prazo LGPD</h2>
<p><strong>${orgNome}</strong> — as seguintes solicitações de direitos de titulares estão próximas do prazo legal de 15 dias:</p>
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
<p>Olá, <strong>${titularNome}</strong>.</p>
<p>Sua solicitação de protocolo <strong>${protocolo}</strong> foi respondida oficialmente.</p>
<div style="background: white; border-left: 4px solid #16a34a; border-radius: 8px; padding: 20px; margin: 16px 0; white-space: pre-wrap; line-height: 1.6;">${respostaTexto}</div>
<p style="color: #64748b; font-size: 13px;">Caso não esteja satisfeito com a resposta, você tem direito de peticionar diretamente à ANPD (Autoridade Nacional de Proteção de Dados).</p>
<p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">${orgNome}</p>
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

module.exports = {
  enviar,
  enviarOTP,
  enviarConfirmacaoSolicitacao,
  enviarAlertaPrazoDPO,
  enviarRespostaTitular
};
