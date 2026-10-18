// Politica de Cookies do portal institucional.
const { contatoEncarregado } = require('./_comum');

module.exports = {
  id: 'politica-cookies',
  titulo: 'Política de Cookies do Portal',
  categoria: 'POLITICA',
  descricao: 'Informa o uso de cookies no portal institucional.',
  precisaTerceiro: false,
  montar(ctx) {
    return [
      { tipo: 'secao', texto: '1. O que são cookies' },
      { tipo: 'paragrafo', texto: `Cookies são pequenos arquivos gravados no navegador do visitante quando ele acessa o portal da ${ctx.org.nome}. Eles permitem o funcionamento do site e, quando autorizados, a coleta de estatísticas de uso.` },
      { tipo: 'secao', texto: '2. Cookies utilizados' },
      { tipo: 'tabela', colunas: ['Categoria', 'Finalidade', 'Necessita autorização?'], linhas: [
        ['Estritamente necessários', 'Funcionamento do portal, segurança e preferências de acessibilidade.', 'Não'],
        ['Estatísticos/desempenho', 'Medir o número de visitas e as páginas mais acessadas, de forma agregada.', 'Sim'],
        ['Conteúdo de terceiros', 'Exibição de vídeos ou mapas incorporados de outras plataformas.', 'Sim']
      ] },
      { tipo: 'paragrafo', texto: 'A relação detalhada de cookies (nome, fornecedor e prazo de expiração) deve ser mantida atualizada pela área de tecnologia da informação e anexada a esta Política.' },
      { tipo: 'secao', texto: '3. Como gerenciar' },
      { tipo: 'paragrafo', texto: 'O visitante pode aceitar ou recusar os cookies não necessários no aviso exibido no primeiro acesso, e pode apagá-los ou bloqueá-los a qualquer momento nas configurações do navegador. A recusa não impede o acesso às informações públicas do portal.' },
      { tipo: 'secao', texto: '4. Referências' },
      { tipo: 'paragrafo', texto: 'Esta Política observa a Lei nº 13.709/2018 (LGPD) e as orientações da Autoridade Nacional de Proteção de Dados (ANPD) sobre cookies.' },
      { tipo: 'secao', texto: '5. Contato' },
      { tipo: 'paragrafo', texto: contatoEncarregado(ctx) },
      { tipo: 'paragrafo', texto: `Versão de ${ctx.hoje}.` }
    ];
  }
};
