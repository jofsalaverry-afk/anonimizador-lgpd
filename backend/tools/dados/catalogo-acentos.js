// Item 6 pos-Ensaio 1: titulos e descricoes do catalogo global que estao em
// producao SEM acento (carga antiga de prisma/seed-checklist.js, antes da
// etapa 6c). "antigo" e o texto exato gravado pela carga antiga; "novo" e o
// MESMO texto so com a ortografia corrigida (sem as revisoes de conteudo da
// etapa 6c, que mudariam o sentido de itens ja respondidos pelas camaras).
// Usado por tools/producao-pos-deploy.js catalogo.
module.exports = [
  { codigo: 'ROPA-01', campo: 'titulo', antigo: "Registro de operacoes de tratamento", novo: "Registro de operações de tratamento" },
  { codigo: 'ROPA-01', campo: 'descricao', antigo: "A organizacao mantem registro atualizado de todas as operacoes de tratamento de dados pessoais realizadas.", novo: "A organização mantém registro atualizado de todas as operações de tratamento de dados pessoais realizadas." },
  { codigo: 'ROPA-02', campo: 'descricao', antigo: "Cada tratamento registrado indica a base legal aplicavel (consentimento, obrigacao legal, execucao de contrato, etc.).", novo: "Cada tratamento registrado indica a base legal aplicável (consentimento, obrigação legal, execução de contrato, etc.)." },
  { codigo: 'ROPA-03', campo: 'descricao', antigo: "Para cada tratamento, estao mapeadas as categorias de dados pessoais e os tipos de titulares envolvidos.", novo: "Para cada tratamento, estão mapeadas as categorias de dados pessoais e os tipos de titulares envolvidos." },
  { codigo: 'ROPA-04', campo: 'titulo', antigo: "Prazo de retencao e forma de descarte", novo: "Prazo de retenção e forma de descarte" },
  { codigo: 'ROPA-04', campo: 'descricao', antigo: "O ROPA inclui o prazo de retencao dos dados e a forma prevista para descarte apos o termino do tratamento.", novo: "O ROPA inclui o prazo de retenção dos dados e a forma prevista para descarte após o término do tratamento." },
  { codigo: 'ROPA-05', campo: 'descricao', antigo: "Todos os compartilhamentos de dados com terceiros estao registrados, incluindo finalidade e pais destino.", novo: "Todos os compartilhamentos de dados com terceiros estão registrados, incluindo finalidade e país destino." },
  { codigo: 'DSAR-01', campo: 'titulo', antigo: "Canal publico para exercicio de direitos", novo: "Canal público para exercício de direitos" },
  { codigo: 'DSAR-01', campo: 'descricao', antigo: "A organizacao disponibiliza canal acessivel para que titulares exercam seus direitos previstos na LGPD.", novo: "A organização disponibiliza canal acessível para que titulares exerçam seus direitos previstos na LGPD." },
  { codigo: 'DSAR-02', campo: 'descricao', antigo: "Solicitacoes de titulares sao respondidas em ate 15 dias corridos, com monitoramento de SLA.", novo: "Solicitações de titulares são respondidas em até 15 dias corridos, com monitoramento de SLA." },
  { codigo: 'DSAR-03', campo: 'titulo', antigo: "Identificacao e autenticacao do titular", novo: "Identificação e autenticação do titular" },
  { codigo: 'DSAR-03', campo: 'descricao', antigo: "Existe procedimento para verificar a identidade do titular antes de fornecer dados ou realizar alteracoes.", novo: "Existe procedimento para verificar a identidade do titular antes de fornecer dados ou realizar alterações." },
  { codigo: 'DSAR-04', campo: 'titulo', antigo: "Registro imutavel de evidencias", novo: "Registro imutável de evidências" },
  { codigo: 'DSAR-04', campo: 'descricao', antigo: "Toda interacao com o titular durante a solicitacao e registrada de forma imutavel com hash de integridade.", novo: "Toda interação com o titular durante a solicitação é registrada de forma imutável com hash de integridade." },
  { codigo: 'DSAR-05', campo: 'descricao', antigo: "A organizacao dispoe de modelos padronizados de resposta para cada tipo de direito previsto no Art. 18.", novo: "A organização dispõe de modelos padronizados de resposta para cada tipo de direito previsto no Art. 18." },
  { codigo: 'SEG-01', campo: 'titulo', antigo: "Controle de acesso com autenticacao forte", novo: "Controle de acesso com autenticação forte" },
  { codigo: 'SEG-01', campo: 'descricao', antigo: "O acesso aos sistemas de tratamento de dados exige autenticacao (senha forte, e desejavel MFA).", novo: "O acesso aos sistemas de tratamento de dados exige autenticação (senha forte, é desejável MFA)." },
  { codigo: 'SEG-02', campo: 'titulo', antigo: "Criptografia em transito (HTTPS/TLS)", novo: "Criptografia em trânsito (HTTPS/TLS)" },
  { codigo: 'SEG-02', campo: 'descricao', antigo: "Toda comunicacao com os sistemas da organizacao ocorre sob HTTPS/TLS atualizado.", novo: "Toda comunicação com os sistemas da organização ocorre sob HTTPS/TLS atualizado." },
  { codigo: 'SEG-03', campo: 'descricao', antigo: "Dados pessoais possuem rotina de backup regular com testes periodicos de restauracao.", novo: "Dados pessoais possuem rotina de backup regular com testes periódicos de restauração." },
  { codigo: 'SEG-04', campo: 'titulo', antigo: "Trilha de auditoria imutavel", novo: "Trilha de auditoria imutável" },
  { codigo: 'SEG-04', campo: 'descricao', antigo: "Acoes criticas sobre dados pessoais geram registros de auditoria imutaveis (quem, quando, o que).", novo: "Ações críticas sobre dados pessoais geram registros de auditoria imutáveis (quem, quando, o que)." },
  { codigo: 'SEG-05', campo: 'descricao', antigo: "A organizacao possui plano formal de resposta a incidentes de seguranca com dados pessoais.", novo: "A organização possui plano formal de resposta a incidentes de segurança com dados pessoais." },
  { codigo: 'GOV-01', campo: 'descricao', antigo: "A organizacao designou formalmente um Encarregado de Protecao de Dados, com contato publico.", novo: "A organização designou formalmente um Encarregado de Proteção de Dados, com contato público." },
  { codigo: 'GOV-02', campo: 'titulo', antigo: "Politica de privacidade publicada", novo: "Política de privacidade publicada" },
  { codigo: 'GOV-02', campo: 'descricao', antigo: "Existe politica de privacidade publica, clara e acessivel, alinhada aos arts. 6 e 9 da LGPD.", novo: "Existe política de privacidade pública, clara e acessível, alinhada aos arts. 6 e 9 da LGPD." },
  { codigo: 'GOV-03', campo: 'titulo', antigo: "Principio da finalidade aplicado", novo: "Princípio da finalidade aplicado" },
  { codigo: 'GOV-03', campo: 'descricao', antigo: "Os tratamentos sao realizados somente para finalidades especificas, explicitas e informadas ao titular.", novo: "Os tratamentos são realizados somente para finalidades específicas, explícitas e informadas ao titular." },
  { codigo: 'GOV-04', campo: 'titulo', antigo: "Principio da necessidade (minimizacao)", novo: "Princípio da necessidade (minimização)" },
  { codigo: 'GOV-04', campo: 'descricao', antigo: "Sao coletados apenas os dados minimos necessarios para cumprir a finalidade declarada.", novo: "São coletados apenas os dados mínimos necessários para cumprir a finalidade declarada." },
  { codigo: 'GOV-05', campo: 'titulo', antigo: "Capacitacao periodica dos colaboradores", novo: "Capacitação periódica dos colaboradores" },
  { codigo: 'GOV-05', campo: 'descricao', antigo: "Colaboradores que tratam dados pessoais recebem capacitacao periodica sobre LGPD e boas praticas.", novo: "Colaboradores que tratam dados pessoais recebem capacitação periódica sobre LGPD e boas práticas." }
];
