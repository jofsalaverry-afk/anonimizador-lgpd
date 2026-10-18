// Politica de Seguranca da Informacao.
const { identificacao, contatoEncarregado } = require('./_comum');

module.exports = {
  id: 'politica-seguranca',
  titulo: 'Política de Segurança da Informação',
  categoria: 'POLITICA_SEGURANCA',
  descricao: 'Diretrizes de segurança para proteção de dados e sistemas.',
  precisaTerceiro: false,
  montar(ctx) {
    return [
      { tipo: 'secao', texto: '1. Objetivo' },
      { tipo: 'paragrafo', texto: identificacao(ctx) },
      { tipo: 'paragrafo', texto: 'Esta Política estabelece diretrizes para proteger a confidencialidade, a integridade e a disponibilidade das informações e dos dados pessoais tratados pela CÂMARA, em atendimento ao art. 46 da Lei nº 13.709/2018 (LGPD).' },
      { tipo: 'secao', texto: '2. Abrangência' },
      { tipo: 'paragrafo', texto: 'Aplica-se a vereadores, servidores efetivos e comissionados, estagiários, prestadores de serviço e a qualquer pessoa que tenha acesso a informações, sistemas ou instalações da CÂMARA.' },
      { tipo: 'secao', texto: '3. Diretrizes' },
      { tipo: 'lista', itens: [
        'Acesso aos sistemas por credencial individual e intransferível, com perfil compatível com a função (privilégio mínimo).',
        'Autenticação em dois fatores para perfis com acesso administrativo ou a dados pessoais em volume.',
        'Revogação imediata dos acessos no desligamento ou na mudança de função.',
        'Registro (log) dos acessos e das alterações em sistemas que tratam dados pessoais.',
        'Cópias de segurança periódicas, com teste de restauração.',
        'Atualização regular de sistemas, antivírus e equipamentos.',
        'Uso de criptografia na transmissão de dados pessoais e, quando possível, no armazenamento.',
        'Proibição de compartilhar senhas e de usar contas pessoais de e-mail ou de armazenamento em nuvem para documentos institucionais.',
        'Mesa limpa e tela bloqueada sempre que o posto de trabalho estiver desocupado.',
        'Descarte seguro de mídias e documentos, conforme a Política de Retenção e Descarte.'
      ] },
      { tipo: 'secao', texto: '4. Terceiros' },
      { tipo: 'paragrafo', texto: 'Contratos com fornecedores que tratem dados pessoais em nome da CÂMARA devem conter cláusulas de proteção de dados e de segurança da informação, observado o art. 39 da LGPD.' },
      { tipo: 'secao', texto: '5. Incidentes' },
      { tipo: 'paragrafo', texto: 'Qualquer suspeita de incidente de segurança deve ser comunicada imediatamente ao encarregado, que conduzirá a resposta conforme o Plano de Resposta a Incidentes.' },
      { tipo: 'paragrafo', texto: contatoEncarregado(ctx) },
      { tipo: 'secao', texto: '6. Capacitação' },
      { tipo: 'paragrafo', texto: 'A CÂMARA promoverá capacitação periódica em proteção de dados e segurança da informação para todos os seus agentes.' },
      { tipo: 'secao', texto: '7. Disposições finais' },
      { tipo: 'paragrafo', texto: `O descumprimento desta Política sujeita o infrator às sanções administrativas cabíveis, sem prejuízo das responsabilidades civil e penal. ${ctx.org.local}, ${ctx.hoje}.` }
    ];
  }
};
