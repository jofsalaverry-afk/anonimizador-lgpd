// Politica de Privacidade — finalidades, bases legais, compartilhamentos
// e retencao vem do ROPA (tratamentos ativos).
const { identificacao, contatoEncarregado } = require('./_comum');

module.exports = {
  id: 'politica-privacidade',
  titulo: 'Política de Privacidade',
  categoria: 'POLITICA_PRIVACIDADE',
  descricao: 'Política pública de privacidade, com os tratamentos do ROPA.',
  precisaTerceiro: false,
  montar(ctx) {
    const blocos = [
      { tipo: 'secao', texto: '1. Apresentação' },
      { tipo: 'paragrafo', texto: identificacao(ctx) },
      { tipo: 'paragrafo', texto: 'Esta Política de Privacidade informa, de forma clara e acessível, como a CÂMARA trata os dados pessoais de cidadãos, servidores, vereadores, fornecedores e demais titulares, em atendimento à Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD) e em harmonia com a Lei nº 12.527/2011 (Lei de Acesso à Informação).' },
      { tipo: 'secao', texto: '2. Princípios' },
      { tipo: 'paragrafo', texto: 'O tratamento de dados pessoais pela CÂMARA observa a boa-fé e os princípios do art. 6º da LGPD, em especial finalidade, adequação, necessidade, livre acesso, qualidade dos dados, transparência, segurança, prevenção, não discriminação e responsabilização e prestação de contas.' },
      { tipo: 'secao', texto: '3. Tratamentos realizados' },
      { tipo: 'paragrafo', texto: 'O tratamento de dados pessoais pela CÂMARA é realizado para o atendimento de sua finalidade pública, na persecução do interesse público e no cumprimento de suas competências legais, nos termos do art. 23 da LGPD. Os tratamentos registrados no inventário de operações (art. 37 da LGPD) são os seguintes:' }
    ];
    if (ctx.tratamentos.length === 0) {
      blocos.push({ tipo: 'paragrafo', texto: ctx.v(null, 'tratamentos do ROPA (nenhum tratamento ativo cadastrado)') });
    } else {
      blocos.push({
        tipo: 'tabela',
        colunas: ['Tratamento', 'Finalidade', 'Base legal', 'Dados tratados', 'Titulares'],
        linhas: ctx.tratamentos.map(t => [t.nome, t.finalidade, t.baseLegal, t.dados, t.titulares])
      });
    }
    const comps = ctx.tratamentos.flatMap(t => t.compartilhamentos.map(c => [t.nome, c.destinatario, c.finalidade, c.pais]));
    blocos.push({ tipo: 'secao', texto: '4. Compartilhamento de dados' });
    if (comps.length === 0) {
      blocos.push({ tipo: 'paragrafo', texto: 'Não há compartilhamento de dados pessoais com terceiros registrado no inventário de operações.' });
    } else {
      blocos.push({ tipo: 'paragrafo', texto: 'Os dados pessoais podem ser compartilhados com os destinatários abaixo, exclusivamente para as finalidades indicadas:' });
      blocos.push({ tipo: 'tabela', colunas: ['Tratamento', 'Destinatário', 'Finalidade', 'País'], linhas: comps });
      if (comps.some(c => c[3] && c[3].toLowerCase() !== 'brasil')) {
        blocos.push({ tipo: 'paragrafo', texto: 'Quando houver transferência internacional, ela ocorre somente nas hipóteses do art. 33 da LGPD.' });
      }
    }
    const comRetencao = ctx.tratamentos.filter(t => t.retencao);
    blocos.push({ tipo: 'secao', texto: '5. Armazenamento e eliminação' });
    blocos.push({ tipo: 'paragrafo', texto: 'Os dados pessoais são mantidos pelo tempo necessário ao cumprimento das finalidades e das obrigações legais, inclusive de guarda documental, e eliminados ou anonimizados ao término do tratamento, ressalvadas as hipóteses de conservação do art. 16 da LGPD.' });
    if (comRetencao.length) {
      blocos.push({ tipo: 'tabela', colunas: ['Tratamento', 'Prazo de retenção'], linhas: comRetencao.map(t => [t.nome, t.retencao]) });
    }
    blocos.push(
      { tipo: 'secao', texto: '6. Direitos do titular' },
      { tipo: 'paragrafo', texto: 'O titular pode exercer os direitos previstos no art. 18 da LGPD, entre eles:' },
      { tipo: 'lista', itens: [
        'confirmação da existência de tratamento;', 'acesso aos dados;', 'correção de dados incompletos, inexatos ou desatualizados;',
        'anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;',
        'informação sobre as entidades públicas e privadas com as quais a CÂMARA compartilhou dados;',
        'informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa, quando o tratamento se basear em consentimento;',
        'revogação do consentimento, quando aplicável.'
      ] },
      { tipo: 'paragrafo', texto: `As solicitações devem ser feitas pelo canal ${ctx.urls.canal}. Os pedidos de confirmação e de acesso são respondidos em até 15 dias, conforme o art. 19 da LGPD.` },
      { tipo: 'secao', texto: '7. Segurança' },
      { tipo: 'paragrafo', texto: 'A CÂMARA adota medidas técnicas e administrativas aptas a proteger os dados pessoais de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão, nos termos do art. 46 da LGPD.' },
      { tipo: 'secao', texto: '8. Encarregado' },
      { tipo: 'paragrafo', texto: contatoEncarregado(ctx) },
      { tipo: 'paragrafo', texto: `Informações complementares sobre os tratamentos estão disponíveis em ${ctx.urls.transparencia}.` },
      { tipo: 'secao', texto: '9. Atualizações' },
      { tipo: 'paragrafo', texto: `Esta Política poderá ser atualizada a qualquer tempo. Versão de ${ctx.hoje}.` }
    );
    return blocos;
  }
};
