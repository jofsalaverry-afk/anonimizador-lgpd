// Relatorio diario — coleta metricas agregadas do dia anterior e
// formata payload pronto para envio por email. Idempotente: so le
// do banco, nao escreve.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function faixaOntem() {
  const ontemInicio = new Date();
  ontemInicio.setDate(ontemInicio.getDate() - 1);
  ontemInicio.setHours(0, 0, 0, 0);
  const ontemFim = new Date(ontemInicio);
  ontemFim.setDate(ontemFim.getDate() + 1);
  return { inicio: ontemInicio, fim: ontemFim };
}

async function gerarRelatorioDiario() {
  const { inicio, fim } = faixaOntem();
  const agora = new Date();

  const [
    criadasOntem,
    respondidasOntem,
    otpsOntem,
    abertasPorStatus,
    vencidas
  ] = await Promise.all([
    prisma.solicitacaoTitular.count({
      where: { criadoEm: { gte: inicio, lt: fim } }
    }),
    prisma.solicitacaoTitular.count({
      where: { dataResposta: { gte: inicio, lt: fim } }
    }),
    prisma.dsarOtp.count({
      where: { criadoEm: { gte: inicio, lt: fim } }
    }),
    prisma.solicitacaoTitular.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.solicitacaoTitular.count({
      where: {
        status: { in: ['AGUARDANDO_VERIFICACAO', 'RECEBIDA', 'EM_ANALISE'] },
        dataLimite: { lt: agora, not: null }
      }
    })
  ]);

  const porStatus = Object.fromEntries(abertasPorStatus.map(r => [r.status, r._count._all]));

  return {
    referencia: inicio.toLocaleDateString('pt-BR'),
    criadasOntem,
    respondidasOntem,
    otpsOntem,
    porStatus,
    vencidas
  };
}

function formatarRelatorio(m) {
  const statusLinhas = Object.entries(m.porStatus)
    .map(([s, c]) => `  - ${s}: ${c}`)
    .join('\n') || '  (nenhuma)';

  const text = [
    `Relatorio diario Complidata — referencia ${m.referencia}`,
    ``,
    `Movimento de ontem:`,
    `  DSARs criadas: ${m.criadasOntem}`,
    `  DSARs respondidas: ${m.respondidasOntem}`,
    `  OTPs solicitados: ${m.otpsOntem}`,
    ``,
    `Situacao atual:`,
    `  DSARs vencidas: ${m.vencidas}`,
    `  Distribuicao por status:`,
    statusLinhas
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#222">
      <h2 style="color:#1d4ed8;border-bottom:2px solid #1d4ed8;padding-bottom:8px">Relatório diário Complidata</h2>
      <p style="color:#6b7280">Referência: <strong>${m.referencia}</strong></p>
      <h3>Movimento de ontem</h3>
      <ul>
        <li>DSARs criadas: <strong>${m.criadasOntem}</strong></li>
        <li>DSARs respondidas: <strong>${m.respondidasOntem}</strong></li>
        <li>OTPs solicitados: <strong>${m.otpsOntem}</strong></li>
      </ul>
      <h3>Situação atual</h3>
      <p>DSARs vencidas: <strong style="color:${m.vencidas > 0 ? '#b91c1c' : '#16a34a'}">${m.vencidas}</strong></p>
      <p>Distribuição por status:</p>
      <ul>
        ${Object.entries(m.porStatus).map(([s, c]) => `<li>${s}: <strong>${c}</strong></li>`).join('') || '<li><em>nenhuma</em></li>'}
      </ul>
    </div>
  `;

  return { text, html };
}

module.exports = { gerarRelatorioDiario, formatarRelatorio };
