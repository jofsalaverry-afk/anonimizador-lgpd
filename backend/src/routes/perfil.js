const express = require('express');
const { authUsuario } = require('../middlewares/authUsuario');
const router = express.Router();
const { prisma } = require('../db');

// Auth compartilhado: rejeita tokens intermediarios de MFA (mfaPending/mfaSetup).
const auth = authUsuario;

router.get('/perfil', auth, async (req, res) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { id: true, nome: true, cnpj: true, municipio: true, cabecalho: true, logoBase64: true, plano: true }
    });
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: { id: true, nome: true, email: true, perfil: true }
    });
    res.json({ ...org, usuario });
  } catch { res.status(500).json({ erro: 'Erro ao buscar perfil' }); }
});

router.put('/perfil', auth, async (req, res) => {
  try {
    // Apenas GESTOR e ENCARREGADO_LGPD podem alterar perfil da organizacao
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para alterar perfil da organização' });
    }
    const { municipio, cabecalho, logoBase64 } = req.body;
    const org = await prisma.organizacao.update({
      where: { id: req.usuario.organizacaoId },
      data: { municipio, cabecalho, logoBase64 },
      select: { id: true, nome: true, cnpj: true, municipio: true, cabecalho: true, logoBase64: true, plano: true }
    });
    res.json(org);
  } catch { res.status(500).json({ erro: 'Erro ao salvar perfil' }); }
});

module.exports = router;
