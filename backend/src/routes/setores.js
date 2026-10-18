const express = require('express');
const { authUsuario } = require('../middlewares/authUsuario');
const { ehGestorOuDpo } = require('../middlewares/requireModulo');
const { registrarHistorico } = require('../services/historico');

const router = express.Router();
const { prisma } = require('../db');

// Setores da organizacao (cadastro transversal, sem modulo). Leitura
// para todos; escrita so GESTOR/DPO (configuracao da organizacao).
router.use(authUsuario);

function nomeValido(nome) {
  const n = typeof nome === 'string' ? nome.trim() : '';
  return n.length >= 2 && n.length <= 120 ? n : null;
}

// GET /setores?ativos=1 — ativos=1 filtra so os ativos (seletores)
router.get('/', async (req, res) => {
  try {
    const where = { organizacaoId: req.usuario.organizacaoId };
    if (req.query.ativos === '1') where.ativo = true;
    const setores = await prisma.setor.findMany({ where, orderBy: { nome: 'asc' } });
    res.json(setores);
  } catch (err) {
    console.error('[GET /setores]', err);
    res.status(500).json({ erro: 'Erro ao listar setores' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem cadastrar setores' });
    const nome = nomeValido(req.body.nome);
    if (!nome) return res.status(400).json({ erro: 'Nome do setor deve ter entre 2 e 120 caracteres' });
    const setor = await prisma.$transaction(async (tx) => {
      const criado = await tx.setor.create({ data: { organizacaoId: req.usuario.organizacaoId, nome } });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SETOR', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null, depois: criado
      });
      return criado;
    });
    res.status(201).json(setor);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Já existe um setor com esse nome' });
    console.error('[POST /setores]', err);
    res.status(500).json({ erro: 'Erro ao criar setor' });
  }
});

// PUT /setores/:id — renomeia e/ou ativa/desativa
router.put('/:id', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem editar setores' });
    const existente = await prisma.setor.findFirst({ where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId } });
    if (!existente) return res.status(404).json({ erro: 'Setor não encontrado' });
    const data = {};
    if (req.body.nome !== undefined) {
      const nome = nomeValido(req.body.nome);
      if (!nome) return res.status(400).json({ erro: 'Nome do setor deve ter entre 2 e 120 caracteres' });
      data.nome = nome;
    }
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;
    const setor = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.setor.update({ where: { id: existente.id }, data });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SETOR', registroId: existente.id,
        acao: data.ativo === false ? 'EXCLUIR' : 'EDITAR', usuarioId: req.usuario.id, antes: existente, depois: atualizado
      });
      return atualizado;
    });
    res.json(setor);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Já existe um setor com esse nome' });
    console.error('[PUT /setores/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar setor' });
  }
});

module.exports = router;
