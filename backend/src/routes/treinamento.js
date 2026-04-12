const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ---------- Middlewares ----------

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token nao fornecido' });
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token invalido' });
  }
};

const requireModulo = async (req, res, next) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { modulosAtivos: true }
    });
    if (!org || !org.modulosAtivos.includes('treinamento')) {
      return res.status(403).json({ erro: 'Modulo "treinamento" nao esta ativo para sua organizacao.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar modulos' });
  }
};

// ---------- Conteudo (hardcoded — MVP) ----------
// MVP: trilhas hardcoded. Conteudo inicial curado pela usuaria com
// videos publicos sobre LGPD.
//
// NOTA DE CURACAO:
// - Trilha 1 / Modulo 1 ("O que e a LGPD?"): youtubeId 'pdk8lyemxn4'
//   confirmado como video publico real sobre LGPD.
// - Demais modulos usam o mesmo video como placeholder — o admin deve
//   substituir por IDs de videos reais da ANPD, Senado, Sebrae, canais
//   oficiais de universidades, etc. Basta editar os youtubeId abaixo.
const PLACEHOLDER_VIDEO = 'pdk8lyemxn4';

const TRILHAS = [
  {
    id: 'introducao-lgpd',
    titulo: 'Introducao a LGPD',
    descricao: 'Entenda os conceitos fundamentais da Lei Geral de Protecao de Dados Pessoais e como ela impacta orgaos publicos e empresas.',
    nivel: 'Basico',
    modulos: [
      {
        titulo: 'O que e a LGPD?',
        descricao: 'Visao geral da Lei 13.709/2018, seus objetivos e aplicabilidade no setor publico.',
        youtubeId: 'pdk8lyemxn4',
        duracaoMin: 8
      },
      {
        titulo: 'Principios da LGPD',
        descricao: 'Os 10 principios fundamentais: finalidade, adequacao, necessidade, livre acesso, qualidade, transparencia, seguranca, prevencao, nao discriminacao e responsabilizacao.',
        youtubeId: PLACEHOLDER_VIDEO,  // TODO: curar — video especifico sobre principios
        duracaoMin: 12
      }
    ]
  },
  {
    id: 'direitos-titulares',
    titulo: 'Direitos dos Titulares',
    descricao: 'Conheca os direitos garantidos pelo Art. 18 da LGPD e como responder as solicitacoes dos titulares no prazo correto.',
    nivel: 'Intermediario',
    modulos: [
      {
        titulo: 'Quais sao os direitos do titular?',
        descricao: 'Detalhamento dos 9 direitos do Art. 18: confirmacao, acesso, correcao, anonimizacao, portabilidade, eliminacao, informacao, revogacao e peticao a ANPD.',
        youtubeId: PLACEHOLDER_VIDEO,  // TODO: curar — video sobre Art. 18
        duracaoMin: 10
      },
      {
        titulo: 'Como responder solicitacoes dentro do prazo de 15 dias',
        descricao: 'Fluxo completo de atendimento: recebimento, validacao de identidade, analise, resposta e registro de evidencias.',
        youtubeId: PLACEHOLDER_VIDEO,  // TODO: curar — video sobre prazo de resposta DSAR
        duracaoMin: 14
      }
    ]
  }
];

// ---------- Rotas ----------

router.use(authMiddleware, requireModulo);

router.get('/trilhas', (req, res) => {
  res.json(TRILHAS);
});

router.get('/trilhas/:id', (req, res) => {
  const trilha = TRILHAS.find(t => t.id === req.params.id);
  if (!trilha) return res.status(404).json({ erro: 'Trilha nao encontrada' });
  res.json(trilha);
});

module.exports = router;
