// Formulario de Registro de Incidente (preenchimento manual).
module.exports = {
  id: 'formulario-registro-incidente',
  titulo: 'Formulário de Registro de Incidente de Segurança',
  categoria: 'MODELO',
  descricao: 'Formulário em branco para registrar incidentes.',
  precisaTerceiro: false,
  montar(ctx) {
    return [
      { tipo: 'paragrafo', texto: `Órgão: ${ctx.org.nome} — CNPJ ${ctx.org.cnpj}` },
      { tipo: 'paragrafo', texto: `Encarregado: ${ctx.enc.nome} — ${ctx.enc.email} — ${ctx.enc.telefone}` },
      { tipo: 'secao', texto: '1. Identificação' },
      { tipo: 'campo', rotulo: 'Número do registro' },
      { tipo: 'campo', rotulo: 'Data e hora da ocorrência' },
      { tipo: 'campo', rotulo: 'Data e hora em que a CÂMARA tomou ciência' },
      { tipo: 'campo', rotulo: 'Quem comunicou (nome e setor)' },
      { tipo: 'campo', rotulo: 'Registro real ou simulado' },
      { tipo: 'secao', texto: '2. Descrição' },
      { tipo: 'campo', rotulo: 'Tipo (vazamento, acesso indevido, perda, alteração, outro)' },
      { tipo: 'campo', rotulo: 'Descrição do ocorrido' },
      { tipo: 'campo', rotulo: 'Sistemas, documentos ou equipamentos envolvidos' },
      { tipo: 'secao', texto: '3. Dados e titulares afetados' },
      { tipo: 'campo', rotulo: 'Categorias de dados pessoais afetados' },
      { tipo: 'campo', rotulo: 'Há dados sensíveis ou de crianças e adolescentes?' },
      { tipo: 'campo', rotulo: 'Quantidade estimada de titulares' },
      { tipo: 'secao', texto: '4. Avaliação de risco' },
      { tipo: 'campo', rotulo: 'Severidade (alta, média, baixa) e justificativa' },
      { tipo: 'campo', rotulo: 'Há risco ou dano relevante aos titulares?' },
      { tipo: 'secao', texto: '5. Providências' },
      { tipo: 'campo', rotulo: 'Medidas de contenção adotadas (data e responsável)' },
      { tipo: 'campo', rotulo: 'Comunicação à ANPD (data e protocolo, se houver)' },
      { tipo: 'campo', rotulo: 'Comunicação aos titulares (data e meio, se houver)' },
      { tipo: 'campo', rotulo: 'Medidas para evitar novos incidentes' },
      { tipo: 'secao', texto: '6. Evidências anexadas' },
      { tipo: 'campo', rotulo: 'Relação de documentos, prints e logs anexados' },
      { tipo: 'assinatura', linhas: [`${ctx.org.local}, ____ de ______________ de ______.`, 'Encarregado pelo tratamento de dados pessoais'] }
    ];
  }
};
