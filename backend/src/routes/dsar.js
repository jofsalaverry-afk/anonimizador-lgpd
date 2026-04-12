const express = require('express');
const crypto = require('crypto');
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
    if (!org || !org.modulosAtivos.includes('dsar')) {
      return res.status(403).json({ erro: 'Modulo "dsar" nao esta ativo para sua organizacao.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar modulos' });
  }
};

// ---------- Helpers ----------

// Gera protocolo sequencial: SIGLA-ANO-SEQ (ex: CMP-2026-001)
async function gerarProtocolo(organizacaoId) {
  const org = await prisma.organizacao.findUnique({
    where: { id: organizacaoId },
    select: { nome: true }
  });
  // Extrai sigla: primeiras letras de cada palavra significativa (max 3)
  const palavras = (org?.nome || 'ORG').replace(/^(Camara|Câmara)\s+(Municipal\s+)?(de\s+|do\s+|da\s+)?/i, '').split(/\s+/).filter(Boolean);
  let sigla;
  if (palavras.length === 0) {
    sigla = 'ORG';
  } else if (palavras.length === 1) {
    sigla = palavras[0].slice(0, 3).toUpperCase();
  } else {
    sigla = palavras.slice(0, 3).map(p => p[0]).join('').toUpperCase();
  }

  const ano = new Date().getFullYear();

  // Conta solicitacoes da org no ano atual para gerar sequencial
  const inicioAno = new Date(`${ano}-01-01T00:00:00.000Z`);
  const fimAno = new Date(`${ano + 1}-01-01T00:00:00.000Z`);
  const count = await prisma.solicitacaoTitular.count({
    where: {
      organizacaoId,
      criadoEm: { gte: inicioAno, lt: fimAno }
    }
  });

  const seq = String(count + 1).padStart(3, '0');
  return `${sigla}-${ano}-${seq}`;
}

// Calcula SLA badge: verde (>5 dias), amarelo (2-5), vermelho (<2)
function calcularSLA(dataLimite) {
  const agora = new Date();
  const limite = new Date(dataLimite);
  const diasRestantes = Math.ceil((limite - agora) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return { cor: 'vencido', dias: diasRestantes, label: `Vencido ha ${Math.abs(diasRestantes)} dia(s)` };
  if (diasRestantes < 2) return { cor: 'vermelho', dias: diasRestantes, label: `${diasRestantes} dia(s) restante(s)` };
  if (diasRestantes <= 5) return { cor: 'amarelo', dias: diasRestantes, label: `${diasRestantes} dias restantes` };
  return { cor: 'verde', dias: diasRestantes, label: `${diasRestantes} dias restantes` };
}

function enriquecerSolicitacao(s) {
  return { ...s, sla: calcularSLA(s.dataLimite) };
}

// ---------- Rotas autenticadas (modulo dsar) ----------

router.get('/solicitacoes', authMiddleware, requireModulo, async (req, res) => {
  try {
    const solicitacoes = await prisma.solicitacaoTitular.findMany({
      where: { organizacaoId: req.usuario.organizacaoId },
      include: { evidencias: { select: { id: true, tipo: true, criadoEm: true } }, _count: { select: { evidencias: true } } },
      orderBy: { criadoEm: 'desc' }
    });
    res.json(solicitacoes.map(enriquecerSolicitacao));
  } catch (err) {
    console.error('[GET /dsar/solicitacoes]', err);
    res.status(500).json({ erro: 'Erro ao listar solicitacoes' });
  }
});

router.get('/solicitacoes/:id', authMiddleware, requireModulo, async (req, res) => {
  try {
    const sol = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId },
      include: { evidencias: true }
    });
    if (!sol) return res.status(404).json({ erro: 'Solicitacao nao encontrada' });
    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[GET /dsar/solicitacoes/:id]', err);
    res.status(500).json({ erro: 'Erro ao buscar solicitacao' });
  }
});

router.post('/solicitacoes', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissao para criar solicitacoes' });
    }

    const { titularNome, titularEmail, titularCpf, tipoDireito, descricao } = req.body;
    if (!titularNome || !titularEmail || !tipoDireito || !descricao) {
      return res.status(400).json({ erro: 'titularNome, titularEmail, tipoDireito e descricao sao obrigatorios' });
    }

    const protocolo = await gerarProtocolo(req.usuario.organizacaoId);
    const dataRecebimento = new Date();
    const dataLimite = new Date(dataRecebimento);
    dataLimite.setDate(dataLimite.getDate() + 15);

    const sol = await prisma.solicitacaoTitular.create({
      data: {
        organizacaoId: req.usuario.organizacaoId,
        protocolo,
        titularNome, titularEmail, titularCpf: titularCpf || null,
        tipoDireito, descricao,
        dataRecebimento, dataLimite,
        responsavelId: req.usuario.id
      },
      include: { evidencias: true }
    });

    res.status(201).json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[POST /dsar/solicitacoes]', err);
    res.status(500).json({ erro: 'Erro ao criar solicitacao' });
  }
});

