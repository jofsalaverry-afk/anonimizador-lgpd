const express = require('express');
const { FAQ_PADRAO } = require('../services/faqPadrao');
const { rotuloBaseLegal, normalizarCategorias } = require('../services/basesLegais');

const router = express.Router();
const { prisma } = require('../db');

const DIREITOS = [
  'Confirmação da existência de tratamento',
  'Acesso aos dados',
  'Correção de dados incompletos, inexatos ou desatualizados',
  'Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD',
  'Portabilidade dos dados, observada a regulamentação da ANPD',
  'Eliminação dos dados tratados com consentimento, ressalvadas as hipóteses legais de conservação',
  'Informação sobre as entidades com as quais a Câmara compartilhou dados',
  'Informação sobre a possibilidade de não fornecer consentimento e suas consequências',
  'Revogação do consentimento',
  'Petição à Autoridade Nacional de Proteção de Dados (ANPD)'
];

// GET /transparencia/publico/:slug — publico, sem login.
// Expoe APENAS o que e informacao ao titular (art. 9 e 23 LGPD): nada de
// responsavel interno, setor, CNPJ de terceiro, risco, anexos ou ids.
router.get('/publico/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const org = await prisma.organizacao.findUnique({
      where: { slug },
      select: {
        id: true, nome: true, municipio: true, uf: true, ativo: true, modulosAtivos: true, logoBase64: true,
        encarregadoNome: true, encarregadoEmail: true, encarregadoTelefone: true, enderecoSede: true, faqPortal: true
      }
    });
    if (!slug || !org || !org.ativo) return res.status(404).json({ erro: 'Página não encontrada' });

    const tratamentos = org.modulosAtivos.includes('ropa')
      ? await prisma.tratamento.findMany({
        where: { organizacaoId: org.id, ativo: true },
        select: {
          nome: true, finalidade: true, baseLegal: true, baseLegalSensivel: true, categoriasDados: true, categoriasTitulares: true,
          compartilhamentos: { select: { terceiroNome: true, finalidadeCompartilhamento: true, paisDestino: true } }
        },
        orderBy: { nome: 'asc' }
      })
      : [];

    res.json({
      organizacao: { nome: org.nome, municipio: org.municipio, uf: org.uf, logoBase64: org.logoBase64 || null },
      encarregado: { nome: org.encarregadoNome, email: org.encarregadoEmail, telefone: org.encarregadoTelefone },
      enderecoSede: org.enderecoSede,
      tratamentos: tratamentos.map(t => ({
        nome: t.nome,
        finalidade: t.finalidade,
        baseLegal: rotuloBaseLegal(t.baseLegal),
        baseLegalSensivel: rotuloBaseLegal(t.baseLegalSensivel) || null,
        categoriasDados: normalizarCategorias(t.categoriasDados),
        categoriasTitulares: normalizarCategorias(t.categoriasTitulares),
        compartilhamentos: t.compartilhamentos.map(c => {
          const pais = c.paisDestino || 'Brasil';
          return { destinatario: c.terceiroNome, finalidade: c.finalidadeCompartilhamento, pais, transferenciaInternacional: pais.trim().toLowerCase() !== 'brasil' };
        })
      })),
      direitos: DIREITOS,
      faq: Array.isArray(org.faqPortal) ? org.faqPortal : FAQ_PADRAO,
      canalSolicitacao: org.modulosAtivos.includes('dsar') ? `#solicitar/${slug}` : null
    });
  } catch (err) {
    console.error('[GET /transparencia/publico/:slug]', err);
    res.status(500).json({ erro: 'Erro ao carregar a página' });
  }
});

module.exports = router;
