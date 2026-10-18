// Gerador de minutas: monta o contexto (organizacao, encarregado, ROPA,
// terceiro), aplica o modelo e salva DOCX + PDF no repositorio.
const { MODELOS, porId } = require('../modelos-documentos');
const { criarContexto } = require('../modelos-documentos/_comum');
const { paraTexto, paraDocx, paraPdf, MARCA_MINUTA } = require('./renderDocumento');
const { registrarHistorico } = require('./historico');
const { converterParaPdfA, PdfaIndisponivelError } = require('./pdfa');
const { urlTransparencia, urlCanalTitular } = require('./appUrl');

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class ErroGerador extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

async function montar(db, organizacaoId, modeloId, { terceiroId, agora = new Date() } = {}) {
  const modelo = porId(modeloId);
  if (!modelo) throw new ErroGerador(404, 'Modelo não encontrado');
  let terceiro = null;
  if (modelo.precisaTerceiro) {
    if (!terceiroId) throw new ErroGerador(400, 'Escolha o terceiro para este modelo');
    terceiro = await db.terceiro.findFirst({ where: { id: terceiroId, organizacaoId } });
    if (!terceiro) throw new ErroGerador(400, 'Terceiro inválido');
  }
  const org = await db.organizacao.findUnique({ where: { id: organizacaoId } });
  const tratamentos = await db.tratamento.findMany({
    where: { organizacaoId, ativo: true }, include: { compartilhamentos: true }, orderBy: { nome: 'asc' }
  });
  const ctx = criarContexto({
    org, tratamentos, terceiro, agora,
    urls: org?.slug
      ? { transparencia: urlTransparencia(org.slug), canal: urlCanalTitular(org.slug) }
      : { transparencia: '[PREENCHER: link da página de transparência]', canal: '[PREENCHER: link do canal do titular]' }
  });
  if (!org?.slug) ctx.pendencias.push('link público da organização (cadastre o slug no Admin)');
  const titulo = terceiro ? `${modelo.titulo} — ${terceiro.razaoSocial}` : modelo.titulo;
  return { modelo, terceiro, org, titulo, blocos: modelo.montar(ctx), pendencias: ctx.pendencias };
}

async function previa(db, organizacaoId, modeloId, opcoes) {
  const m = await montar(db, organizacaoId, modeloId, opcoes);
  return { titulo: m.titulo, texto: paraTexto(m.titulo, m.blocos), pendencias: m.pendencias };
}

// Gera DOCX e PDF e salva os dois no repositorio (status RASCUNHO) com a
// mesma versao. Versao = maior versao ja gerada daquele modelo (+ terceiro) + 1.
// Etapa 7b: o PDF sai em PDF/A-2b pelo mesmo conversor dos relatorios
// (Ghostscript). Sem Ghostscript no servidor, sai PDF comum e o retorno
// avisa (pdfa: false). opcoes.converterPdfA permite injetar nos testes.
async function gerar(db, organizacaoId, modeloId, { terceiroId, usuarioId, agora = new Date(), converterPdfA = converterParaPdfA } = {}) {
  const m = await montar(db, organizacaoId, modeloId, { terceiroId, agora });
  const orgNome = m.org?.nome || '';
  const [docx, pdfComum] = await Promise.all([paraDocx(m.titulo, m.blocos, { orgNome }), paraPdf(m.titulo, m.blocos, { orgNome })]);
  let pdf = pdfComum;
  let pdfa = true;
  try {
    pdf = await converterPdfA(pdfComum, { titulo: m.titulo });
  } catch (e) {
    if (!(e instanceof PdfaIndisponivelError)) throw e;
    pdfa = false;
  }
  const formatoPdf = pdfa ? 'PDF/A' : 'PDF';

  const tagModelo = `modelo:${m.modelo.id}${m.terceiro ? `:${m.terceiro.id}` : ''}`;
  const anteriores = await db.documentoRepositorio.findMany({
    where: { organizacaoId, tags: { has: tagModelo } }, select: { versao: true }
  });
  const versao = anteriores.reduce((max, d) => Math.max(max, d.versao), 0) + 1;
  const data = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const base = m.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80);

  const criados = await db.$transaction(async (tx) => {
    const salvos = [];
    for (const [formato, buf, mime] of [['DOCX', docx, MIME_DOCX], [formatoPdf, pdf, 'application/pdf']]) {
      const doc = await tx.documentoRepositorio.create({
        data: {
          organizacaoId, tipo: m.modelo.categoria, titulo: `${m.titulo} (v${versao}, ${formato})`,
          descricao: `${MARCA_MINUTA}. Gerada em ${data}.${m.pendencias.length ? ` Pendências: ${m.pendencias.join('; ')}.` : ''}`,
          arquivo: buf, mimetype: mime, nomeArquivo: `${base}-v${versao}${formato === 'PDF/A' ? '-pdfa.pdf' : '.' + formato.toLowerCase()}`, tamanhoBytes: buf.length,
          versao, status: 'RASCUNHO', autorId: usuarioId, tags: ['minuta-gerada', tagModelo]
        },
        select: { id: true, titulo: true, versao: true, mimetype: true, nomeArquivo: true }
      });
      await registrarHistorico(tx, {
        organizacaoId, entidade: 'DOCUMENTO', registroId: doc.id, acao: 'CRIAR', usuarioId,
        diff: {
          origem: { antes: null, depois: 'Gerado a partir de modelo' },
          modelo: { antes: null, depois: m.modelo.titulo }, versao: { antes: null, depois: versao },
          formato: { antes: null, depois: formato }, ...(m.terceiro && { terceiro: { antes: null, depois: m.terceiro.razaoSocial } }),
          ...(m.pendencias.length && { pendencias: { antes: null, depois: m.pendencias } })
        }
      });
      salvos.push({ ...doc, formato });
    }
    return salvos;
  });
  return { versao, documentos: criados, pendencias: m.pendencias, pdfa };
}

function listarModelos() {
  return MODELOS.map(({ id, titulo, categoria, descricao, precisaTerceiro }) => ({ id, titulo, categoria, descricao, precisaTerceiro }));
}

module.exports = { listarModelos, previa, gerar, montar, ErroGerador };
