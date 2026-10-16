// Substituicao de variaveis nos modelos de resposta DSAR.
// Variaveis aceitas: {nome_titular}, {protocolo}, {nome_organizacao}.
// Chave desconhecida fica como esta (o usuario ve e corrige antes de enviar).
const VARIAVEIS = ['nome_titular', 'protocolo', 'nome_organizacao'];

function preencherModelo(conteudo, valores) {
  return String(conteudo || '').replace(/\{(\w+)\}/g, (inteiro, chave) =>
    VARIAVEIS.includes(chave) && valores[chave] != null ? String(valores[chave]) : inteiro
  );
}

module.exports = { preencherModelo, VARIAVEIS };
