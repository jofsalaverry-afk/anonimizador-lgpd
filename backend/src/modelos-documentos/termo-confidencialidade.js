// Termo de Confidencialidade e Sigilo (servidores e terceiros).
// Os dados de quem assina ficam em branco para preenchimento.
module.exports = {
  id: 'termo-confidencialidade',
  titulo: 'Termo de Confidencialidade e Sigilo',
  categoria: 'TERMO',
  descricao: 'Compromisso de sigilo para servidores, estagiários e terceiros.',
  precisaTerceiro: false,
  montar(ctx) {
    return [
      { tipo: 'paragrafo', texto: 'Pelo presente Termo, a pessoa abaixo identificada, que exerce atividades junto à' },
      { tipo: 'paragrafo', texto: `${ctx.org.nome}, CNPJ nº ${ctx.org.cnpj}, ${ctx.org.local},` },
      { tipo: 'campo', rotulo: 'Nome completo' },
      { tipo: 'campo', rotulo: 'CPF' },
      { tipo: 'campo', rotulo: 'Cargo/função ou empresa' },
      { tipo: 'campo', rotulo: 'Lotação/setor' },
      { tipo: 'paragrafo', texto: 'compromete-se a:' },
      { tipo: 'lista', itens: [
        'manter sigilo sobre as informações e os dados pessoais a que tiver acesso em razão de suas atividades, durante e após o término do vínculo;',
        'utilizar os dados pessoais somente para as finalidades das atividades que lhe forem atribuídas, nos termos da Lei nº 13.709/2018 (LGPD);',
        'não copiar, divulgar, transferir ou armazenar informações institucionais em meios não autorizados pela Câmara;',
        'manter suas credenciais de acesso sob guarda pessoal, sem compartilhá-las;',
        'comunicar imediatamente ao encarregado qualquer incidente ou suspeita de incidente de segurança envolvendo dados pessoais;',
        'devolver ou eliminar, ao término do vínculo, os documentos e dados pessoais que estiverem sob sua guarda.'
      ] },
      { tipo: 'paragrafo', texto: 'Declara ter ciência de que o descumprimento deste Termo pode resultar em responsabilização administrativa, civil e penal, sem prejuízo das sanções previstas na legislação aplicável.' },
      { tipo: 'paragrafo', texto: `Contato do encarregado: ${ctx.enc.nome} — ${ctx.enc.email}.` },
      { tipo: 'assinatura', linhas: [`${ctx.org.local}, ____ de ______________ de ______.`, 'Assinatura do(a) declarante'] }
    ];
  }
};
