// Procedimento de Atendimento aos Direitos dos Titulares.
const { contatoEncarregado } = require('./_comum');

module.exports = {
  id: 'procedimento-direitos',
  titulo: 'Procedimento de Atendimento aos Direitos dos Titulares',
  categoria: 'MODELO_DSAR',
  descricao: 'Passo a passo interno para atender pedidos do art. 18 da LGPD.',
  precisaTerceiro: false,
  montar(ctx) {
    return [
      { tipo: 'secao', texto: '1. Objetivo' },
      { tipo: 'paragrafo', texto: `Padronizar, no âmbito da ${ctx.org.nome}, o recebimento, a análise e a resposta às solicitações de titulares de dados pessoais previstas no art. 18 da Lei nº 13.709/2018 (LGPD).` },
      { tipo: 'secao', texto: '2. Canais de entrada' },
      { tipo: 'lista', itens: [
        `Canal eletrônico: ${ctx.urls.canal}`,
        `E-mail do encarregado: ${ctx.enc.email}`,
        `Atendimento presencial na sede: ${ctx.org.endereco}`
      ] },
      { tipo: 'paragrafo', texto: 'Pedidos recebidos por outros meios ou setores devem ser registrados no sistema em até 1 (um) dia útil.' },
      { tipo: 'secao', texto: '3. Etapas' },
      { tipo: 'tabela', colunas: ['Etapa', 'Responsável', 'Prazo'], linhas: [
        ['Registro do pedido e emissão de protocolo ao titular', 'Encarregado ou setor que recebeu', 'No recebimento'],
        ['Verificação da identidade do titular (documento, código por e-mail ou atendimento presencial)', 'Encarregado', 'Até 2 dias úteis'],
        ['Localização dos dados nos setores e sistemas (consulta ao ROPA e ao inventário)', 'Setores envolvidos', 'Até 5 dias'],
        ['Análise jurídica, quando necessária (ex.: conflito com a Lei de Acesso à Informação)', 'Procuradoria/assessoria jurídica', 'Até 3 dias'],
        ['Resposta ao titular e registro das providências e evidências', 'Encarregado', 'Até 15 dias da verificação, para confirmação e acesso (art. 19 da LGPD)'],
        ['Arquivamento do processo', 'Encarregado', 'Após a resposta']
      ] },
      { tipo: 'secao', texto: '4. Regras de atendimento' },
      { tipo: 'lista', itens: [
        'O atendimento é gratuito.',
        'Toda resposta deve ser clara e, quando houver negativa total ou parcial, fundamentada.',
        'Quando a CÂMARA não for a controladora dos dados, o titular deve ser informado e, sempre que possível, orientado sobre quem é o controlador.',
        'Pedidos de eliminação de dados tratados por obrigação legal ou para cumprimento de competência pública devem considerar as hipóteses de conservação do art. 16 da LGPD.',
        'Todas as etapas devem ficar registradas no sistema, com data, responsável e evidências.'
      ] },
      { tipo: 'secao', texto: '5. Contato' },
      { tipo: 'paragrafo', texto: contatoEncarregado(ctx) },
      { tipo: 'paragrafo', texto: `${ctx.org.local}, ${ctx.hoje}.` }
    ];
  }
};
