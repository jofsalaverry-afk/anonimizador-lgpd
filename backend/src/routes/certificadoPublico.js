const express = require('express');
const { cargaHorariaTexto } = require('../services/certificado');

const router = express.Router();
const { prisma } = require('../db');

// GET /certificado/verificar/:codigo — publico, sem login. Confirma se o
// certificado existe e devolve SO nome, trilha, data, carga horaria e a
// identificacao publica da camara (sem e-mail, ids ou outros dados).
router.get('/verificar/:codigo', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) {
      return res.status(404).json({ valido: false, erro: 'Certificado não encontrado' });
    }
    const cert = await prisma.certificadoTreinamento.findUnique({
      where: { codigo },
      select: { nomeUsuario: true, trilhaTitulo: true, concluidoEm: true, cargaHorariaMin: true, nomeOrganizacao: true, organizacaoId: true }
    });
    if (!cert) return res.status(404).json({ valido: false, erro: 'Certificado não encontrado' });
    // Etapa 6c: identidade visual da camara emissora (dados publicos)
    const org = await prisma.organizacao.findUnique({
      where: { id: cert.organizacaoId }, select: { nome: true, municipio: true, uf: true, logoBase64: true }
    });
    res.json({
      valido: true, codigo, nome: cert.nomeUsuario, trilha: cert.trilhaTitulo, concluidoEm: cert.concluidoEm,
      cargaHoraria: cargaHorariaTexto(cert.cargaHorariaMin),
      organizacao: { nome: org?.nome || cert.nomeOrganizacao, municipio: org?.municipio || null, uf: org?.uf || null, logo: org?.logoBase64 || null }
    });
  } catch (err) {
    console.error('[GET /certificado/verificar]', err);
    res.status(500).json({ erro: 'Erro ao verificar certificado' });
  }
});

module.exports = router;
