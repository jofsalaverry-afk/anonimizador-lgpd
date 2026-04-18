// Handlers de observabilidade — uptime, DB, memoria e metricas de negocio.
// Montados em server.js com adminAuth. Nao expor sem autenticacao.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function proximoRelatorio() {
  const agora = new Date();
  const proximo = new Date(agora);
  proximo.setUTCHours(11, 0, 0, 0);
  if (agora.getUTCHours() >= 11) proximo.setUTCDate(proximo.getUTCDate() + 1);
  return proximo.toISOString();
}

async function getStatus(req, res) {
  const inicio = Date.now();
  try {
    const dbInicio = Date.now();
    await prisma.$queryRaw`SELECT 1 as ping`;
    const dbLatency = Date.now() - dbInicio;
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

    res.json({
      uptime: formatUptime(process.uptime()),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      database: { connected: true, latency: `${dbLatency}ms`, healthy: dbLatency < 200 },
      memory: { used: `${heapMB}MB`, total: `${Math.round(mem.heapTotal / 1024 / 1024)}MB` },
      cron: { jobsAtivos: 5, proximoRelatorio: proximoRelatorio() },
      responseTime: `${Date.now() - inicio}ms`,
      timestamp: new Date().toISOString(),
      healthy: dbLatency < 200 && heapMB < 300
    });
  } catch (err) {
    console.error('[observability:status]', err.message);
    res.status(503).json({
      uptime: formatUptime(process.uptime()),
      database: { connected: false, error: err.message },
      healthy: false,
      timestamp: new Date().toISOString()
    });
  }
}

async function getMetrics(req, res) {
  const inicio = Date.now();
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const agora = new Date();

    const [dsarsByStatus, totalUsuarios, totalOrgs, otpsHoje, dsarsVencidas, ultimoOtp] = await Promise.all([
      prisma.solicitacaoTitular.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.usuario.count({ where: { ativo: true } }),
      prisma.organizacao.count(),
      prisma.dsarOtp.count({ where: { criadoEm: { gte: hoje } } }),
      prisma.solicitacaoTitular.count({
        where: {
          status: { in: ['AGUARDANDO_VERIFICACAO', 'RECEBIDA', 'EM_ANALISE'] },
          dataLimite: { lt: agora, not: null }
        }
      }),
      prisma.dsarOtp.findFirst({ where: { usado: true }, orderBy: { criadoEm: 'desc' }, select: { criadoEm: true } })
    ]);

    const porStatus = dsarsByStatus.reduce((acc, r) => { acc[r.status] = r._count.status; return acc; }, {});
    const total = dsarsByStatus.reduce((sum, r) => sum + r._count.status, 0);

    res.json({
      dsars: { porStatus, vencidas: dsarsVencidas, total },
      atividade: { usuariosAtivos: totalUsuarios, organizacoes: totalOrgs, otpsHoje },
      sistema: {
        ultimoOtpConsumido: ultimoOtp?.criadoEm || null,
        responseTime: `${Date.now() - inicio}ms`
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[observability:metrics]', err.message);
    res.status(500).json({ erro: 'Falha ao coletar métricas', details: err.message });
  }
}

module.exports = { getStatus, getMetrics };
