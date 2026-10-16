// Plano de Resposta a Incidentes de Seguranca com Dados Pessoais.
const { contatoEncarregado } = require('./_comum');

module.exports = {
  id: 'plano-resposta-incidentes',
  titulo: 'Plano de Resposta a Incidentes de Segurança com Dados Pessoais',
  categoria: 'POLITICA',
  descricao: 'Fluxo de resposta, comunicação e registro de incidentes.',
  precisaTerceiro: false,
  montar(ctx) {
    return [
      { tipo: 'secao', texto: '1. Objetivo' },
      { tipo: 'paragrafo', texto: `Definir como a ${ctx.org.nome} identifica, contém, avalia, comunica e registra incidentes de segurança que envolvam dados pessoais, em atendimento ao art. 48 da Lei nº 13.709/2018 (LGPD).` },
      { tipo: 'secao', texto: '2. O que é incidente' },
      { tipo: 'paragrafo', texto: 'Qualquer evento, confirmado ou suspeito, que comprometa a confidencialidade, a integridade ou a disponibilidade de dados pessoais: acesso indevido, vazamento, perda de equipamento ou documento, envio a destinatário errado, sequestro de dados (ransomware), alteração ou eliminação não autorizada, entre outros.' },
      { tipo: 'secao', texto: '3. Equipe de resposta' },
      { tipo: 'lista', itens: [
        `Coordenação: encarregado — ${ctx.enc.nome} (${ctx.enc.email}, ${ctx.enc.telefone});`,
        'Tecnologia da informação: contenção técnica e preservação de evidências;',
        'Assessoria jurídica: avaliação de risco e das comunicações obrigatórias;',
        'Comunicação institucional: mensagens ao público, quando necessário;',
        'Chefia do setor afetado.'
      ] },
      { tipo: 'secao', texto: '4. Fluxo de resposta' },
      { tipo: 'tabela', colunas: ['Fase', 'Ações'], linhas: [
        ['1. Comunicação interna', 'Quem identificar o incidente comunica imediatamente o encarregado, que registra o caso no sistema.'],
        ['2. Contenção', 'Isolar sistemas ou contas afetados, revogar acessos, recolher documentos e preservar logs e evidências.'],
        ['3. Avaliação', 'Identificar os dados e titulares afetados, a quantidade, a categoria (inclusive dados sensíveis) e o risco ou dano relevante aos titulares.'],
        ['4. Comunicação externa', 'Se houver risco ou dano relevante, comunicar a ANPD e os titulares, no prazo e na forma da regulamentação da ANPD (Resolução CD/ANPD nº 15/2024).'],
        ['5. Recuperação', 'Restabelecer os serviços e corrigir a causa do incidente.'],
        ['6. Registro e lições aprendidas', 'Registrar providências, evidências e decisões; revisar controles e treinar as equipes.']
      ] },
      { tipo: 'secao', texto: '5. Registro' },
      { tipo: 'paragrafo', texto: 'Todo incidente, inclusive os que não forem comunicados à ANPD, deve ser registrado com data, descrição, dados afetados, avaliação de risco, providências e evidências, utilizando o Formulário de Registro de Incidente.' },
      { tipo: 'secao', texto: '6. Simulados' },
      { tipo: 'paragrafo', texto: 'O plano será testado por meio de simulado ao menos uma vez por ano, registrado no sistema como incidente do tipo simulado.' },
      { tipo: 'secao', texto: '7. Contato' },
      { tipo: 'paragrafo', texto: contatoEncarregado(ctx) },
      { tipo: 'paragrafo', texto: `${ctx.org.local}, ${ctx.hoje}.` }
    ];
  }
};