router.put('/solicitacoes/:id', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissao para editar solicitacoes' });
    }

    const existente = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Solicitacao nao encontrada' });

    const { status, responsavelId, descricao } = req.body;
    const sol = await prisma.solicitacaoTitular.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(responsavelId !== undefined && { responsavelId }),
        ...(descricao !== undefined && { descricao })
      },
      include: { evidencias: true }
    });

    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[PUT /dsar/solicitacoes/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar solicitacao' });
  }
});

// Adiciona evidencia (imutavel — sem update/delete)
router.post('/solicitacoes/:id/evidencias', authMiddleware, requireModulo, async (req, res) => {
  try {
    const existente = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Solicitacao nao encontrada' });

    const { tipo, descricao, arquivoUrl } = req.body;
    if (!tipo || !descricao) {
      return res.status(400).json({ erro: 'tipo e descricao sao obrigatorios' });
    }

    // Hash SHA-256 do conteudo para integridade
    const conteudoHash = descricao + (arquivoUrl || '') + new Date().toISOString();
    const hashSha256 = crypto.createHash('sha256').update(conteudoHash).digest('hex');

    const evidencia = await prisma.evidenciaDSAR.create({
      data: {
        solicitacaoId: req.params.id,
        tipo, descricao,
        arquivoUrl: arquivoUrl || null,
        hashSha256,
        autorId: req.usuario.id
      }
    });

    res.status(201).json(evidencia);
  } catch (err) {
    console.error('[POST /dsar/solicitacoes/:id/evidencias]', err);
    res.status(500).json({ erro: 'Erro ao adicionar evidencia' });
  }
});

// Responde a solicitacao (muda status para RESPONDIDA + registra resposta)
router.post('/solicitacoes/:id/responder', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem responder solicitacoes' });
    }

    const existente = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Solicitacao nao encontrada' });

    const { respostaTexto } = req.body;
    if (!respostaTexto) return res.status(400).json({ erro: 'respostaTexto e obrigatorio' });

    const sol = await prisma.solicitacaoTitular.update({
      where: { id: req.params.id },
      data: {
        status: 'RESPONDIDA',
        respostaTexto,
        dataResposta: new Date(),
        responsavelId: req.usuario.id
      },
      include: { evidencias: true }
    });

    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[POST /dsar/solicitacoes/:id/responder]', err);
    res.status(500).json({ erro: 'Erro ao responder solicitacao' });
  }
});

// ---------- Rota publica (sem auth) — formulario do titular ----------

router.post('/publico/nova-solicitacao', async (req, res) => {
  try {
    const { organizacaoId, titularNome, titularEmail, titularCpf, tipoDireito, descricao } = req.body;
    if (!organizacaoId || !titularNome || !titularEmail || !tipoDireito || !descricao) {
      return res.status(400).json({ erro: 'organizacaoId, titularNome, titularEmail, tipoDireito e descricao sao obrigatorios' });
    }

    // Verifica se a org existe e tem modulo dsar ativo
    const org = await prisma.organizacao.findUnique({
      where: { id: organizacaoId },
      select: { id: true, ativo: true, modulosAtivos: true }
    });
    if (!org || !org.ativo) return res.status(404).json({ erro: 'Organizacao nao encontrada' });
    if (!org.modulosAtivos.includes('dsar')) return res.status(403).json({ erro: 'Este servico nao esta disponivel para esta organizacao' });

    const protocolo = await gerarProtocolo(organizacaoId);
    const dataRecebimento = new Date();
    const dataLimite = new Date(dataRecebimento);
    dataLimite.setDate(dataLimite.getDate() + 15);

    const sol = await prisma.solicitacaoTitular.create({
      data: {
        organizacaoId, protocolo,
        titularNome, titularEmail, titularCpf: titularCpf || null,
        tipoDireito, descricao,
        dataRecebimento, dataLimite
      }
    });

    res.status(201).json({
      protocolo: sol.protocolo,
      dataLimite: sol.dataLimite,
      mensagem: `Sua solicitacao foi registrada com o protocolo ${sol.protocolo}. O prazo para resposta e de 15 dias corridos.`
    });
  } catch (err) {
    console.error('[POST /dsar/publico/nova-solicitacao]', err);
    res.status(500).json({ erro: 'Erro ao registrar solicitacao' });
  }
});

module.exports = router;
