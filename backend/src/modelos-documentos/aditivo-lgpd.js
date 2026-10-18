// Aditivo Contratual LGPD para operadores — dados do Terceiro escolhido.
const { identificacao } = require('./_comum');

module.exports = {
  id: 'aditivo-lgpd',
  titulo: 'Termo Aditivo de Proteção de Dados (LGPD)',
  categoria: 'ADITIVO',
  descricao: 'Cláusulas LGPD para contratos com operadores. Escolha o terceiro.',
  precisaTerceiro: true,
  montar(ctx) {
    const t = ctx.terceiro || {};
    const razao = ctx.v(t.razaoSocial, 'razão social do contratado');
    const cnpj = ctx.v(t.cnpj, 'CNPJ do contratado');
    const servico = ctx.v(t.descricaoServico, 'serviço prestado pelo contratado');
    return [
      { tipo: 'paragrafo', texto: `CONTRATANTE: ${identificacao(ctx)}` },
      { tipo: 'paragrafo', texto: `CONTRATADA: ${razao}, inscrita no CNPJ sob o nº ${cnpj}, doravante denominada OPERADORA, prestadora do serviço de ${servico}.` },
      { tipo: 'paragrafo', texto: 'As partes acima identificadas celebram o presente Termo Aditivo ao contrato vigente entre elas, para adequá-lo à Lei nº 13.709/2018 (LGPD), mediante as cláusulas a seguir.' },
      { tipo: 'secao', texto: 'Cláusula 1ª — Papéis das partes' },
      { tipo: 'paragrafo', texto: 'A CONTRATANTE atua como controladora e a CONTRATADA como operadora dos dados pessoais tratados na execução do contrato, nos termos do art. 5º da LGPD. A CONTRATADA realizará o tratamento segundo as instruções da CONTRATANTE, conforme o art. 39 da LGPD.' },
      { tipo: 'secao', texto: 'Cláusula 2ª — Obrigações da OPERADORA' },
      { tipo: 'lista', itens: [
        'tratar os dados pessoais exclusivamente para a execução do objeto contratado, sendo vedado qualquer uso para finalidade própria;',
        'adotar medidas de segurança técnicas e administrativas aptas a proteger os dados pessoais, nos termos do art. 46 da LGPD;',
        'manter registro das operações de tratamento realizadas em nome da CONTRATANTE (art. 37 da LGPD);',
        'garantir que seus empregados e prepostos com acesso aos dados estejam vinculados a dever de confidencialidade;',
        'não subcontratar o tratamento sem autorização prévia e por escrito da CONTRATANTE, impondo ao suboperador as mesmas obrigações deste Termo;',
        'não transferir dados pessoais para fora do Brasil sem autorização prévia da CONTRATANTE e sem observar o art. 33 da LGPD;',
        'auxiliar a CONTRATANTE no atendimento às solicitações dos titulares, encaminhando em até 2 (dois) dias úteis os pedidos que receber diretamente;',
        'comunicar à CONTRATANTE, em até 48 (quarenta e oito) horas da ciência, qualquer incidente de segurança envolvendo os dados pessoais, com as informações disponíveis;',
        'disponibilizar à CONTRATANTE as informações necessárias para demonstrar o cumprimento deste Termo, inclusive permitindo auditorias.'
      ] },
      { tipo: 'secao', texto: 'Cláusula 3ª — Término do tratamento' },
      { tipo: 'paragrafo', texto: 'Ao fim do contrato, a CONTRATADA devolverá os dados pessoais à CONTRATANTE ou os eliminará, conforme orientação desta, emitindo declaração de eliminação, ressalvadas as hipóteses de conservação do art. 16 da LGPD.' },
      { tipo: 'secao', texto: 'Cláusula 4ª — Responsabilidade' },
      { tipo: 'paragrafo', texto: 'A CONTRATADA responde pelos danos causados pelo tratamento quando descumprir a legislação de proteção de dados ou as instruções lícitas da CONTRATANTE, nos termos da LGPD.' },
      { tipo: 'secao', texto: 'Cláusula 5ª — Ratificação' },
      { tipo: 'paragrafo', texto: 'Permanecem inalteradas as demais cláusulas do contrato que não conflitem com este Termo Aditivo.' },
      { tipo: 'assinatura', linhas: [`${ctx.org.local}, ____ de ______________ de ______.`, `${ctx.org.nome} — CONTRATANTE`, `${razao} — CONTRATADA`] }
    ];
  }
};
