// Politica de Retencao e Descarte — tabela de temporalidade vem do ROPA.
module.exports = {
  id: 'politica-retencao-descarte',
  titulo: 'Política de Retenção e Descarte de Dados Pessoais',
  categoria: 'POLITICA',
  descricao: 'Prazos de guarda e forma de descarte, por tratamento do ROPA.',
  precisaTerceiro: false,
  montar(ctx) {
    const blocos = [
      { tipo: 'secao', texto: '1. Objetivo' },
      { tipo: 'paragrafo', texto: `Definir por quanto tempo a ${ctx.org.nome} mantém os dados pessoais que trata e como eles são eliminados ao fim do prazo, em atendimento aos arts. 15 e 16 da Lei nº 13.709/2018 (LGPD).` },
      { tipo: 'secao', texto: '2. Diretrizes' },
      { tipo: 'lista', itens: [
        'Os dados pessoais são mantidos apenas pelo tempo necessário à finalidade e às obrigações legais e de guarda documental aplicáveis.',
        'Os prazos devem ser compatíveis com a tabela de temporalidade de documentos adotada pela CÂMARA e com as normas arquivísticas aplicáveis.',
        'Ao fim do prazo, os dados são eliminados de forma segura ou anonimizados; documentos de valor permanente seguem para guarda permanente.',
        'Todo descarte é registrado no sistema, com data, método, quantidade, responsável e evidência.'
      ] },
      { tipo: 'secao', texto: '3. Tabela de temporalidade' }
    ];
    const linhas = ctx.tratamentos.map(t => [
      t.nome,
      t.retencao || ctx.v(null, `prazo de retenção do tratamento "${t.nome}"`),
      t.descarte || ctx.v(null, `forma de descarte do tratamento "${t.nome}"`)
    ]);
    if (linhas.length === 0) {
      blocos.push({ tipo: 'paragrafo', texto: ctx.v(null, 'tratamentos do ROPA (nenhum tratamento ativo cadastrado)') });
    } else {
      blocos.push({ tipo: 'tabela', colunas: ['Tratamento', 'Prazo de retenção', 'Forma de descarte'], linhas });
    }
    blocos.push(
      { tipo: 'secao', texto: '4. Métodos de descarte' },
      { tipo: 'tabela', colunas: ['Suporte', 'Método'], linhas: [
        ['Papel', 'Fragmentação mecânica (trituração) ou incineração, com termo de descarte.'],
        ['Mídia eletrônica', 'Exclusão segura com sobrescrita ou destruição física da mídia.'],
        ['Sistemas e bancos de dados', 'Exclusão definitiva ou anonimização, com registro da operação.']
      ] },
      { tipo: 'secao', texto: '5. Responsabilidades' },
      { tipo: 'paragrafo', texto: `Cabe a cada setor acompanhar os prazos dos tratamentos sob sua responsabilidade e ao encarregado (${ctx.enc.nome}) supervisionar o cumprimento desta Política. ${ctx.org.local}, ${ctx.hoje}.` }
    );
    return blocos;
  }
};
