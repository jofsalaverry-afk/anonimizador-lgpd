const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { requireModulo, podeEscrever, ehGestorOuDpo } = require('../middlewares/requireModulo');
const { registrarHistorico } = require('../services/historico');
const { responsavelValido, idsDaOrganizacao } = require('../services/entidades');
const { responderExport } = require('../services/exportadores');

const router = express.Router();
const prisma = new PrismaClient();

const TIPOS = ['APLICACAO', 'BANCO_DADOS', 'NUVEM', 'FISICO', 'OUTRO'];
const HOSPEDAGENS = ['ON_PREMISE', 'NUVEM'];

const SISTEMA_INCLUDE = {
  responsavel: { select: { id: true, nome: true } },
  terceiro: { select: { id: true, razaoSocial: true } },
  integracoesSaida: { include: { destino: { select: { id: true, nome: true, tipo: true } } } },
  integracoesEntrada: { include: { origem: { select: { id: true, nome: true, tipo: true } } } }
};

router.use(authUsuario, requireModulo(prisma, 'inventario'));

// Forma do sistema para o HistoricoRegistro: ids de relacao viram nomes.
function paraHistorico(s) {
  if (!s) return null;
  const { responsavel, terceiro, integracoesSaida, integracoesEntrada, tratamentos, ...resto } = s;
  return {
    ...resto,
    terceiroId: undefined,
    fornecedor: terceiro?.razaoSocial || null,
    integracoes: (integracoesSaida || []).map(i => i.destino?.nome).filter(Boolean).sort()
  };
}

// Integracoes nas duas direcoes, sem duplicar.
function comIntegracoes(s) {
  const mapa = new Map();
  for (const i of s.integracoesSaida || []) if (i.destino) mapa.set(i.destino.id, i.destino);
  for (const i of s.integracoesEntrada || []) if (i.origem) mapa.set(i.origem.id, i.origem);
  return { ...s, integracoes: [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome)) };
}

// Valida e normaliza o corpo. Retorna { erro } ou { data, integracaoIds }.
async function lerCorpo(req, { parcial }) {
  const b = req.body || {};
  const orgId = req.usuario.organizacaoId;
  const data = {};
  const set = (campo, valor) => { if (b[campo] !== undefined) data[campo] = valor; };

  if (!parcial || b.nome !== undefined) {
    const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
    if (!nome) return { erro: 'Nome é obrigatório' };
    data.nome = nome.slice(0, 200);
  }
  if (!parcial || b.tipo !== undefined) {
    if (!TIPOS.includes(b.tipo)) return { erro: 'Tipo inválido' };
    data.tipo = b.tipo;
  }
  if (b.tipoHospedagem !== undefined && b.tipoHospedagem !== null && b.tipoHospedagem !== '' && !HOSPEDAGENS.includes(b.tipoHospedagem)) {
    return { erro: 'Tipo de hospedagem inválido' };
  }
  set('finalidade', b.finalidade || null);
  set('formasCompartilhamento', b.formasCompartilhamento || null);
  set('tipoHospedagem', b.tipoHospedagem || null);
  set('paisHospedagem', b.paisHospedagem || null);
  set('regiaoHospedagem', b.regiaoHospedagem || null);
  set('categoriasDados', Array.isArray(b.categoriasDados) ? b.categoriasDados.map(String) : []);
  set('ativo', !!b.ativo);
  if (!parcial && data.categoriasDados === undefined) data.categoriasDados = [];

  if (b.responsavelId !== undefined) {
    if (!(await responsavelValido(prisma, b.responsavelId, orgId))) return { erro: 'Responsável inválido' };
    data.responsavelId = b.responsavelId || null;
  }
  if (b.terceiroId !== undefined) {
    if (!(await idsDaOrganizacao(prisma.terceiro, b.terceiroId, orgId))) return { erro: 'Fornecedor inválido' };
    data.terceiroId = b.terceiroId || null;
  }
  let integracaoIds;
  if (b.integracaoIds !== undefined) {
    if (!Array.isArray(b.integracaoIds)) return { erro: 'integracaoIds deve ser uma lista' };
    integracaoIds = [...new Set(b.integracaoIds.filter(Boolean))];
    if (req.params.id && integracaoIds.includes(req.params.id)) return { erro: 'Um sistema não pode integrar consigo mesmo' };
    if (!(await idsDaOrganizacao(prisma.sistemaInventario, integracaoIds, orgId))) return { erro: 'Sistema de integração inválido' };
  }
  return { data, integracaoIds };
}

