// Base comum dos modelos de minuta.
//
// Cada modelo (um arquivo por documento nesta pasta) exporta:
//   id, titulo, categoria (enum TipoDocRepo), descricao, precisaTerceiro,
//   montar(ctx) -> array de blocos
// Blocos aceitos (o renderizador transforma em DOCX, PDF e texto):
//   { tipo: 'secao', texto }            titulo de secao
//   { tipo: 'paragrafo', texto }
//   { tipo: 'lista', itens: [texto] }
//   { tipo: 'tabela', colunas: [texto], linhas: [[texto]] }
//   { tipo: 'campo', rotulo }           linha em branco para preencher a mao
//   { tipo: 'assinatura', linhas: [texto] }
//
// Variaveis: use ctx.v(valor, 'descricao') — se o valor estiver vazio, o
// texto sai com "[PREENCHER: descricao]" e a pendencia aparece na previa.
// Nunca deixe chaves {assim} no texto: o teste acusa variavel sobrando.

// Rotulos das bases legais: fonte unica em src/data/basesLegais.json
const { ROTULO_BASE_LEGAL: BASE_LEGAL_LABEL, rotuloBaseLegal, normalizarCategorias } = require('../services/basesLegais');

function dataPorExtenso(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

function retencaoTexto(dias) {
  if (!dias) return null;
  if (dias % 365 === 0) return `${dias / 365} ano(s)`;
  if (dias % 30 === 0) return `${dias / 30} mês(es)`;
  return `${dias} dia(s)`;
}

// dados: { org, tratamentos, terceiro, agora, urls }
function criarContexto(dados) {
  const pendencias = [];
  const v = (valor, rotulo) => {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') return String(valor).trim();
    if (!pendencias.includes(rotulo)) pendencias.push(rotulo);
    return `[PREENCHER: ${rotulo}]`;
  };
  const org = dados.org || {};
  const local = org.municipio ? `${org.municipio}${org.uf ? '/' + org.uf : ''}` : null;
  return {
    pendencias,
    v,
    org: {
      nome: v(org.nome, 'nome da organização'),
      cnpj: v(org.cnpj, 'CNPJ da organização'),
      local: v(local, 'município/UF'),
      endereco: v(org.enderecoSede, 'endereço da sede')
    },
    enc: {
      nome: v(org.encarregadoNome, 'nome do encarregado'),
      email: v(org.encarregadoEmail, 'e-mail do encarregado'),
      telefone: v(org.encarregadoTelefone, 'telefone do encarregado')
    },
    urls: dados.urls,
    hoje: dataPorExtenso(dados.agora || new Date()),
    tratamentos: (dados.tratamentos || []).map(t => ({
      nome: t.nome,
      finalidade: t.finalidade,
      // art. 7 e, havendo dado sensivel, a hipotese do art. 11
      baseLegal: [rotuloBaseLegal(t.baseLegal), rotuloBaseLegal(t.baseLegalSensivel)].filter(Boolean).join(' / '),
      dados: normalizarCategorias(t.categoriasDados).join(', ') || 'não informado',
      titulares: normalizarCategorias(t.categoriasTitulares).join(', ') || 'não informado',
      retencao: retencaoTexto(t.retencaoDias),
      descarte: t.formaDescarte || null,
      compartilhamentos: (t.compartilhamentos || []).map(c => ({
        destinatario: c.terceiroNome, finalidade: c.finalidadeCompartilhamento, pais: c.paisDestino || 'Brasil'
      }))
    })),
    terceiro: dados.terceiro || null
  };
}

// Paragrafo padrao de identificacao do controlador, usado por varios modelos.
function identificacao(ctx) {
  return `${ctx.org.nome}, inscrita no CNPJ sob o nº ${ctx.org.cnpj}, com sede em ${ctx.org.endereco}, ${ctx.org.local}, doravante denominada CÂMARA, na condição de controladora dos dados pessoais que trata no exercício de suas competências.`;
}

function contatoEncarregado(ctx) {
  return `Encarregado pelo tratamento de dados pessoais: ${ctx.enc.nome} — e-mail ${ctx.enc.email} — telefone ${ctx.enc.telefone}.`;
}

module.exports = { BASE_LEGAL_LABEL, criarContexto, identificacao, contatoEncarregado, dataPorExtenso, retencaoTexto };
