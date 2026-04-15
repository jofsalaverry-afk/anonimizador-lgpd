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
const { patrulhaSeguranca } = require('./patrulhaSeguranca');

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

// ==================== Job: Retencao LogAuditoria (body redact 90d) ====================
//
// Roda todo dia as 02:00 UTC. Sobrescreve o campo `body` de LogAuditoria
// criados ha mais de 90 dias com um sentinel de redacao. Metadata
// (userId, ip, rota, statusCode, etc.) continua preservada para
// rastreabilidade. O body pode conter dados pessoais (nome/email de
// titular, payloads de DSAR, etc.) e por isso precisa ter retencao
// limitada para evitar acumulo indefinido de PII no log de auditoria.
//
// Idempotente: se rodar 2x no mesmo dia, o segundo run re-sobrescreve o
// mesmo sentinel (no-op semantico). Escala O(n) na primeira execucao e
// O(volume-diario) nas seguintes.
const LOG_BODY_SENTINEL = '<redacted após 90 dias>';

async function jobRetencaoLogAuditoria() {
  console.log('[cron:retencaoLog] inicio');
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const resultado = await prisma.logAuditoria.updateMany({
      where: { criadoEm: { lt: cutoff } },
      data: { body: LOG_BODY_SENTINEL }
    });
    console.log(`[cron:retencaoLog] ${resultado.count} log(s) com body redactado (cutoff ${cutoff.toISOString()})`);
  } catch (err) {
    console.error('[cron:retencaoLog] falha:', err.message);
  }
}

// ==================== Job: Anonimizacao SolicitacaoTitular 5 anos ====================
//
// Roda todo dia as 02:05 UTC. Anonimiza SolicitacaoTitular em estados
// terminais (RESPONDIDA, ENCERRADA, CANCELADA) cuja ultima atualizacao
// foi ha mais de 5 anos. Preserva protocolo, tipoDireito, status e
// datas — o historico de "existiu um DSAR desse tipo" fica para
// demonstracao de compliance; o dado pessoal do titular some.
//
// Filtra por titularNome != sentinel para nao reprocessar linhas ja
// anonimizadas.
const DSAR_ANON_SENTINEL = '[ANONIMIZADO]';
const DSAR_STATUS_TERMINAIS = ['RESPONDIDA', 'ENCERRADA', 'CANCELADA'];
const CINCO_ANOS_EM_MS = 5 * 365 * 24 * 60 * 60 * 1000;

async function jobAnonimizacaoDsarAntigo() {
  console.log('[cron:anonimizaDsar] inicio');
  try {
    const cutoff = new Date(Date.now() - CINCO_ANOS_EM_MS);
    const resultado = await prisma.solicitacaoTitular.updateMany({
      where: {
        status: { in: DSAR_STATUS_TERMINAIS },
        atualizadoEm: { lt: cutoff },
        titularNome: { not: DSAR_ANON_SENTINEL }
      },
      data: {
        titularNome: DSAR_ANON_SENTINEL,
        titularEmail: DSAR_ANON_SENTINEL,
        titularCpf: DSAR_ANON_SENTINEL
      }
    });
    console.log(`[cron:anonimizaDsar] ${resultado.count} solicitacao(oes) anonimizada(s) (cutoff ${cutoff.toISOString()})`);
  } catch (err) {
    console.error('[cron:anonimizaDsar] falha:', err.message);
  }
}

// ==================== Job: Patrulha de seguranca ====================
//
// Roda todo dia as 03:30 UTC. Executa patrulhaSeguranca() que varre
// gaps criticos (middleware de log inativo, soft-delete burlado, DSARs
// vencidos, incidentes parados, retencao de log estourada). Nao escreve
// nada no banco — so detecta e loga. Falhas por check ja sao capturadas
// dentro do proprio modulo; esse wrapper protege contra erro global.
async function jobPatrulhaSeguranca() {
  console.log('[cron:patrulhaSeguranca] inicio');
  try {
    await patrulhaSeguranca();
    console.log('[cron:patrulhaSeguranca] fim');
  } catch (err) {
    console.error('[cron:patrulhaSeguranca] falha global:', err);
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

  // Retencao: LogAuditoria body redact (02:00 UTC)
  cron.schedule('0 2 * * *', jobRetencaoLogAuditoria, {
    timezone: 'UTC'
  });

  // Retencao: SolicitacaoTitular anonimizacao 5 anos (02:05 UTC)
  cron.schedule('5 2 * * *', jobAnonimizacaoDsarAntigo, {
    timezone: 'UTC'
  });

  // Patrulha de seguranca diaria (03:30 UTC)
  cron.schedule('30 3 * * *', jobPatrulhaSeguranca, {
    timezone: 'UTC'
  });

  console.log('[cron] agendado: slaDSAR 09:00 UTC, retencaoLog 02:00 UTC, anonimizaDsar 02:05 UTC, patrulhaSeguranca 03:30 UTC');

  // Em dev, permite forcar execucao imediata via env var
  if (process.env.RUN_CRON_ON_BOOT === 'true') {
    console.log('[cron] executando jobs na inicializacao (RUN_CRON_ON_BOOT=true)');
    jobSlaDSAR().catch(err => console.error(err));
    jobRetencaoLogAuditoria().catch(err => console.error(err));
    jobAnonimizacaoDsarAntigo().catch(err => console.error(err));
    jobPatrulhaSeguranca().catch(err => console.error(err));
  }
}

module.exports = { iniciarCron, jobSlaDSAR, jobRetencaoLogAuditoria, jobAnonimizacaoDsarAntigo, jobPatrulhaSeguranca };