// GET /inventario/sistemas
router.get('/sistemas', async (req, res) => {
  try {
    const sistemas = await prisma.sistemaInventario.findMany({
      where: { organizacaoId: req.usuario.organizacaoId },
      include: SISTEMA_INCLUDE,
      orderBy: { nome: 'asc' }
    });
    const ids = sistemas.map(s => s.id);
    const vinculos = ids.length === 0 ? [] : await prisma.tratamentoSistema.findMany({ where: { sistemaId: { in: ids } } });
    const qtd = {};
    for (const v of vinculos) qtd[v.sistemaId] = (qtd[v.sistemaId] || 0) + 1;
    res.json(sistemas.map(s => ({ ...comIntegracoes(s), qtdTratamentos: qtd[s.id] || 0 })));
  } catch (err) {
    console.error('[GET /inventario/sistemas]', err);
    res.status(500).json({ erro: 'Erro ao listar sistemas' });
  }
});

// GET /inventario/sistemas/export?formato=csv|json
router.get('/sistemas/export', async (req, res) => {
  try {
    await responderExport(res, prisma, 'inventario', req.usuario.organizacaoId, req.query.formato);
  } catch (err) {
    console.error('[GET /inventario/sistemas/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar inventário' });
  }
});

// GET /inventario/sistemas/:id — inclui os tratamentos do ROPA que usam o sistema
router.get('/sistemas/:id', async (req, res) => {
  try {
    const s = await prisma.sistemaInventario.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId },
      include: SISTEMA_INCLUDE
    });
    if (!s) return res.status(404).json({ erro: 'Sistema não encontrado' });
    const vinculos = await prisma.tratamentoSistema.findMany({ where: { sistemaId: s.id } });
    const tratamentos = vinculos.length === 0 ? [] : await prisma.tratamento.findMany({
      where: { id: { in: vinculos.map(v => v.tratamentoId) }, organizacaoId: req.usuario.organizacaoId },
      select: { id: true, nome: true, finalidade: true, ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json({ ...comIntegracoes(s), tratamentos });
  } catch (err) {
    console.error('[GET /inventario/sistemas/:id]', err);
    res.status(500).json({ erro: 'Erro ao buscar sistema' });
  }
});

router.post('/sistemas', async (req, res) => {
  try {
    if (!podeEscrever(req)) return res.status(403).json({ erro: 'Sem permissão para cadastrar sistemas' });
    const lido = await lerCorpo(req, { parcial: false });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const sistema = await prisma.$transaction(async (tx) => {
      const criado = await tx.sistemaInventario.create({
        data: {
          ...lido.data,
          organizacaoId: req.usuario.organizacaoId,
          ...(lido.integracaoIds && { integracoesSaida: { create: lido.integracaoIds.map(destinoId => ({ destinoId })) } })
        },
        include: SISTEMA_INCLUDE
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SISTEMA', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null, depois: paraHistorico(criado)
      });
      return criado;
    });
    res.status(201).json(comIntegracoes(sistema));
  } catch (err) {
    console.error('[POST /inventario/sistemas]', err);
    res.status(500).json({ erro: 'Erro ao cadastrar sistema' });
  }
});

router.put('/sistemas/:id', async (req, res) => {
  try {
    if (!podeEscrever(req)) return res.status(403).json({ erro: 'Sem permissão para editar sistemas' });
    const existente = await prisma.sistemaInventario.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId },
      include: SISTEMA_INCLUDE
    });
    if (!existente) return res.status(404).json({ erro: 'Sistema não encontrado' });
    const lido = await lerCorpo(req, { parcial: true });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const sistema = await prisma.$transaction(async (tx) => {
      if (lido.integracaoIds) {
        await tx.integracaoSistema.deleteMany({ where: { origemId: existente.id } });
      }
      const atualizado = await tx.sistemaInventario.update({
        where: { id: existente.id },
        data: {
          ...lido.data,
          ...(lido.integracaoIds && { integracoesSaida: { create: lido.integracaoIds.map(destinoId => ({ destinoId })) } })
        },
        include: SISTEMA_INCLUDE
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SISTEMA', registroId: existente.id,
        acao: 'EDITAR', usuarioId: req.usuario.id, antes: paraHistorico(existente), depois: paraHistorico(atualizado)
      });
      return atualizado;
    });
    res.json(comIntegracoes(sistema));
  } catch (err) {
    console.error('[PUT /inventario/sistemas/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar sistema' });
  }
});

// DELETE = desativar (mantem vinculos e historico)
router.delete('/sistemas/:id', async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem desativar sistemas' });
    const existente = await prisma.sistemaInventario.findFirst({ where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId } });
    if (!existente) return res.status(404).json({ erro: 'Sistema não encontrado' });
    await prisma.$transaction(async (tx) => {
      await tx.sistemaInventario.update({ where: { id: existente.id }, data: { ativo: false } });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SISTEMA', registroId: existente.id,
        acao: 'EXCLUIR', usuarioId: req.usuario.id, diff: { ativo: { antes: existente.ativo, depois: false } }
      });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /inventario/sistemas/:id]', err);
    res.status(500).json({ erro: 'Erro ao desativar sistema' });
  }
});

module.exports = router;
