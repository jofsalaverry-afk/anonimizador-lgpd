const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ---------- Middlewares ----------

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
};

const requireModulo = async (req, res, next) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { modulosAtivos: true }
    });
    if (!org || !org.modulosAtivos.includes('treinamento')) {
      return res.status(403).json({ erro: 'Módulo "treinamento" não está ativo para sua organização.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar módulos' });
  }
};

// ---------- Conteudo base (hardcoded) ----------
// Trilhas base — o admin pode sobrescrever youtubeId e titulo via
// tabela TrilhaOverride sem alterar codigo. Cada modulo tem um
// moduloId estavel para ser referenciado nos overrides.
const PLACEHOLDER_VIDEO = 'pdk8lyemxn4';

const TRILHAS_BASE = [
  {
    id: 'introducao-lgpd',
    titulo: 'Introdução à LGPD',
    descricao: 'Entenda os conceitos fundamentais da Lei Geral de Proteção de Dados Pessoais e como ela impacta órgãos públicos e empresas.',
    nivel: 'Básico',
    modulos: [
      {
        moduloId: 'o-que-e-lgpd',
        titulo: 'O que é a LGPD?',
        descricao: 'Visão geral da Lei 13.709/2018, seus objetivos e aplicabilidade no setor público.',
        youtubeId: 'pdk8lyemxn4',
        duracaoMin: 8
      },
      {
        moduloId: 'principios-lgpd',
        titulo: 'Princípios da LGPD',
        descricao: 'Os 10 princípios fundamentais: finalidade, adequação, necessidade, livre acesso, qualidade, transparência, segurança, prevenção, não discriminação e responsabilização.',
        youtubeId: PLACEHOLDER_VIDEO,
        duracaoMin: 12
      }
    ]
  },
  {
    id: 'direitos-titulares',
    titulo: 'Direitos dos Titulares',
    descricao: 'Conheça os direitos garantidos pelo Art. 18 da LGPD e como responder às solicitações dos titulares no prazo correto.',
    nivel: 'Intermediário',
    modulos: [
      {
        moduloId: 'direitos-do-titular',
        titulo: 'Quais são os direitos do titular?',
        descricao: 'Detalhamento dos 9 direitos do Art. 18: confirmação, acesso, correção, anonimização, portabilidade, eliminação, informação, revogação e petição à ANPD.',
        youtubeId: PLACEHOLDER_VIDEO,
        duracaoMin: 10
      },
      {
        moduloId: 'responder-15-dias',
        titulo: 'Como responder solicitações dentro do prazo de 15 dias',
        descricao: 'Fluxo completo de atendimento: recebimento, validação de identidade, análise, resposta e registro de evidências.',
        youtubeId: PLACEHOLDER_VIDEO,
        duracaoMin: 14
      }
    ]
  }
];

// ---------- Merge com overrides ----------

async function getTrilhasComOverrides() {
  const overrides = await prisma.trilhaOverride.findMany();
  const mapa = {};
  for (const o of overrides) {
    mapa[`${o.trilhaId}:${o.moduloId}`] = o;
  }
  return TRILHAS_BASE.map(t => ({
    ...t,
    modulos: t.modulos.map(m => {
      const ov = mapa[`${t.id}:${m.moduloId}`];
      if (!ov) return m;
      return {
        ...m,
        youtubeId: ov.youtubeId || m.youtubeId,
        titulo: ov.titulo || m.titulo
      };
    })
  }));
}

// Helper exportado para uso pelas rotas admin
async function getTrilhaBase(trilhaId) {
  const base = TRILHAS_BASE.find(t => t.id === trilhaId);
  return base || null;
}

// ---------- Rotas ----------

router.use(authMiddleware, requireModulo);

router.get('/trilhas', async (req, res) => {
  try {
    const trilhas = await getTrilhasComOverrides();
    res.json(trilhas);
  } catch (err) {
    console.error('[GET /treinamento/trilhas]', err);
    res.status(500).json({ erro: 'Erro ao listar trilhas' });
  }
});

router.get('/trilhas/:id', async (req, res) => {
  try {
    const trilhas = await getTrilhasComOverrides();
    const trilha = trilhas.find(t => t.id === req.params.id);
    if (!trilha) return res.status(404).json({ erro: 'Trilha não encontrada' });
    res.json(trilha);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar trilha' });
  }
});

module.exports = router;
module.exports.getTrilhasComOverrides = getTrilhasComOverrides;
module.exports.getTrilhaBase = getTrilhaBase;
module.exports.TRILHAS_BASE = TRILHAS_BASE;
