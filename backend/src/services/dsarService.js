// DSAR Service — logica de negocio do modulo DSAR.
// Extraida das rotas para permitir reuso em cron jobs e services externos.

const crypto = require('crypto');
const { prisma } = require('../db');
const { dataPura, hojeSP, isoDiaSP } = require('./datas');

// ==================== Protocolo ====================

// Gera protocolo sequencial: SIGLA-ANO-SEQ (ex: CMP-2026-001)
async function gerarProtocolo(organizacaoId) {
  const org = await prisma.organizacao.findUnique({
    where: { id: organizacaoId },
    select: { nome: true }
  });
  const palavras = (org?.nome || 'ORG')
    .replace(/^(Camara|Câmara)\s+(Municipal\s+)?(de\s+|do\s+|da\s+)?/i, '')
    .split(/\s+/)
    .filter(Boolean);

  let sigla;
  if (palavras.length === 0) sigla = 'ORG';
  else if (palavras.length === 1) sigla = palavras[0].slice(0, 3).toUpperCase();
  else sigla = palavras.slice(0, 3).map(p => p[0]).join('').toUpperCase();

  const ano = new Date().getFullYear();
  const inicioAno = new Date(`${ano}-01-01T00:00:00.000Z`);
  const fimAno = new Date(`${ano + 1}-01-01T00:00:00.000Z`);

  const count = await prisma.solicitacaoTitular.count({
    where: {
      organizacaoId,
      criadoEm: { gte: inicioAno, lt: fimAno }
    }
  });

  const seq = String(count + 1).padStart(3, '0');
  return `${sigla}-${ano}-${seq}`;
}

// ==================== SLA ====================

// Etapa 7b: situacao do prazo calculada pelo STATUS da solicitacao.
// Aceita a solicitacao (ou, por compatibilidade, so a dataLimite).
// Dias contados no calendario de Sao Paulo (dia do prazo - hoje).
// cor: verde (>5d), amarelo (2-5d), vermelho (0-1d), vencido, sem-prazo, encerrado
function diasAte(dataLimite, agora = new Date()) {
  const limite = dataPura(isoDiaSP(dataLimite));
  return Math.round((limite - hojeSP(agora)) / 86400000);
}
const plural = (n, um, varios) => (n === 1 ? um : varios);
function calcularSLA(s, agora = new Date()) {
  const sol = s && typeof s === 'object' && !(s instanceof Date) ? s : { dataLimite: s, status: 'EM_ANALISE' };
  const { status, dataLimite, dataResposta } = sol;
  if (status === 'CANCELADA') return { cor: 'encerrado', dias: null, label: 'Cancelada' };
  if (dataResposta && ['RESPONDIDA', 'ENCERRADA'].includes(status)) {
    if (!dataLimite) return { cor: 'encerrado', dias: null, label: 'Respondido' };
    const noPrazo = new Date(dataResposta) <= new Date(dataLimite);
    return { cor: noPrazo ? 'verde' : 'vencido', dias: null, noPrazo, label: noPrazo ? 'Respondido no prazo' : 'Respondido fora do prazo' };
  }
  if (status === 'ENCERRADA') return { cor: 'encerrado', dias: null, label: 'Encerrada sem resposta registrada' };
  if (!dataLimite) return { cor: 'sem-prazo', dias: null, label: 'Aguardando verificação de identidade (prazo ainda não iniciado)' };
  const dias = diasAte(dataLimite, agora);
  if (dias < 0) return { cor: 'vencido', dias, label: `Vencido há ${-dias} ${plural(-dias, 'dia', 'dias')}` };
  if (dias === 0) return { cor: 'vermelho', dias, label: 'Vence hoje' };
  if (dias < 2) return { cor: 'vermelho', dias, label: '1 dia restante' };
  return { cor: dias <= 5 ? 'amarelo' : 'verde', dias, label: `${dias} dias restantes` };
}

// Prazo legal: 15 dias corridos a partir da verificacao da identidade
// (mesma regra no canal publico e no cadastro interno).
const DIAS_PRAZO = 15;
function prazoAPartirDe(inicio) {
  const d = new Date(inicio);
  d.setDate(d.getDate() + DIAS_PRAZO);
  return d;
}

// Texto da resposta que ainda e rascunho: marca MINUTA ou campo [entre colchetes]
function erroTextoResposta(texto) {
  if (/\bMINUTA\b/i.test(texto)) return 'A resposta ainda contém a marca "MINUTA". Revise o texto e retire a marca antes de enviar.';
  const campo = texto.match(/\[[^\]\n]{1,200}\]/);
  if (campo) return `A resposta ainda tem campo a preencher entre colchetes: ${campo[0]}. Complete o texto antes de enviar.`;
  return null;
}

