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
// Para o MVP, as trilhas sao hardcoded. O admin pode curar substituindo
// os youtubeId por videos publicos reais. Em versao futura isso vai
// para uma tabela Trilha/ModuloTrilha no banco.
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
        youtubeId: 'OzZ3o1kPBdU',
        duracaoMin: 8
      },
      {
        titulo: 'Principios da LGPD',
        descricao: 'Os 10 principios fundamentais: finalidade, adequacao, necessidade, livre acesso, qualidade, transparencia, seguranca, prevencao, nao discriminacao e responsabilizacao.',
        youtubeId: 'VNu1XkFnHsY',
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
        youtubeId: 'sXWC9P6BJME',
        duracaoMin: 10
      },
      {
        titulo: 'Como responder solicitacoes dentro do prazo de 15 dias',
        descricao: 'Fluxo completo de atendimento: recebimento, validacao de identidade, analise, resposta e registro de evidencias.',
        youtubeId: 'lpqSLJLcHvE',
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
