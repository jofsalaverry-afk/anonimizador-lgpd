// Relatorios em PDF (pdfkit) que depois viram PDF/A-2b (services/pdfa.js).
// Regras para o PDF/A passar: so cores RGB solidas, sem transparencia,
// sem links externos JavaScript; fontes sao embutidas pelo Ghostscript.
const PDFDocument = require('pdfkit');
const { gerarExport } = require('./exportadores');
const { calcularIndicadores } = require('./indicadores');
const { fmtData, fmtDiaSP, fmtDataHora } = require('./datas');
const R = require('./rotulos');
const { textoRetencao } = require('./basesLegais');

function novoDoc(titulo, orgNome) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: titulo, Author: orgNome, Creator: 'Complidata' } });
  const partes = [];
  doc.on('data', b => partes.push(b));
  const pronto = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a2e').text(titulo);
  doc.font('Helvetica').fontSize(10).fillColor('#475569')
    .text(`${orgNome} · gerado em ${fmtDataHora(new Date())}`);
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown(0.8);
  return { doc, pronto };
}

// Bloco "registro": titulo + pares campo: valor (pula vazios).
function bloco(doc, titulo, pares) {
  if (doc.y > 720) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(titulo);
  doc.font('Helvetica').fontSize(9).fillColor('#1f2937');
  for (const [rotulo, valor] of pares) {
    if (valor === '' || valor === null || valor === undefined) continue;
    doc.font('Helvetica-Bold').text(`${rotulo}: `, { continued: true }).font('Helvetica').text(String(valor));
  }
  doc.moveDown(0.6);
}


const RELATORIOS = {
  ropa: {
    titulo: 'Registro das Operações de Tratamento (ROPA)',
    modulo: 'ropa',
    async montar(doc, db, org) {
      const { linhas } = await gerarExport(db, 'ropa', org);
      const ativos = linhas.filter(l => l.ativo);
      doc.fontSize(10).text(`${ativos.length} tratamento(s) ativo(s), ${ativos.filter(l => l.mapeado).length} com mapeamento completo.`).moveDown();
      for (const l of ativos) {
        bloco(doc, l.nome, [
          ['Finalidade', l.finalidade], ['Base legal (LGPD, art. 7º ou art. 11)', [l.baseLegal, l.baseLegalSensivel].filter(Boolean).join(' / ')], ['Setor', l.setor], ['Responsável', l.responsavel],
          ['Categorias de dados', l.categoriasDados], ['Titulares', l.categoriasTitulares], ['Retenção', textoRetencao(l.retencaoDias)],
          ['Descarte', l.formaDescarte], ['Sistemas', l.sistemas], ['Outros meios', l.outrosMeios],
          ['Compartilhamentos', l.compartilhamentos], ['Medidas de segurança', l.medidasSeguranca],
          ['Mapeamento', l.mapeado ? 'completo' : `pendente (${l.pendencias})`]
        ]);
      }
    }
  },
  dsar: {
    titulo: 'Relatório de solicitações de titulares (DSAR)',
    modulo: 'dsar',
    async montar(doc, db, org) {
      const { linhas } = await gerarExport(db, 'dsar', org);
      doc.fontSize(10).text(`${linhas.length} solicitação(ões). Dados do titular omitidos neste relatório; constam no sistema e na exportação.`).moveDown();
      for (const l of linhas) {
        // recebimento, prazo e resposta sao instantes: dia em Sao Paulo
        bloco(doc, `${l.protocolo} — ${R.rotulo(R.TIPO_DIREITO, l.tipoDireito)}`, [
          ['Situação', R.rotulo(R.STATUS, l.status)], ['Recebida', fmtDiaSP(l.dataRecebimento)], ['Prazo', fmtDiaSP(l.dataLimite)],
          ['Respondida', fmtDiaSP(l.dataResposta)], ['No prazo', l.noPrazo === '' ? 'pendente' : (l.noPrazo ? 'sim' : 'não')],
          ['Responsável', l.responsavel], ['Providências', l.providencias]
        ]);
      }
    }
  },
  incidentes: {
    titulo: 'Relatório de incidentes de segurança',
    modulo: 'repositorio',
    async montar(doc, db, org) {
      const { linhas } = await gerarExport(db, 'incidentes', org);
      doc.fontSize(10).text(`${linhas.filter(l => l.tipoRegistro === 'REAL').length} incidente(s) real(is) e ${linhas.filter(l => l.tipoRegistro === 'SIMULADO').length} simulado(s).`).moveDown();
      for (const l of linhas) {
        bloco(doc, `${l.tipoRegistro === 'SIMULADO' ? '[SIMULADO] ' : ''}${l.titulo}`, [
          ['Tipo', R.rotulo(R.TIPO_INCIDENTE, l.tipoIncidente)], ['Severidade', R.rotulo(R.NIVEL, l.severidade)], ['Situação', R.rotulo(R.STATUS, l.status)],
          ['Ocorrência', fmtData(l.dataOcorrencia)], ['Ciência', fmtData(l.dataCiencia)],
          ...(l.tipoRegistro === 'SIMULADO' ? [['Comunicação à ANPD', 'não se aplica (simulado)']] : [
            ['Pode acarretar risco ou dano relevante', R.rotulo(R.RISCO_INCIDENTE, l.riscoRelevante)],
            ['Prazo de comunicação (3 dias úteis da ciência)', fmtData(l.prazoComunicacao)],
            ['Comunicação à ANPD', fmtData(l.dataComunicacaoANPD) || (l.notificadoANPD ? 'sim (sem data)' : 'não')],
            ['Comunicação aos titulares', fmtData(l.dataComunicacaoTitulares)]
          ]),
          ['Titulares afetados', l.qtdTitulares], ['Dados afetados', l.dadosAfetados],
          ['Responsável', l.responsavel], ['Descrição', l.descricao], ['Medidas para evitar recorrência', l.planoAcao],
          ['Providências', (l.providencias || '').replace(/(d{4})-(d{2})-(d{2})/g, '$3/$2/$1')]
        ]);
      }
    }
  },
  indicadores: {
    titulo: 'Painel de indicadores de conformidade LGPD',
    modulo: null,
    async montar(doc, db, org) {
      const r = await calcularIndicadores(db, org);
      doc.fontSize(10).text(`Mês de referência: ${r.mesReferencia}`).moveDown();
      for (const i of r.indicadores) {
        const valor = i.chave === 'INCIDENTES'
          ? `${i.incidentesReaisNoMes ?? '-'} incidente(s) real(is) no mês; último simulado: ${fmtData(i.ultimoSimulado) || 'nenhum'}`
          : i.status === 'INATIVO' ? '' : `${i.n}/${i.total}${i.percentual !== null ? ` (${i.percentual}%)` : ''} — meta ${i.meta}%`;
        const situacao = { OK: 'OK', PENDENTE: 'Pendente', INATIVO: 'Módulo inativo', SEM_DADOS: 'Sem dados no mês' }[i.status] || i.status;
        bloco(doc, `${i.titulo}: ${situacao}`, [['Resultado', i.status === 'SEM_DADOS' ? '' : valor], ['Observação', i.observacao]]);
      }
    }
  }
};

async function gerarRelatorioPdf(db, tipo, organizacaoId) {
  const def = RELATORIOS[tipo];
  const org = await db.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } });
  const { doc, pronto } = novoDoc(def.titulo, org?.nome || '');
  await def.montar(doc, db, organizacaoId);
  doc.end();
  return { pdf: await pronto, titulo: def.titulo };
}

module.exports = { RELATORIOS, gerarRelatorioPdf };
