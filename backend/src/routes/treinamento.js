const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { gerarCodigo, gerarCertificadoPdf } = require('../services/certificado');

const router = express.Router();
const prisma = new PrismaClient();

// ---------- Middlewares ----------

// Auth compartilhado: rejeita tokens intermediarios de MFA (mfaPending/mfaSetup).
const authMiddleware = authUsuario;

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

// ==================== Progresso, relatorio e certificado ====================
// Etapa 3 PoC. Progresso e por modulo; a trilha esta concluida quando
// todos os modulos dela tem registro. Ao concluir, emite o certificado.
// O proprio ProgressoTreinamento (com concluidoEm) e a trilha de
// auditoria do treinamento — nao duplicamos em HistoricoRegistro.

const SITUACAO_LABEL = { NAO_INICIADA: 'Não iniciada', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída' };

function cargaMin(trilha) {
  return trilha.modulos.reduce((s, m) => s + (m.duracaoMin || 0), 0);
}

// progressos: registros de UM usuario. Retorna o status de cada trilha.
function statusDasTrilhas(trilhas, progressos, certificados) {
  return trilhas.map(t => {
    const ids = new Set(t.modulos.map(m => m.moduloId));
    const feitos = progressos.filter(p => p.trilhaId === t.id && ids.has(p.moduloId));
    const concluida = feitos.length === ids.size && ids.size > 0;
    const cert = certificados.find(c => c.trilhaId === t.id);
    return {
      trilhaId: t.id,
      trilhaTitulo: t.titulo,
      totalModulos: ids.size,
      modulosConcluidos: feitos.map(p => p.moduloId),
      situacao: concluida ? 'CONCLUIDA' : feitos.length > 0 ? 'EM_ANDAMENTO' : 'NAO_INICIADA',
      concluidoEm: concluida ? new Date(Math.max(...feitos.map(p => new Date(p.concluidoEm).getTime()))) : null,
      certificadoCodigo: cert ? cert.codigo : null
    };
  });
}

async function emitirCertificadoSeConcluida(usuarioId, organizacaoId, trilha, status) {
  if (status.situacao !== 'CONCLUIDA' || status.certificadoCodigo) return status.certificadoCodigo;
  const [usuario, org] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nome: true } }),
    prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } })
  ]);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const cert = await prisma.certificadoTreinamento.create({
        data: {
          codigo: gerarCodigo(), usuarioId, organizacaoId,
          trilhaId: trilha.id, trilhaTitulo: trilha.titulo,
          nomeUsuario: usuario?.nome || '—', nomeOrganizacao: org?.nome || '—',
          cargaHorariaMin: cargaMin(trilha), concluidoEm: status.concluidoEm
        }
      });
      return cert.codigo;
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      // colisao de codigo (raro) ou certificado criado em paralelo
      const existente = await prisma.certificadoTreinamento.findFirst({ where: { usuarioId, trilhaId: trilha.id } });
      if (existente) return existente.codigo;
    }
  }
  throw new Error('Não foi possível gerar código de certificado');
}

// GET /treinamento/progresso — progresso do usuario logado
router.get('/progresso', async (req, res) => {
  try {
    const [trilhas, progressos, certificados] = await Promise.all([
      getTrilhasComOverrides(),
      prisma.progressoTreinamento.findMany({ where: { usuarioId: req.usuario.id } }),
      prisma.certificadoTreinamento.findMany({ where: { usuarioId: req.usuario.id } })
    ]);
    res.json(statusDasTrilhas(trilhas, progressos, certificados));
  } catch (err) {
    console.error('[GET /treinamento/progresso]', err);
    res.status(500).json({ erro: 'Erro ao carregar progresso' });
  }
});

