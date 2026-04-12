// Cron Jobs — tarefas agendadas do sistema.
//
// Uso no server.js:
//   const { iniciarCron } = require('./services/cronJobs');
//   iniciarCron();
//
// Todos os jobs sao idempotentes e tolerantes a falha — erros sao
// logados mas nao derrubam o processo.

const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { limparOtpsExpirados, getSolicitacoesPorPrazo } = require('./dsarService');
const { enviarAlertaPrazoDPO } = require('./emailService');

const prisma = new PrismaClient();

// ==================== Job: DSAR SLA diario ====================
//
// Roda todo dia as 09:00 UTC (06:00 BRT / America/Sao_Paulo).
// Varre todas as organizacoes com o modulo DSAR ativo, identifica
// solicitacoes proximas do prazo legal de 15 dias e:
//   1. Gera AlertaConformidade (persistido, idempotente)
//   2. Envia email ao DPO (usuario com perfil ENCARREGADO_LGPD) ou
//      ao gestor (perfil GESTOR) se nao houver DPO.
async function jobSlaDSAR() {
  console.log('[cron:slaDSAR] inicio');
  try {
    const orgs = await prisma.organizacao.findMany({
      where: {
        ativo: true,
        modulosAtivos: { has: 'dsar' }
      },
      select: { id: true, nome: true }
    });

    for (const org of orgs) {
      try {
        const { criticas, alertas } = await getSolicitacoesPorPrazo(org.id);
        const urgentes = [...criticas, ...alertas];
        if (urgentes.length === 0) continue;

        // Cria AlertaConformidade para cada urgente (idempotente)
        const existentes = await prisma.alertaConformidade.findMany({
          where: { organizacaoId: org.id, tipo: 'DSAR_PRAZO', lido: false },
          select: { referenciaId: true }
        });
        const jaAlertados = new Set(existentes.map(e => e.referenciaId));

        for (const s of urgentes) {
          if (jaAlertados.has(s.id)) continue;
          await prisma.alertaConformidade.create({
            data: {
              organizacaoId: org.id,
              tipo: 'DSAR_PRAZO',
              mensagem: s.cor === 'vencido'
                ? `Solicitacao ${s.protocolo} vencida ha ${Math.abs(s.diasRestantes)} dia(s)`
                : `Solicitacao ${s.protocolo} vence em ${s.diasRestantes} dia(s)`,
              criticidade: (s.cor === 'vermelho' || s.cor === 'vencido') ? 'ALTA' : 'MEDIA',
              referenciaId: s.id
            }
          });
        }

        // Busca DPO (ou gestor como fallback) da org
        const dpo = await prisma.usuario.findFirst({
          where: { organizacaoId: org.id, ativo: true, perfil: 'ENCARREGADO_LGPD' },
          select: { email: true, nome: true }
        });
        const responsavel = dpo || await prisma.usuario.findFirst({
          where: { organizacaoId: org.id, ativo: true, perfil: 'GESTOR' },
          select: { email: true, nome: true }
        });

        if (!responsavel) {
          console.warn(`[cron:slaDSAR] org ${org.nome} sem DPO/gestor ativo — ${urgentes.length} solicitacao(oes) urgentes`);
          continue;
        }

        // Envia email consolidado
        await enviarAlertaPrazoDPO({
          to: responsavel.email,
          orgNome: org.nome,
          solicitacoes: urgentes
        });

        console.log(`[cron:slaDSAR] ${org.nome}: ${urgentes.length} urgente(s), email para ${responsavel.email}`);
      } catch (err) {
        console.error(`[cron:slaDSAR] erro na org ${org.nome}:`, err.message);
      }
    }

    // Limpeza de OTPs expirados
    const removidos = await limparOtpsExpirados();
    if (removidos > 0) console.log(`[cron:slaDSAR] ${removidos} OTP(s) expirado(s) removido(s)`);

    console.log('[cron:slaDSAR] fim');
  } catch (err) {
    console.error('[cron:slaDSAR] falha global:', err);
  }
}

// ==================== Registro ====================

function iniciarCron() {
  if (process.env.DISABLE_CRON === 'true') {
    console.log('[cron] desabilitado por env var DISABLE_CRON=true');
    return;
  }

  // Roda todo dia as 09:00 UTC (06:00 America/Sao_Paulo)
  // Formato cron: minuto hora dia-mes mes dia-semana
  cron.schedule('0 9 * * *', jobSlaDSAR, {
    timezone: 'UTC'
  });

  console.log('[cron] agendado: slaDSAR diario as 09:00 UTC');

  // Em dev, permite forcar execucao imediata via env var
  if (process.env.RUN_CRON_ON_BOOT === 'true') {
    console.log('[cron] executando slaDSAR na inicializacao (RUN_CRON_ON_BOOT=true)');
    jobSlaDSAR().catch(err => console.error(err));
  }
}

module.exports = { iniciarCron, jobSlaDSAR };
