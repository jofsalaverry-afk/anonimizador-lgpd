// Codigo legivel das atividades proprias: AP-001, AP-002... na ordem de
// criacao dentro da organizacao. O campo "codigo" do banco continua unico
// global (ORG-...) e nao aparece para o usuario. Atividades nao sao
// excluidas, entao a numeracao e estavel.
function codigosExibicao(itens) {
  const proprias = itens.filter(i => i.organizacaoId)
    .sort((a, b) => (new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0)) || String(a.id).localeCompare(String(b.id)));
  const mapa = Object.fromEntries(proprias.map((p, i) => [p.id, `AP-${String(i + 1).padStart(3, '0')}`]));
  return itens.map(i => ({ ...i, codigoExibicao: mapa[i.id] || i.codigo }));
}

module.exports = { codigosExibicao };
