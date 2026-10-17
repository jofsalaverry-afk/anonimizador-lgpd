const express = require('express');
const { authUsuario } = require('../middlewares/authUsuario');
const { ehGestorOuDpo } = require('../middlewares/requireModulo');
const { auditarEvento } = require('../middlewares/auditoria');
const { gerarPacote } = require('../services/portabilidade');

const router = express.Router();
const { prisma } = require('../db');

router.use(authUsuario);

// GET /portabilidade/pacote — ZIP com todos os dados da organizacao.
// So Gestor/DPO. Registrado na trilha de auditoria (exportacao em massa
// de dados pessoais).
router.get('/pacote', async (req, res) => {
  if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem gerar o pacote de portabilidade' });
  const data = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="portabilidade-${data}.zip"`);
  try {
    const r = await gerarPacote(prisma, req.usuario.organizacaoId, res);
    auditarEvento(prisma, { req, evento: 'exportacao_portabilidade', detalhes: r });
    res.end();
  } catch (err) {
    console.error('[GET /portabilidade/pacote]', err);
    // Se o ZIP ja comecou a sair, so da para abortar a conexao.
    if (res.headersSent) return res.destroy(err);
    res.removeHeader('Content-Disposition');
    res.status(500).json({ erro: 'Erro ao gerar o pacote' });
  }
});

module.exports = router;
