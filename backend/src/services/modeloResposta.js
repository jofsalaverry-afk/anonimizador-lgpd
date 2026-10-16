// Substituicao de variaveis nos modelos de resposta DSAR.
// Variaveis aceitas: {nome_titular}, {protocolo}, {nome_organizacao},
// {data_pedido}, {data_resposta}, {providencias}, {encarregado_nome},
// {encarregado_email}, {encarregado_telefone} (Etapa 6c).
// Chave desconhecida fica como esta (o usuario ve e corrige antes de enviar).
const VARIAVEIS = ['nome_titular', 'protocolo', 'nome_organizacao', 'data_pedido', 'data_resposta', 'providencias', 'encarregado_nome', 'encarregado_email', 'encarregado_telefone'];

function preencherModelo(conteudo, valores) {
  return String(conteudo || '').replace(/\{(\w+)\}/g, (inteiro, chave) =>
    VARIAVEIS.includes(chave) && valores[chave] != null ? String(valores[chave]) : inteiro
  );
}

module.exports = { preencherModelo, VARIAVEIS };