// POST /treinamento/progresso { trilhaId, moduloId } — marca modulo concluido
router.post('/progresso', async (req, res) => {
  try {
    const { trilhaId, moduloId } = req.body || {};
    const trilhas = await getTrilhasComOverrides();
    const trilha = trilhas.find(t => t.id === trilhaId);
    if (!trilha || !trilha.modulos.some(m => m.moduloId === moduloId)) {
      return res.status(400).json({ erro: 'Trilha ou módulo inválido' });
    }
    const usuarioId = req.usuario.id;
    const ja = await prisma.progressoTreinamento.findFirst({ where: { usuarioId, trilhaId, moduloId } });
    if (!ja) {
      await prisma.progressoTreinamento.create({
        data: { usuarioId, organizacaoId: req.usuario.organizacaoId, trilhaId, moduloId }
      });
    }
    const [progressos, certificados] = await Promise.all([
      prisma.progressoTreinamento.findMany({ where: { usuarioId, trilhaId } }),
      prisma.certificadoTreinamento.findMany({ where: { usuarioId, trilhaId } })
    ]);
    const status = statusDasTrilhas([trilha], progressos, certificados)[0];
    status.certificadoCodigo = await emitirCertificadoSeConcluida(usuarioId, req.usuario.organizacaoId, trilha, status);
    res.json(status);
  } catch (err) {
    console.error('[POST /treinamento/progresso]', err);
    res.status(500).json({ erro: 'Erro ao registrar progresso' });
  }
});

// GET /treinamento/certificados/:codigo/pdf — dono do certificado ou Gestor/DPO da org
router.get('/certificados/:codigo/pdf', async (req, res) => {
  try {
    const cert = await prisma.certificadoTreinamento.findFirst({
      where: { codigo: String(req.params.codigo).toUpperCase(), organizacaoId: req.usuario.organizacaoId }
    });
    const gestor = ['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil);
    if (!cert || (cert.usuarioId !== req.usuario.id && !gestor)) {
      return res.status(404).json({ erro: 'Certificado não encontrado' });
    }
    const pdf = await gerarCertificadoPdf(cert);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-${cert.codigo}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[GET /treinamento/certificados/:codigo/pdf]', err);
    res.status(500).json({ erro: 'Erro ao gerar certificado' });
  }
});

// GET /treinamento/relatorio?trilhaId=&situacao=&formato=csv|json
// Usuarios ativos x trilhas. So Gestor/DPO.
router.get('/relatorio', async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO acessam o relatório' });
    }
    const orgId = req.usuario.organizacaoId;
    const [trilhas, usuarios, progressos, certificados] = await Promise.all([
      getTrilhasComOverrides(),
      prisma.usuario.findMany({
        where: { organizacaoId: orgId, ativo: true, deletedAt: null },
        select: { id: true, nome: true, perfil: true }, orderBy: { nome: 'asc' }
      }),
      prisma.progressoTreinamento.findMany({ where: { organizacaoId: orgId } }),
      prisma.certificadoTreinamento.findMany({ where: { organizacaoId: orgId } })
    ]);
    let linhas = [];
    for (const u of usuarios) {
      const st = statusDasTrilhas(trilhas, progressos.filter(p => p.usuarioId === u.id), certificados.filter(c => c.usuarioId === u.id));
      for (const s of st) {
        linhas.push({
          usuarioId: u.id, usuarioNome: u.nome, perfil: u.perfil,
          trilhaId: s.trilhaId, trilhaTitulo: s.trilhaTitulo,
          modulosConcluidos: s.modulosConcluidos.length, totalModulos: s.totalModulos,
          situacao: s.situacao, concluidoEm: s.concluidoEm, certificadoCodigo: s.certificadoCodigo
        });
      }
    }
    if (req.query.trilhaId) linhas = linhas.filter(l => l.trilhaId === req.query.trilhaId);
    if (req.query.situacao) linhas = linhas.filter(l => l.situacao === req.query.situacao);

    if (req.query.formato === 'csv') {
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const cab = 'usuario,perfil,trilha,modulosConcluidos,totalModulos,situacao,concluidoEm,certificado';
      const rows = linhas.map(l => [
        q(l.usuarioNome), l.perfil, q(l.trilhaTitulo), l.modulosConcluidos, l.totalModulos,
        q(SITUACAO_LABEL[l.situacao]), l.concluidoEm ? l.concluidoEm.toISOString().slice(0, 10) : '', l.certificadoCodigo || ''
      ].join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-treinamento.csv');
      return res.send('﻿' + [cab, ...rows].join('\n'));
    }
    res.json(linhas);
  } catch (err) {
    console.error('[GET /treinamento/relatorio]', err);
    res.status(500).json({ erro: 'Erro ao gerar relatório' });
  }
});

module.exports = router;
module.exports.getTrilhasComOverrides = getTrilhasComOverrides;
module.exports.getTrilhaBase = getTrilhaBase;
module.exports.TRILHAS_BASE = TRILHAS_BASE;
