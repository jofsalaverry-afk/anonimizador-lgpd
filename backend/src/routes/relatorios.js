const express = require('express');
const { authUsuario } = require('../middlewares/authUsuario');
const { RELATORIOS, gerarRelatorioPdf } = require('../services/relatoriosPdf');
const { converterParaPdfA, statusPdfa, PdfaIndisponivelError } = require('../services/pdfa');

const router = express.Router();
const { prisma } = require('../db');

router.use(authUsuario);

// GET /relatorios/pdfa/status — se o servidor consegue gerar PDF/A
router.get('/pdfa/status', (req, res) => {
  res.json(statusPdfa());
});

// GET /relatorios/:tipo/pdfa — tipo: ropa | dsar | incidentes | indicadores
router.get('/:tipo/pdfa', async (req, res) => {
  try {
    const def = RELATORIOS[req.params.tipo];
    if (!def) return res.status(404).json({ erro: 'Relatório inexistente' });
    const orgId = req.usuario.organizacaoId;
    if (def.modulo) {
      const org = await prisma.organizacao.findUnique({ where: { id: orgId }, select: { modulosAtivos: true } });
      if (!org?.modulosAtivos.includes(def.modulo)) {
        return res.status(403).json({ erro: `Módulo "${def.modulo}" não está ativo para sua organização.` });
      }
    }
    if (req.params.tipo === 'dsar' && req.usuario.perfil === 'TREINANDO') {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    const { pdf, titulo } = await gerarRelatorioPdf(prisma, req.params.tipo, orgId);
    const pdfa = await converterParaPdfA(pdf, { titulo });
    const data = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${req.params.tipo}-${data}-pdfa.pdf"`);
    res.send(pdfa);
  } catch (err) {
    if (err instanceof PdfaIndisponivelError) return res.status(503).json({ erro: err.message });
    console.error('[GET /relatorios/:tipo/pdfa]', err);
    res.status(500).json({ erro: 'Erro ao gerar relatório PDF/A' });
  }
});

module.exports = router;
