// Modelos padrao de resposta a pedidos de titulares, um por direito do
// art. 18 da LGPD. Criados pela carga inicial (services/cargaInicial.js)
// para cada organizacao que ainda nao tem o modelo padrao daquele direito.
// Todos marcados como MINUTA: a camara revisa antes de usar.
//
// Variaveis (services/modeloResposta.js): {nome_titular} {protocolo}
// {data_pedido} {nome_organizacao} {providencias} {encarregado_nome}
// {encarregado_email} {encarregado_telefone} {data_resposta}

const MARCA = 'MINUTA — revisar antes de enviar (apague esta linha após a revisão).';

const abertura = direito => `${MARCA}

Prezado(a) {nome_titular},

Em atenção ao seu pedido de ${direito}, protocolo {protocolo}, recebido em {data_pedido}, a {nome_organizacao} informa o que segue.

O QUE FOI FEITO
{providencias}`;

const RESULTADO = `RESULTADO (mantenha uma das opções e apague a outra)
( ) Pedido atendido: [descreva o que foi feito ou entregue].
( ) Pedido não atendido, pelo seguinte motivo: [indique as razões de fato ou de direito que impedem o atendimento].`;

const fechamento = `Se não estiver de acordo com esta resposta, você pode peticionar à Autoridade Nacional de Proteção de Dados (ANPD), conforme o art. 18, § 1º, da LGPD.

Data da resposta: {data_resposta}

Atenciosamente,
{nome_organizacao}

—
Encarregado pelo tratamento de dados pessoais: {encarregado_nome}
E-mail: {encarregado_email} · Telefone: {encarregado_telefone}`;

const modelo = (tipoDireito, titulo, direito, miolo) => ({
  tipoDireito,
  titulo: `MINUTA — revisar · ${titulo}`,
  conteudo: [abertura(direito), miolo, fechamento].join('\n\n')
});

module.exports = [
  modelo('CONFIRMACAO', 'Confirmação de tratamento (art. 18, I)', 'confirmação da existência de tratamento de dados pessoais (art. 18, I, da LGPD)',
    `RESULTADO (mantenha uma das opções e apague a outra)
( ) Confirmamos que a {nome_organizacao} realiza tratamento de dados pessoais seus.
( ) Informamos que não localizamos registro de tratamento de dados pessoais seus.`),

  modelo('ACESSO', 'Acesso aos dados (art. 18, II)', 'acesso aos seus dados pessoais (art. 18, II, da LGPD)',
    `DECLARAÇÃO (clara e completa, conforme o art. 19, II, da LGPD)
Dados pessoais tratados: [liste os dados ou escreva: "Não há registro de dados pessoais seus em nossos sistemas."]
Origem dos dados: [de onde vieram os dados — por exemplo, fornecidos por você em protocolo, cadastro de servidor, sistema de terceiros].
Critérios utilizados: [critérios e procedimentos aplicados no tratamento].
Finalidade do tratamento: [para que os dados são usados].

Se o pedido não puder ser atendido, mantenha apenas: Pedido não atendido, pelo seguinte motivo: [indique as razões de fato ou de direito].`),

  modelo('CORRECAO', 'Correção de dados (art. 18, III)', 'correção de dados incompletos, inexatos ou desatualizados (art. 18, III, da LGPD)', RESULTADO),

  modelo('ANONIMIZACAO', 'Anonimização, bloqueio ou eliminação (art. 18, IV)',
    'anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei (art. 18, IV, da LGPD)', RESULTADO),

  modelo('PORTABILIDADE', 'Portabilidade (art. 18, V)', 'portabilidade dos seus dados a outro fornecedor de serviço ou produto (art. 18, V, da LGPD)', RESULTADO),

  modelo('ELIMINACAO', 'Eliminação de dados tratados com consentimento (art. 18, VI)',
    'eliminação dos dados pessoais tratados com o seu consentimento (art. 18, VI, da LGPD)',
    `${RESULTADO}
Se algum dado precisar ser conservado (por exemplo, para cumprimento de obrigação legal), indique qual e por quê: [descrever].`),

  modelo('INFORMACAO', 'Informação sobre compartilhamento (art. 18, VII)',
    'informação sobre as entidades públicas e privadas com as quais a {nome_organizacao} compartilhou seus dados (art. 18, VII, da LGPD)',
    `ENTIDADES COM AS QUAIS OS DADOS FORAM COMPARTILHADOS
[liste cada entidade e a finalidade do compartilhamento, ou escreva: "Não houve compartilhamento dos seus dados."]

Se o pedido não puder ser atendido, informe: Pedido não atendido, pelo seguinte motivo: [indique as razões de fato ou de direito].`),

  modelo('INFORMACAO_NAO_CONSENTIR', 'Informação sobre não consentir (art. 18, VIII)',
    'informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa (art. 18, VIII, da LGPD)',
    `INFORMAÇÃO
Tratamento em questão: [qual tratamento depende de consentimento].
Você pode deixar de fornecer o consentimento. Consequências da negativa: [descreva de forma simples o que muda para você].
Se o tratamento não depende de consentimento, explique a base legal aplicável: [descrever].`),

  modelo('REVOGACAO', 'Revogação do consentimento (art. 18, IX)', 'revogação do consentimento (art. 18, IX, da LGPD)',
    `${RESULTADO}
Data a partir da qual o consentimento deixou de valer: [dd/mm/aaaa].`)
];
module.exports.MARCA = MARCA;
