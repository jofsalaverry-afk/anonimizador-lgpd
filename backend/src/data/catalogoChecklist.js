// Catalogo global do checklist de conformidade (organizacaoId = null).
// Carga inicial idempotente em services/cargaInicial.js: cria o que falta
// pelo codigo e NUNCA altera itens existentes (respostas das camaras
// apontam para eles).
//
// Etapa 6c: textos com acento; fundamentos revisados:
//   DSAR-02  prazo de 15 dias = art. 19, II (antes "art. 19, § 1º")
//   DSAR-03  verificacao de identidade: arts. 18 e 46 (antes "art. 18, § 5º",
//            que trata da gratuidade)
//   GOV-05   capacitacao: art. 41, § 2º, III e art. 46 (antes citava o art. 50,
//            que trata de boas praticas facultativas)
module.exports = [
  // ==== ROPA (registro das operacoes de tratamento) — art. 37 ====
  {
    codigo: 'ROPA-01', categoria: 'ROPA', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Registro das operações de tratamento',
    descricao: 'A organização mantém registro atualizado de todas as operações de tratamento de dados pessoais realizadas.',
    fundamentoLegal: 'LGPD, art. 37', evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'ROPA-02', categoria: 'ROPA', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Base legal documentada por tratamento',
    descricao: 'Cada tratamento registrado indica a base legal aplicável (art. 7º e, para dados sensíveis, art. 11).',
    fundamentoLegal: 'LGPD, arts. 7º, 11 e 37', evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'ROPA-03', categoria: 'ROPA', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Categorias de dados e titulares mapeadas',
    descricao: 'Para cada tratamento, estão mapeadas as categorias de dados pessoais e os tipos de titulares envolvidos.',
    fundamentoLegal: 'LGPD, art. 37', evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'ROPA-04', categoria: 'ROPA', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Prazo de retenção e forma de descarte',
    descricao: 'O ROPA inclui o prazo de retenção dos dados e a forma prevista para descarte após o término do tratamento.',
    fundamentoLegal: 'LGPD, arts. 16 e 37', evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'ROPA-05', categoria: 'ROPA', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Compartilhamentos com terceiros registrados',
    descricao: 'Todos os compartilhamentos de dados com terceiros estão registrados, incluindo finalidade e país de destino.',
    fundamentoLegal: 'LGPD, arts. 33 e 37', evidenciaRequerida: 'LINK_SISTEMA'
  },
  // ==== Direitos do titular ====
  {
    codigo: 'DSAR-01', categoria: 'DSAR', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Canal público para exercício de direitos',
    descricao: 'A organização disponibiliza canal acessível para que os titulares exerçam os direitos previstos na LGPD.',
    fundamentoLegal: 'LGPD, art. 18', evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'DSAR-02', categoria: 'DSAR', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Prazo de 15 dias monitorado',
    descricao: 'Pedidos de acesso em formato completo são respondidos em até 15 dias, com acompanhamento do prazo.',
    fundamentoLegal: 'LGPD, art. 19, II', evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'DSAR-03', categoria: 'DSAR', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Identificação e autenticação do titular',
    descricao: 'Existe procedimento para verificar a identidade do titular antes de fornecer dados ou realizar alterações.',
    fundamentoLegal: 'LGPD, arts. 18 e 46', evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'DSAR-04', categoria: 'DSAR', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Registro das providências de cada pedido',
    descricao: 'As providências adotadas em cada pedido do titular ficam registradas, com data, autor e código de integridade.',
    fundamentoLegal: 'LGPD, art. 37', evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'DSAR-05', categoria: 'DSAR', criticidade: 'BAIXA', obrigatorio: false,
    titulo: 'Modelos de resposta padronizados',
    descricao: 'A organização dispõe de modelos de resposta para cada direito previsto no art. 18.',
    fundamentoLegal: 'LGPD, art. 18', evidenciaRequerida: 'DOCUMENTO'
  },
  // ==== Seguranca ====
  {
    codigo: 'SEG-01', categoria: 'Segurança', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Controle de acesso com autenticação forte',
    descricao: 'O acesso aos sistemas que tratam dados pessoais exige autenticação (senha forte e, de preferência, dois fatores).',
    fundamentoLegal: 'LGPD, art. 46', evidenciaRequerida: 'CAPTURA'
  },
  {
    codigo: 'SEG-02', categoria: 'Segurança', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Criptografia em trânsito (HTTPS/TLS)',
    descricao: 'Toda comunicação com os sistemas da organização ocorre sob HTTPS/TLS atualizado.',
    fundamentoLegal: 'LGPD, art. 46', evidenciaRequerida: 'CAPTURA'
  },
  {
    codigo: 'SEG-03', categoria: 'Segurança', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Backup regular e testado',
    descricao: 'Os dados pessoais têm rotina de backup regular, com testes periódicos de restauração.',
    fundamentoLegal: 'LGPD, arts. 46 e 49', evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'SEG-04', categoria: 'Segurança', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Trilha de auditoria',
    descricao: 'Ações relevantes sobre dados pessoais geram registros de auditoria (quem, quando e o que mudou).',
    fundamentoLegal: 'LGPD, arts. 37 e 46', evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'SEG-05', categoria: 'Segurança', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Plano de resposta a incidentes',
    descricao: 'A organização possui plano formal de resposta a incidentes de segurança com dados pessoais.',
    fundamentoLegal: 'LGPD, arts. 46 e 48', evidenciaRequerida: 'DOCUMENTO'
  },
  // ==== Governanca ====
  {
    codigo: 'GOV-01', categoria: 'Governança', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Encarregado (DPO) designado',
    descricao: 'A organização designou formalmente o encarregado pelo tratamento de dados pessoais, com identidade e contato divulgados publicamente.',
    fundamentoLegal: 'LGPD, art. 41', evidenciaRequerida: 'DOCUMENTO'
  },
  {
    codigo: 'GOV-02', categoria: 'Governança', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Informações sobre o tratamento publicadas',
    descricao: 'As hipóteses de tratamento, a finalidade e os procedimentos estão publicados de forma clara, preferencialmente no sítio eletrônico.',
    fundamentoLegal: 'LGPD, arts. 6º, VI, 9º e 23, I', evidenciaRequerida: 'LINK_SISTEMA'
  },
  {
    codigo: 'GOV-03', categoria: 'Governança', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Princípio da finalidade aplicado',
    descricao: 'Os tratamentos são realizados somente para finalidades específicas, explícitas e informadas ao titular.',
    fundamentoLegal: 'LGPD, art. 6º, I', evidenciaRequerida: 'AUTO_DECLARACAO'
  },
  {
    codigo: 'GOV-04', categoria: 'Governança', criticidade: 'MEDIA', obrigatorio: true,
    titulo: 'Princípio da necessidade (minimização)',
    descricao: 'São coletados apenas os dados mínimos necessários para cumprir a finalidade declarada.',
    fundamentoLegal: 'LGPD, art. 6º, III', evidenciaRequerida: 'AUTO_DECLARACAO'
  },
  {
    codigo: 'GOV-05', categoria: 'Governança', criticidade: 'ALTA', obrigatorio: true,
    titulo: 'Capacitação periódica de servidores e colaboradores',
    descricao: 'Servidores e colaboradores que tratam dados pessoais recebem capacitação periódica, em apoio às atribuições do encarregado e às medidas de segurança.',
    fundamentoLegal: 'LGPD, arts. 41, § 2º, III, e 46', evidenciaRequerida: 'DOCUMENTO'
  }
];
