const express = require('express');
const { authUsuario } = require('../middlewares/authUsuario');
const { gerarCodigo, gerarCertificadoPdf } = require('../services/certificado');
const { isoDiaSP } = require('../services/datas');

const router = express.Router();
const { prisma } = require('../db');

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

// ---------- Conteudo base ----------
// Texto + questionario por modulo (src/data/trilhasTreinamento.js). O
// admin pode trocar o titulo e informar um link de material complementar
// (TrilhaOverride) sem alterar codigo.
const TRILHAS_BASE = require('../data/trilhasTreinamento');
const MIN_ACERTOS = 2;

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
        titulo: ov.titulo || m.titulo,
        linkComplementar: ov.linkComplementar || null
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

// Remove o gabarito ("correta") antes de enviar ao navegador
function semGabarito(t) {
  return { ...t, modulos: t.modulos.map(m => ({ ...m, minAcertos: MIN_ACERTOS, quiz: (m.quiz || []).map(({ correta, ...q }) => q) })) };
}

router.get('/trilhas', async (req, res) => {
  try {
    const trilhas = await getTrilhasComOverrides();
    res.json(trilhas.map(semGabarito));
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
    res.json(semGabarito(trilha));
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

// POST /treinamento/progresso { trilhaId, moduloId, respostas: [indice, ...] }
// Corrige o questionario e grava a tentativa. O modulo so conta como
// concluido com MIN_ACERTOS acertos ou mais. Devolve o status da trilha +
// { tentativa: { acertos, total, aprovado, corretas: [bool] } } (sem o gabarito).
router.post('/progresso', async (req, res) => {
  try {
    const { trilhaId, moduloId, respostas } = req.body || {};
    const trilhas = await getTrilhasComOverrides();
    const trilha = trilhas.find(t => t.id === trilhaId);
    const modulo = trilha?.modulos.find(m => m.moduloId === moduloId);
    if (!modulo) return res.status(400).json({ erro: 'Trilha ou módulo inválido' });
    const quiz = modulo.quiz || [];
    if (!Array.isArray(respostas) || respostas.length !== quiz.length || respostas.some(r => !Number.isInteger(r))) {
      return res.status(400).json({ erro: `Responda as ${quiz.length} perguntas do questionário` });
    }
    const corretas = quiz.map((q, i) => respostas[i] === q.correta);
    const acertos = corretas.filter(Boolean).length;
    const aprovado = acertos >= MIN_ACERTOS;
    const usuarioId = req.usuario.id;
    await prisma.tentativaQuizTreinamento.create({
      data: { usuarioId, organizacaoId: req.usuario.organizacaoId, trilhaId, moduloId, respostas, acertos, total: quiz.length, aprovado }
    });
    const tentativa = { acertos, total: quiz.length, aprovado, corretas, minAcertos: MIN_ACERTOS };
    const ja = await prisma.progressoTreinamento.findFirst({ where: { usuarioId, trilhaId, moduloId } });
    if (aprovado && !ja) {
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
    res.json({ ...status, tentativa });
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
    const org = await prisma.organizacao.findUnique({
      where: { id: cert.organizacaoId },
      select: { nome: true, municipio: true, uf: true, encarregadoNome: true, logoBase64: true }
    });
    const pdf = await gerarCertificadoPdf(cert, org || {});
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
    // Resumo antes dos filtros: trilha obrigatoria (nivel Basico) e total
    const obrigatoria = trilhas.find(t => t.nivel === 'Básico');
    const resumo = {
      trilhaObrigatoria: obrigatoria ? obrigatoria.titulo : null,
      servidores: usuarios.length,
      concluiramObrigatoria: obrigatoria ? linhas.filter(l => l.trilhaId === obrigatoria.id && l.situacao === 'CONCLUIDA').length : 0,
      trilhasConcluidas: linhas.filter(l => l.situacao === 'CONCLUIDA').length,
      trilhasTotal: linhas.length
    };
    if (req.query.trilhaId) linhas = linhas.filter(l => l.trilhaId === req.query.trilhaId);
    // NAO_CONCLUIDA = nao iniciada + em andamento (link do painel)
    if (req.query.situacao === 'NAO_CONCLUIDA') linhas = linhas.filter(l => l.situacao !== 'CONCLUIDA');
    else if (req.query.situacao) linhas = linhas.filter(l => l.situacao === req.query.situacao);

    if (req.query.formato === 'csv') {
      const q = v => `"${String(v ?? '').replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`; // Etapa 7a: neutraliza formula
      const cab = 'usuario,perfil,trilha,modulosConcluidos,totalModulos,situacao,concluidoEm,certificado';
      const rows = linhas.map(l => [
        q(l.usuarioNome), l.perfil, q(l.trilhaTitulo), l.modulosConcluidos, l.totalModulos,
        q(SITUACAO_LABEL[l.situacao]), l.concluidoEm ? isoDiaSP(l.concluidoEm) : '', l.certificadoCodigo || ''
      ].join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio-treinamento.csv');
      return res.send('﻿' + [cab, ...rows].join('\n'));
    }
    // ?resumo=1 devolve { resumo, linhas }; sem ele, a lista (formato antigo)
    if (req.query.resumo) return res.json({ resumo, linhas });
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
