const express = require('express');
const { authUsuario } = require('../middlewares/authUsuario');
const { ehGestorOuDpo } = require('../middlewares/requireModulo');
const { registrarHistorico } = require('../services/historico');
const { FAQ_PADRAO } = require('../services/faqPadrao');
const { urlTransparencia, urlCanalTitular } = require('../services/appUrl');

const router = express.Router();
const { prisma } = require('../db');

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const CAMPOS = {
  encarregadoNome: 200, encarregadoEmail: 200, encarregadoTelefone: 40, enderecoSede: 300, municipio: 120, uf: 2
};
const SELECT_DADOS = { id: true, nome: true, cnpj: true, slug: true, ...Object.fromEntries(Object.keys(CAMPOS).map(c => [c, true])) };

router.use(authUsuario);

// ---------- Dados do encarregado e da sede ----------

router.get('/dados', async (req, res) => {
  try {
    res.json(await prisma.organizacao.findUnique({ where: { id: req.usuario.organizacaoId }, select: SELECT_DADOS }));
  } catch (err) {
    console.error('[GET /organizacao/dados]', err);
    res.status(500).json({ erro: 'Erro ao carregar dados' });
  }
});

router.put('/dados', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem editar os dados do encarregado' });
    const b = req.body || {};
    const data = {};
    for (const [campo, max] of Object.entries(CAMPOS)) {
      if (b[campo] === undefined) continue;
      const v = b[campo] === null ? '' : String(b[campo]).trim();
      if (v.length > max) return res.status(400).json({ erro: `${campo} excede ${max} caracteres` });
      data[campo] = v || null;
    }
    if (data.uf) {
      data.uf = data.uf.toUpperCase();
      if (!UFS.includes(data.uf)) return res.status(400).json({ erro: 'UF inválida' });
    }
    if (data.encarregadoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.encarregadoEmail)) {
      return res.status(400).json({ erro: 'E-mail do encarregado inválido' });
    }
    const orgId = req.usuario.organizacaoId;
    const antes = await prisma.organizacao.findUnique({ where: { id: orgId }, select: SELECT_DADOS });
    const depois = await prisma.$transaction(async (tx) => {
      const atualizada = await tx.organizacao.update({ where: { id: orgId }, data, select: SELECT_DADOS });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'ORGANIZACAO', registroId: orgId, acao: 'EDITAR', usuarioId: req.usuario.id, antes, depois: atualizada
      });
      return atualizada;
    });
    res.json(depois);
  } catch (err) {
    console.error('[PUT /organizacao/dados]', err);
    res.status(500).json({ erro: 'Erro ao salvar dados' });
  }
});

// ---------- FAQ da pagina publica ----------

router.get('/faq', async (req, res) => {
  try {
    const org = await prisma.organizacao.findUnique({ where: { id: req.usuario.organizacaoId }, select: { faqPortal: true } });
    const personalizado = Array.isArray(org?.faqPortal);
    res.json({ faq: personalizado ? org.faqPortal : FAQ_PADRAO, personalizado, padrao: FAQ_PADRAO });
  } catch (err) {
    console.error('[GET /organizacao/faq]', err);
    res.status(500).json({ erro: 'Erro ao carregar FAQ' });
  }
});

// PUT /organizacao/faq { faq: [{ pergunta, resposta }] } — faq: null volta ao padrao
router.put('/faq', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem editar o FAQ' });
    const lista = req.body?.faq;
    let faqPortal = null;
    if (lista !== null) {
      if (!Array.isArray(lista) || lista.length > 30) return res.status(400).json({ erro: 'Envie de 0 a 30 perguntas' });
      faqPortal = [];
      for (const item of lista) {
        const pergunta = typeof item?.pergunta === 'string' ? item.pergunta.trim() : '';
        const resposta = typeof item?.resposta === 'string' ? item.resposta.trim() : '';
        if (!pergunta || !resposta) return res.status(400).json({ erro: 'Toda pergunta precisa de resposta' });
        if (pergunta.length > 300 || resposta.length > 3000) return res.status(400).json({ erro: 'Pergunta ou resposta muito longa' });
        faqPortal.push({ pergunta, resposta });
      }
    }
    const orgId = req.usuario.organizacaoId;
    const antes = await prisma.organizacao.findUnique({ where: { id: orgId }, select: { faqPortal: true } });
    await prisma.$transaction(async (tx) => {
      await tx.organizacao.update({ where: { id: orgId }, data: { faqPortal } });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'ORGANIZACAO', registroId: orgId, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { faqPortal: { antes: antes?.faqPortal ? `${antes.faqPortal.length} pergunta(s) personalizada(s)` : 'FAQ padrão', depois: faqPortal ? `${faqPortal.length} pergunta(s) personalizada(s)` : 'FAQ padrão' } }
      });
    });
    res.json({ faq: faqPortal || FAQ_PADRAO, personalizado: !!faqPortal });
  } catch (err) {
    console.error('[PUT /organizacao/faq]', err);
    res.status(500).json({ erro: 'Erro ao salvar FAQ' });
  }
});

// ---------- Trecho HTML para o portal ----------
// HTML simples, sem script nem estilo externo, para colar no portal (Plone etc.).

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

router.get('/trecho-portal', async (req, res) => {
  try {
    const org = await prisma.organizacao.findUnique({ where: { id: req.usuario.organizacaoId }, select: { nome: true, slug: true, encarregadoNome: true, encarregadoEmail: true } });
    if (!org?.slug) return res.status(400).json({ erro: 'A organização ainda não tem endereço público (slug). Peça ao administrador para cadastrar.' });
    const transparencia = urlTransparencia(org.slug);
    const canal = urlCanalTitular(org.slug);
    const linhas = [
      '<div class="lgpd-transparencia">',
      '  <h2>Proteção de Dados Pessoais (LGPD)</h2>',
      `  <p>Saiba como a ${escaparHtml(org.nome)} trata os seus dados pessoais e como exercer os seus direitos.</p>`,
      '  <ul>',
      `    <li><a href="${escaparHtml(transparencia)}" target="_blank" rel="noopener">Tratamento de dados pessoais e encarregado</a></li>`,
      `    <li><a href="${escaparHtml(canal)}" target="_blank" rel="noopener">Exercer meus direitos como titular de dados</a></li>`,
      '  </ul>'
    ];
    if (org.encarregadoNome && org.encarregadoEmail) {
      linhas.push(`  <p>Encarregado: ${escaparHtml(org.encarregadoNome)} — <a href="mailto:${escaparHtml(org.encarregadoEmail)}">${escaparHtml(org.encarregadoEmail)}</a></p>`);
    }
    linhas.push('</div>');
    res.json({ html: linhas.join('\n'), urlTransparencia: transparencia, urlCanal: canal });
  } catch (err) {
    console.error('[GET /organizacao/trecho-portal]', err);
    res.status(500).json({ erro: 'Erro ao gerar trecho' });
  }
});

module.exports = router;