// identidade: { verificada, metodo, em, observacao }. Pedidos anteriores a
// Etapa 6c sem os campos novos usam a evidencia VERIFICACAO_IDENTIDADE.
function identidadeDe(s) {
  if (s.identidadeVerificadaEm) {
    return { verificada: true, metodo: s.identidadeMetodo, em: s.identidadeVerificadaEm, observacao: s.identidadeObservacao || null };
  }
  const ev = (s.evidencias || []).find(e => e.tipo === 'VERIFICACAO_IDENTIDADE');
  return ev ? { verificada: true, metodo: null, em: ev.criadoEm, observacao: null } : { verificada: false };
}

function enriquecerSolicitacao(s) {
  return { ...s, sla: calcularSLA(s), identidade: identidadeDe(s) };
}

// ==================== OTP ====================

// Gera codigo OTP de 6 digitos numericos
function gerarCodigoOTP() {
  return String(crypto.randomInt(100000, 1000000));
}

// Cria um OTP para uma solicitacao pendente. TTL 10 minutos.
async function criarOtpDSAR({ organizacaoId, email, titularNome, titularCpf, tipoDireito, descricao }) {
  const codigo = gerarCodigoOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Invalida OTPs anteriores nao usados para o mesmo email+org
  await prisma.dsarOtp.updateMany({
    where: { organizacaoId, email, usado: false },
    data: { usado: true }
  });

  const otp = await prisma.dsarOtp.create({
    data: {
      organizacaoId,
      email,
      codigo,
      titularNome,
      titularCpf: titularCpf || null,
      tipoDireito,
      descricao,
      expiresAt
    }
  });
  return otp;
}

// Valida OTP: encontra pelo (email, codigo) nao usado e nao expirado
async function validarOtpDSAR({ email, codigo }) {
  const otp = await prisma.dsarOtp.findFirst({
    where: {
      email,
      codigo,
      usado: false,
      expiresAt: { gt: new Date() }
    }
  });
  return otp;
}

// Marca OTP como usado (uso unico)
async function consumirOtp(otpId) {
  await prisma.dsarOtp.update({
    where: { id: otpId },
    data: { usado: true }
  });
}

// Cria a solicitacao oficial a partir de um OTP validado
async function criarSolicitacaoApartirDeOtp(otp) {
  const protocolo = await gerarProtocolo(otp.organizacaoId);
  const dataRecebimento = new Date();

  const solicitacao = await prisma.solicitacaoTitular.create({
    data: {
      organizacaoId: otp.organizacaoId,
      protocolo,
      titularNome: otp.titularNome,
      titularEmail: otp.email,
      titularCpf: otp.titularCpf,
      tipoDireito: otp.tipoDireito,
      descricao: otp.descricao,
      dataRecebimento,
      status: 'AGUARDANDO_VERIFICACAO',
      // Etapa 6c: o titular confirmou o codigo enviado ao e-mail
      identidadeVerificadaEm: dataRecebimento,
      identidadeMetodo: 'CODIGO_EMAIL'
    }
  });

  await consumirOtp(otp.id);
  return solicitacao;
}

// Limpa OTPs expirados (chamado pelo cron)
async function limparOtpsExpirados() {
  const result = await prisma.dsarOtp.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  return result.count;
}

// ==================== SLA batch ====================

// Retorna solicitacoes de uma org agrupadas por criticidade de prazo.
async function getSolicitacoesPorPrazo(organizacaoId) {
  const solicitacoes = await prisma.solicitacaoTitular.findMany({
    where: {
      organizacaoId,
      status: { in: ['RECEBIDA', 'EM_ANALISE'] }
    },
    select: { id: true, protocolo: true, titularNome: true, dataLimite: true, status: true, dataResposta: true }
  });

  const criticas = [];
  const alertas = [];
  for (const s of solicitacoes) {
    const sla = calcularSLA(s);
    const enriched = { ...s, diasRestantes: sla.dias, cor: sla.cor };
    if (sla.cor === 'vermelho' || sla.cor === 'vencido') criticas.push(enriched);
    else if (sla.cor === 'amarelo') alertas.push(enriched);
  }
  return { criticas, alertas };
}

module.exports = {
  gerarProtocolo,
  calcularSLA,
  identidadeDe,
  prazoAPartirDe,
  erroTextoResposta,
  DIAS_PRAZO,
  enriquecerSolicitacao,
  gerarCodigoOTP,
  criarOtpDSAR,
  validarOtpDSAR,
  consumirOtp,
  criarSolicitacaoApartirDeOtp,
  limparOtpsExpirados,
  getSolicitacoesPorPrazo
};
