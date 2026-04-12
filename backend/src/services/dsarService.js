// DSAR Service — logica de negocio do modulo DSAR.
// Extraida das rotas para permitir reuso em cron jobs e services externos.

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

// Calcula SLA badge: verde (>5d), amarelo (2-5d), vermelho (<2d), vencido
function calcularSLA(dataLimite) {
  const agora = new Date();
  const limite = new Date(dataLimite);
  const diasRestantes = Math.ceil((limite - agora) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return { cor: 'vencido', dias: diasRestantes, label: `Vencido ha ${Math.abs(diasRestantes)} dia(s)` };
  if (diasRestantes < 2) return { cor: 'vermelho', dias: diasRestantes, label: `${diasRestantes} dia(s) restante(s)` };
  if (diasRestantes <= 5) return { cor: 'amarelo', dias: diasRestantes, label: `${diasRestantes} dias restantes` };
  return { cor: 'verde', dias: diasRestantes, label: `${diasRestantes} dias restantes` };
}

function enriquecerSolicitacao(s) {
  return { ...s, sla: calcularSLA(s.dataLimite) };
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
  const dataLimite = new Date(dataRecebimento);
  dataLimite.setDate(dataLimite.getDate() + 15);

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
      dataLimite
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
    select: { id: true, protocolo: true, titularNome: true, dataLimite: true }
  });

  const criticas = [];
  const alertas = [];
  for (const s of solicitacoes) {
    const sla = calcularSLA(s.dataLimite);
    const enriched = { ...s, diasRestantes: sla.dias, cor: sla.cor };
    if (sla.cor === 'vermelho' || sla.cor === 'vencido') criticas.push(enriched);
    else if (sla.cor === 'amarelo') alertas.push(enriched);
  }
  return { criticas, alertas };
}

module.exports = {
  gerarProtocolo,
  calcularSLA,
  enriquecerSolicitacao,
  gerarCodigoOTP,
  criarOtpDSAR,
  validarOtpDSAR,
  consumirOtp,
  criarSolicitacaoApartirDeOtp,
  limparOtpsExpirados,
  getSolicitacoesPorPrazo
};
