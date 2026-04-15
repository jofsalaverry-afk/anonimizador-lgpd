const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function patrulhaSeguranca() {
  const alertas = [];
  const agora = new Date();
  const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000);
  const setentaDuasHorasAtras = new Date(agora.getTime() - 72 * 60 * 60 * 1000);
  const noventaDiasAtras = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);

  // 1. Nenhum log de auditoria na última hora — sinal de middleware inativo.
  try {
    const logsUltimaHora = await prisma.logAuditoria.count({
      where: { criadoEm: { gte: umaHoraAtras } }
    });
    if (logsUltimaHora === 0) {
      alertas.push('Nenhum log de auditoria na última hora — middleware pode estar inativo');
    }
  } catch (e) {
    alertas.push(`Falha ao verificar LogAuditoria: ${e.message}`);
  }

  // 2. Usuários soft-deletados com atividade posterior à deleção.
  // Prisma não compara duas colunas no where, então filtro em JS.
  try {
    const deletados = await prisma.usuario.findMany({
      where: { deletedAt: { not: null }, ultimoAcesso: { not: null } },
      select: { id: true, email: true, deletedAt: true, ultimoAcesso: true }
    });
    const comAtividade = deletados.filter(u => u.ultimoAcesso > u.deletedAt);
    if (comAtividade.length > 0) {
      const lista = comAtividade.map(u => u.email).join(', ');
      alertas.push(`${comAtividade.length} usuário(s) soft-deletado(s) com acesso após deleção: ${lista}`);
    }
  } catch (e) {
    alertas.push(`Falha ao verificar usuários deletados: ${e.message}`);
  }

  // 3. DSARs vencidos sem resposta (SLA de 15 dias já embutido em dataLimite).
  try {
    const vencidos = await prisma.solicitacaoTitular.count({
      where: {
        dataLimite: { lt: agora },
        dataResposta: null,
        status: { notIn: ['RESPONDIDA', 'ENCERRADA', 'CANCELADA'] }
      }
    });
    if (vencidos > 0) {
      alertas.push(`${vencidos} DSAR(s) vencido(s) sem resposta — SLA de 15 dias estourado`);
    }
  } catch (e) {
    alertas.push(`Falha ao verificar DSARs vencidos: ${e.message}`);
  }

  // 4. Incidentes ABERTOS sem atualização há mais de 72h.
  try {
    const incidentesParados = await prisma.incidente.count({
      where: {
        status: 'ABERTO',
        atualizadoEm: { lt: setentaDuasHorasAtras }
      }
    });
    if (incidentesParados > 0) {
      alertas.push(`${incidentesParados} incidente(s) aberto(s) há +72h sem atualização`);
    }
  } catch (e) {
    alertas.push(`Falha ao verificar incidentes: ${e.message}`);
  }

  // 5. Logs de auditoria com +90 dias ainda presentes — rotina de purga falhou.
  try {
    const logsAntigos = await prisma.logAuditoria.count({
      where: { criadoEm: { lt: noventaDiasAtras } }
    });
    if (logsAntigos > 0) {
      alertas.push(`${logsAntigos} log(s) de auditoria com +90 dias ainda presentes — verificar rotina de purga`);
    }
  } catch (e) {
    alertas.push(`Falha ao verificar retenção de logs: ${e.message}`);
  }

  if (alertas.length === 0) {
    console.log('✅ Patrulha de segurança — tudo OK');
  } else {
    console.log(`🚨 Patrulha de segurança — ${alertas.length} alerta(s):`);
    for (const a of alertas) console.log(`  - ${a}`);
  }

  return alertas;
}

module.exports = { patrulhaSeguranca };
