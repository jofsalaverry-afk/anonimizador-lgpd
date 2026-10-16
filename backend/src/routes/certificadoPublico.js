const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /certificado/verificar/:codigo — publico, sem login. Confirma se o
// certificado existe e devolve SO nome, trilha e data de conclusao
// (sem e-mail, organizacao interna, ids ou carga de outros dados).
router.get('/verificar/:codigo', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) {
      return res.status(404).json({ valido: false, erro: 'Certificado não encontrado' });
    }
    const cert = await prisma.certificadoTreinamento.findUnique({
      where: { codigo },
      select: { nomeUsuario: true, trilhaTitulo: true, concluidoEm: true }
    });
    if (!cert) return res.status(404).json({ valido: false, erro: 'Certificado não encontrado' });
    res.json({ valido: true, nome: cert.nomeUsuario, trilha: cert.trilhaTitulo, concluidoEm: cert.concluidoEm });
  } catch (err) {
    console.error('[GET /certificado/verificar]', err);
    res.status(500).json({ erro: 'Erro ao verificar certificado' });
  }
});

module.exports = router;
