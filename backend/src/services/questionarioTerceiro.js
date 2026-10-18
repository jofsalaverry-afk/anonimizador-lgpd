// Questionario fixo de conformidade de terceiros/operadores (LGPD art. 39
// e art. 46) e regra de calculo do risco.
//
// perguntaId e estavel: e o que fica gravado em RespostaQuestionarioTerceiro.
// Nao renomear ids existentes — so acrescentar perguntas novas.
//
// critica: true marca perguntas cujo "NAO" sozinho ja impede risco BAIXO.

const BLOCOS = [
  {
    id: 'seguranca',
    titulo: 'Segurança da informação',
    perguntas: [
      { id: 'SEG1', texto: 'Possui política de segurança da informação formalizada e aplicada?', peso: 1 },
      { id: 'SEG2', texto: 'Controla o acesso aos dados pessoais por perfil, com autenticação individual?', peso: 2, critica: true },
      { id: 'SEG3', texto: 'Criptografa os dados pessoais em trânsito e em repouso?', peso: 2 },
      { id: 'SEG4', texto: 'Mantém registro (log) de acessos e alterações aos dados pessoais?', peso: 1 }
    ]
  },
  {
    id: 'hospedagem',
    titulo: 'Hospedagem e transferência internacional',
    perguntas: [
      { id: 'HOS1', texto: 'Informa onde (país e região) os dados pessoais ficam hospedados?', peso: 1 },
      { id: 'HOS2', texto: 'Os dados ficam no Brasil ou, se no exterior, há base legal de transferência (art. 33 LGPD)?', peso: 2, critica: true },
      { id: 'HOS3', texto: 'Possui backup com teste periódico de restauração?', peso: 1 }
    ]
  },
  {
    id: 'suboperadores',
    titulo: 'Suboperadores',
    perguntas: [
      { id: 'SUB1', texto: 'Informa a lista de suboperadores que tratam os dados da Câmara?', peso: 1 },
      { id: 'SUB2', texto: 'Só contrata suboperador com autorização prévia da Câmara?', peso: 2 },
      { id: 'SUB3', texto: 'Exige dos suboperadores as mesmas obrigações de proteção de dados?', peso: 1 }
    ]
  },
  {
    id: 'retencao',
    titulo: 'Retenção e descarte',
    perguntas: [
      { id: 'RET1', texto: 'Mantém os dados apenas pelo prazo necessário à finalidade contratada?', peso: 1 },
      { id: 'RET2', texto: 'Devolve ou elimina os dados ao fim do contrato, com comprovação?', peso: 2, critica: true },
      { id: 'RET3', texto: 'Usa método seguro de descarte (eliminação definitiva ou anonimização)?', peso: 1 }
    ]
  },
  {
    id: 'direitos',
    titulo: 'Atendimento a direitos dos titulares',
    perguntas: [
      { id: 'DIR1', texto: 'Consegue localizar, corrigir e eliminar os dados de um titular a pedido da Câmara?', peso: 2 },
      { id: 'DIR2', texto: 'Atende a pedidos da Câmara em prazo que permita cumprir o art. 19 da LGPD?', peso: 1 },
      { id: 'DIR3', texto: 'Encaminha à Câmara pedidos de titulares recebidos diretamente?', peso: 1 }
    ]
  },
  {
    id: 'incidentes',
    titulo: 'Gestão de incidentes',
    perguntas: [
      { id: 'INC1', texto: 'Possui plano de resposta a incidentes de segurança?', peso: 1 },
      { id: 'INC2', texto: 'Comunica incidentes à Câmara em até 48 horas após a ciência?', peso: 2, critica: true },
      { id: 'INC3', texto: 'Registra os incidentes e as providências adotadas?', peso: 1 },
      { id: 'INC4', texto: 'Realiza simulados ou testes do plano de resposta pelo menos uma vez por ano?', peso: 1 }
    ]
  }
];

const PERGUNTAS = Object.fromEntries(BLOCOS.flatMap(b => b.perguntas.map(p => [p.id, { ...p, blocoId: b.id }])));
const TOTAL_PERGUNTAS = Object.keys(PERGUNTAS).length;

// ===================== Regra de risco =====================
// 1. Cada resposta vale pontos de risco: SIM = 0, PARCIAL = 1, NAO = 2,
//    multiplicados pelo peso da pergunta (1 ou 2). NA nao conta.
// 2. indice = pontos obtidos / pontos maximos possiveis (das respondidas,
//    sem NA). Vai de 0 (tudo SIM) a 1 (tudo NAO).
// 3. Faixas: indice < 0,25 -> BAIXO; indice < 0,50 -> MEDIO; senao ALTO.
// 4. Agravantes (sobem o minimo para MEDIO):
//    - qualquer pergunta critica respondida NAO;
//    - contrato critico sem aditivo LGPD assinado.
// 5. Sem nenhuma resposta valida (so NA ou nada) -> null (nao avaliado).
const PONTOS = { SIM: 0, PARCIAL: 1, NAO: 2 };
const FAIXA_BAIXO = 0.25;
const FAIXA_MEDIO = 0.5;
const ORDEM = ['BAIXO', 'MEDIO', 'ALTO'];

function calcularRisco(respostas, { contratoCritico = false, aditivoLgpdAssinado = false } = {}) {
  let pontos = 0;
  let maximo = 0;
  let criticaNegativa = false;
  let respondidas = 0;
  for (const r of respostas || []) {
    const p = PERGUNTAS[r.perguntaId];
    if (!p) continue;
    respondidas++;
    if (r.resposta === 'NA' || !(r.resposta in PONTOS)) continue;
    pontos += PONTOS[r.resposta] * p.peso;
    maximo += 2 * p.peso;
    if (p.critica && r.resposta === 'NAO') criticaNegativa = true;
  }
  if (maximo === 0) {
    return { risco: null, indice: null, respondidas, total: TOTAL_PERGUNTAS, agravantes: [] };
  }
  const indice = pontos / maximo;
  let nivel = indice < FAIXA_BAIXO ? 0 : indice < FAIXA_MEDIO ? 1 : 2;
  const agravantes = [];
  if (criticaNegativa) agravantes.push('Pergunta crítica respondida "Não"');
  if (contratoCritico && !aditivoLgpdAssinado) agravantes.push('Contrato crítico sem aditivo LGPD assinado');
  if (agravantes.length && nivel < 1) nivel = 1;
  return { risco: ORDEM[nivel], indice: Math.round(indice * 100) / 100, respondidas, total: TOTAL_PERGUNTAS, agravantes };
}

module.exports = { BLOCOS, PERGUNTAS, TOTAL_PERGUNTAS, calcularRisco, FAIXA_BAIXO, FAIXA_MEDIO };
