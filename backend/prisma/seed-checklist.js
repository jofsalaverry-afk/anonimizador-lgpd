// Seed dos 20 itens iniciais do checklist de conformidade LGPD.
// Executar: node prisma/seed-checklist.js
// Idempotente — usa upsert por codigo.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ITENS = [
  // ==== ROPA (Inventario de Tratamento) — LGPD Art. 37 ====
  {
    codigo: 'ROPA-01', categoria: 'ROPA', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Registro de operacoes de tratamento',
    descricao: 'A organizacao mantem registro atualizado de todas as operacoes de tratamento de dados pessoais realizadas.',
    fundamentoLegal: 'LGPD Art. 37',
    evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'ROPA-02', categoria: 'ROPA', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Base legal documentada por tratamento',
    descricao: 'Cada tratamento registrado indica a base legal aplicavel (consentimento, obrigacao legal, execucao de contrato, etc.).',
    fundamentoLegal: 'LGPD Art. 7 e 37',
    evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'ROPA-03', categoria: 'ROPA', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Categorias de dados e titulares mapeadas',
    descricao: 'Para cada tratamento, estao mapeadas as categorias de dados pessoais e os tipos de titulares envolvidos.',
    fundamentoLegal: 'LGPD Art. 37, I-III',
    evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'ROPA-04', categoria: 'ROPA', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Prazo de retencao e forma de descarte',
    descricao: 'O ROPA inclui o prazo de retencao dos dados e a forma prevista para descarte apos o termino do tratamento.',
    fundamentoLegal: 'LGPD Art. 16 e 37',
    evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'ROPA-05', categoria: 'ROPA', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Compartilhamentos com terceiros registrados',
    descricao: 'Todos os compartilhamentos de dados com terceiros estao registrados, incluindo finalidade e pais destino.',
    fundamentoLegal: 'LGPD Art. 33 e 37',
    evidenciaRequerida: 'LINK_SISTEMA'
  },

  // ==== DSAR (Direitos dos Titulares) — LGPD Art. 18 ====
  {
    codigo: 'DSAR-01', categoria: 'DSAR', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Canal publico para exercicio de direitos',
    descricao: 'A organizacao disponibiliza canal acessivel para que titulares exercam seus direitos previstos na LGPD.',
    fundamentoLegal: 'LGPD Art. 18',
    evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'DSAR-02', categoria: 'DSAR', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Prazo de 15 dias monitorado',
    descricao: 'Solicitacoes de titulares sao respondidas em ate 15 dias corridos, com monitoramento de SLA.',
    fundamentoLegal: 'LGPD Art. 19, paragrafo 1',
    evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'DSAR-03', categoria: 'DSAR', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Identificacao e autenticacao do titular',
    descricao: 'Existe procedimento para verificar a identidade do titular antes de fornecer dados ou realizar alteracoes.',
    fundamentoLegal: 'LGPD Art. 18, paragrafo 5',
    evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'DSAR-04', categoria: 'DSAR', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Registro imutavel de evidencias',
    descricao: 'Toda interacao com o titular durante a solicitacao e registrada de forma imutavel com hash de integridade.',
    fundamentoLegal: 'LGPD Art. 37 e 38',
    evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'DSAR-05', categoria: 'DSAR', criticidade: 'BAIXA', obrigatorio: false,
    titulo: 'Modelos de resposta padronizados',
    descricao: 'A organizacao dispoe de modelos padronizados de resposta para cada tipo de direito previsto no Art. 18.',
    fundamentoLegal: 'LGPD Art. 18',
    evidenciaRequerida: 'DOCUMENTO'
  },

  // ==== SEG (Medidas de Seguranca) — LGPD Art. 46 ====
  {
    codigo: 'SEG-01', categoria: 'Seguranca', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Controle de acesso com autenticacao forte',
    descricao: 'O acesso aos sistemas de tratamento de dados exige autenticacao (senha forte, e desejavel MFA).',
    fundamentoLegal: 'LGPD Art. 46',
    evidenciaRequerida: 'CAPTURA'
  },
  {
    codigo: 'SEG-02', categoria: 'Seguranca', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Criptografia em transito (HTTPS/TLS)',
    descricao: 'Toda comunicacao com os sistemas da organizacao ocorre sob HTTPS/TLS atualizado.',
    fundamentoLegal: 'LGPD Art. 46',
    evidenciaRequerida: 'CAPTURA'
  },
  {
    codigo: 'SEG-03', categoria: 'Seguranca', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Backup regular e testado',
    descricao: 'Dados pessoais possuem rotina de backup regular com testes periodicos de restauracao.',
    fundamentoLegal: 'LGPD Art. 46 e 49',
    evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'SEG-04', categoria: 'Seguranca', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Trilha de auditoria imutavel',
    descricao: 'Acoes criticas sobre dados pessoais geram registros de auditoria imutaveis (quem, quando, o que).',
    fundamentoLegal: 'LGPD Art. 46 e 37',
    evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'SEG-05', categoria: 'Seguranca', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Plano de resposta a incidentes',
    descricao: 'A organizacao possui plano formal de resposta a incidentes de seguranca com dados pessoais.',
    fundamentoLegal: 'LGPD Art. 48 e 50',
    evidenciaRequerida: 'DOCUMENTO'
  },

  // ==== GOV (Governanca e Bases Legais) — LGPD Arts. 6 e 7 ====
  {
    codigo: 'GOV-01', categoria: 'Governanca', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Encarregado de dados (DPO) designado',
    descricao: 'A organizacao designou formalmente um Encarregado de Protecao de Dados, com contato publico.',
    fundamentoLegal: 'LGPD Art. 41',
    evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'GOV-02', categoria: 'Governanca', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Politica de privacidade publicada',
    descricao: 'Existe politica de privacidade publica, clara e acessivel, alinhada aos arts. 6 e 9 da LGPD.',
    fundamentoLegal: 'LGPD Art. 6, 8 e 9',
    evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'GOV-03', categoria: 'Governanca', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Principio da finalidade aplicado',
    descricao: 'Os tratamentos sao realizados somente para finalidades especificas, explicitas e informadas ao titular.',
    fundamentoLegal: 'LGPD Art. 6, I',
    evidenciaRequerida: 'AUTO_DECLARACAO'
  },
  {
    codigo: 'GOV-04', categoria: 'Governanca', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Principio da necessidade (minimizacao)',
    descricao: 'Sao coletados apenas os dados minimos necessarios para cumprir a finalidade declarada.',
    fundamentoLegal: 'LGPD Art. 6, III',
    evidenciaRequerida: 'AUTO_DECLARACAO'
  },
  {
    codigo: 'GOV-05', categoria: 'Governanca', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Capacitacao periodica dos colaboradores',
    descricao: 'Colaboradores que tratam dados pessoais recebem capacitacao periodica sobre LGPD e boas praticas.',
    fundamentoLegal: 'LGPD Art. 50, I, g',
    evidenciaRequerida: 'DOCUMENTO'
  }
];

async function main() {
  console.log(`Populando ${ITENS.length} itens do checklist...`);
  for (const item of ITENS) {
    await prisma.itemChecklist.upsert({
      where: { codigo: item.codigo },
      update: item,
      create: item
    });
  }
  const total = await prisma.itemChecklist.count();
  console.log(`Ok — total de itens no banco: ${total}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
