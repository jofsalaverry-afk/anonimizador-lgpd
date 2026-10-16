const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const bcrypt = require('bcrypt');
const { ehGestorOuDpo } = require('../middlewares/requireModulo');
const { registrarHistorico } = require('../services/historico');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authUsuario);

// GET /usuarios — usuarios ativos da propria organizacao, para os
// seletores de responsavel. Nao expoe email nem dados de login.
router.get('/', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { organizacaoId: req.usuario.organizacaoId, ativo: true, deletedAt: null },
      select: { id: true, nome: true, perfil: true },
      orderBy: { nome: 'asc' }
    });
    res.json(usuarios);
  } catch (err) {
    console.error('[GET /usuarios]', err);
    res.status(500).json({ erro: 'Erro ao listar usuários' });
  }
});

// ==================== Gestao de usuarios pela propria organizacao ====================
// Gestor e DPO criam usuarios, trocam perfil e ativam/desativam, SEMPRE
// dentro da propria organizacao. Nao existe perfil de admin aqui (o admin
// do sistema e outra tabela e outro login). Ninguem altera o proprio
// perfil nem se desativa (evita perder o ultimo acesso de gestao).

const PERFIS = ['ENCARREGADO_LGPD', 'GESTOR', 'OPERADOR', 'AUDITOR', 'TREINANDO'];
const SELECT_GESTAO = { id: true, nome: true, email: true, perfil: true, ativo: true, mfaAtivo: true, ultimoAcesso: true, criadoEm: true };

function exigirGestao(req, res) {
  if (!ehGestorOuDpo(req)) {
    res.status(403).json({ erro: 'Apenas Gestor ou DPO gerenciam usuários' });
    return false;
  }
  return true;
}

async function usuarioDaOrg(id, organizacaoId) {
  return prisma.usuario.findFirst({ where: { id, organizacaoId, deletedAt: null }, select: SELECT_GESTAO });
}

router.get('/gestao', async (req, res) => {
  try {
    if (!exigirGestao(req, res)) return;
    res.json(await prisma.usuario.findMany({
      where: { organizacaoId: req.usuario.organizacaoId, deletedAt: null }, select: SELECT_GESTAO, orderBy: { nome: 'asc' }
    }));
  } catch (err) {
    console.error('[GET /usuarios/gestao]', err);
    res.status(500).json({ erro: 'Erro ao listar usuários' });
  }
});

// POST /usuarios { nome, email, senha, perfil } — senha inicial definida pelo gestor
router.post('/', async (req, res) => {
  try {
    if (!exigirGestao(req, res)) return;
    const { nome, email, senha, perfil } = req.body || {};
    const n = typeof nome === 'string' ? nome.trim() : '';
    const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (n.length < 2 || n.length > 200) return res.status(400).json({ erro: 'Nome deve ter entre 2 e 200 caracteres' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ erro: 'E-mail inválido' });
    if (typeof senha !== 'string' || senha.length < 8 || senha.length > 200) return res.status(400).json({ erro: 'Senha inicial deve ter ao menos 8 caracteres' });
    if (!PERFIS.includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido' });
    const senhaHash = await bcrypt.hash(senha, 10);
    const orgId = req.usuario.organizacaoId;
    const criado = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.create({
        data: { nome: n.normalize('NFC'), email: e, senhaHash, perfil, organizacaoId: orgId },
        select: SELECT_GESTAO
      });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'USUARIO', registroId: u.id, acao: 'CRIAR', usuarioId: req.usuario.id,
        antes: null, depois: { nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo }
      });
      return u;
    });
    res.status(201).json(criado);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'E-mail já cadastrado' });
    console.error('[POST /usuarios]', err);
    res.status(500).json({ erro: 'Erro ao criar usuário' });
  }
});

router.patch('/:id/perfil', async (req, res) => {
  try {
    if (!exigirGestao(req, res)) return;
    if (req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode alterar o seu próprio perfil' });
    const { perfil } = req.body || {};
    if (!PERFIS.includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido' });
    const orgId = req.usuario.organizacaoId;
    const alvo = await usuarioDaOrg(req.params.id, orgId);
    if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const atualizado = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id: alvo.id }, data: { perfil }, select: SELECT_GESTAO });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'USUARIO', registroId: alvo.id, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { perfil: { antes: alvo.perfil, depois: perfil } }
      });
      return u;
    });
    res.json(atualizado);
  } catch (err) {
    console.error('[PATCH /usuarios/:id/perfil]', err);
    res.status(500).json({ erro: 'Erro ao alterar perfil' });
  }
});

// PATCH /usuarios/:id/nome { nome } — Gestor/DPO corrigem o nome de
// qualquer usuario da organizacao (inclusive o proprio). Ex.: Gestores
// antigos que receberam o nome da camara na criacao.
router.patch('/:id/nome', async (req, res) => {
  try {
    if (!exigirGestao(req, res)) return;
    const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim().normalize('NFC') : '';
    if (nome.length < 2 || nome.length > 200) return res.status(400).json({ erro: 'Informe o nome (2 a 200 caracteres)' });
    const orgId = req.usuario.organizacaoId;
    const alvo = await usuarioDaOrg(req.params.id, orgId);
    if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (alvo.nome === nome) return res.json(alvo);
    const atualizado = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id: alvo.id }, data: { nome }, select: SELECT_GESTAO });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'USUARIO', registroId: alvo.id, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { nome: { antes: alvo.nome, depois: nome } }
      });
      return u;
    });
    res.json(atualizado);
  } catch (err) {
    console.error('[PATCH /usuarios/:id/nome]', err);
    res.status(500).json({ erro: 'Erro ao alterar nome' });
  }
});

// PATCH /usuarios/:id/ativo { ativo: true|false }
// Obs.: sessoes ja abertas do usuario desativado valem ate expirar (8h);
// novo login e bloqueado imediatamente.
router.patch('/:id/ativo', async (req, res) => {
  try {
    if (!exigirGestao(req, res)) return;
    if (req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode desativar a si mesmo' });
    const ativo = req.body?.ativo;
    if (typeof ativo !== 'boolean') return res.status(400).json({ erro: 'Informe ativo: true ou false' });
    const orgId = req.usuario.organizacaoId;
    const alvo = await usuarioDaOrg(req.params.id, orgId);
    if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const atualizado = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id: alvo.id }, data: { ativo }, select: SELECT_GESTAO });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'USUARIO', registroId: alvo.id, acao: ativo ? 'EDITAR' : 'EXCLUIR', usuarioId: req.usuario.id,
        diff: { ativo: { antes: alvo.ativo, depois: ativo } }
      });
      return u;
    });
    res.json(atualizado);
  } catch (err) {
    console.error('[PATCH /usuarios/:id/ativo]', err);
    res.status(500).json({ erro: 'Erro ao alterar usuário' });
  }
});

module.exports = router;
