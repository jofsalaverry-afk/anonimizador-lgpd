const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const {
  gerarProtocolo,
  enriquecerSolicitacao,
  criarOtpDSAR,
  validarOtpDSAR,
  criarSolicitacaoApartirDeOtp
} = require('../services/dsarService');
const {
  enviarOTP,
  enviarConfirmacaoSolicitacao,
  enviarRespostaTitular
} = require('../services/emailService');
const { validar, validarEmail, validarCpf, validarCuid, sanitizarTexto, validarEnum } = require('../middlewares/seguranca');

const router = express.Router();
const prisma = new PrismaClient();

const TIPOS_DIREITO = ['CONFIRMACAO', 'ACESSO', 'CORRECAO', 'ANONIMIZACAO', 'PORTABILIDADE', 'ELIMINACAO', 'INFORMACAO', 'REVOGACAO', 'OPOSICAO', 'PETICAO', 'OUTRO'];

const validadoresSolicitarOtp = [
  validarCuid('organizacaoId', 'body'),
  sanitizarTexto('titularNome', { min: 2, max: 200 }),
  validarEmail('titularEmail'),
  validarCpf('titularCpf', { opcional: true }),
  validarEnum('tipoDireito', TIPOS_DIREITO),
  sanitizarTexto('descricao', { min: 5, max: 2000 }),
  validar
];

const validadoresConfirmarOtp = [
  validarEmail('titularEmail'),
  body('codigo').trim().matches(/^\d{6}$/).withMessage('Codigo deve ter 6 digitos'),
  validar
];

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

// Rate limiter de /dsar/publico vem do server.js (limiterDsarPublico,
// 5 req/15min/IP) — aplicado via app.use('/dsar/publico', ...) antes
// deste router. Nao precisa de limiter local.

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

    // Envia confirmacao por email ao titular (fire-and-forget)
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { nome: true }
    });
    enviarConfirmacaoSolicitacao({
      to: titularEmail,
      titularNome,
      protocolo: sol.protocolo,
      dataLimite: sol.dataLimite,
      orgNome: org?.nome || 'Organizacao'
    }).catch(e => console.error('[dsar] falha email confirmacao:', e.message));

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

// Responde a solicitacao (muda status para RESPONDIDA + envia email ao titular)
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

    // Envia resposta por email ao titular (fire-and-forget)
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { nome: true }
    });
    enviarRespostaTitular({
      to: sol.titularEmail,
      titularNome: sol.titularNome,
      protocolo: sol.protocolo,
      respostaTexto,
      orgNome: org?.nome || 'Organizacao'
    }).catch(e => console.error('[dsar] falha email resposta:', e.message));

    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[POST /dsar/solicitacoes/:id/responder]', err);
    res.status(500).json({ erro: 'Erro ao responder solicitacao' });
  }
});

// ---------- Rotas publicas (sem auth, com OTP) ----------

// Passo 0: titular abre a pagina publica /solicitar/:slug. O frontend
// resolve o slug da camara para pegar nome, municipio e id real, que
// sera usado no POST /publico/solicitar-otp. Retorna somente dados
// nao sensiveis — nao expoe CNPJ nem lista de usuarios.
router.get('/publico/org/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ erro: 'Slug invalido' });
    const org = await prisma.organizacao.findUnique({
      where: { slug },
      select: { id: true, nome: true, municipio: true, logoBase64: true, ativo: true, modulosAtivos: true }
    });
    if (!org || !org.ativo) return res.status(404).json({ erro: 'Organizacao nao encontrada' });
    if (!org.modulosAtivos.includes('dsar')) {
      return res.status(403).json({ erro: 'Este servico nao esta disponivel para esta organizacao' });
    }
    res.json({
      id: org.id,
      nome: org.nome,
      municipio: org.municipio,
      logoBase64: org.logoBase64
    });
  } catch (err) {
    console.error('[GET /dsar/publico/org/:slug]', err);
    res.status(500).json({ erro: 'Erro ao buscar organizacao' });
  }
});

// Passo 1: titular envia o formulario. Gera OTP e envia email.
// NAO cria SolicitacaoTitular ainda — so guarda dados em DsarOtp.
router.post('/publico/solicitar-otp', validadoresSolicitarOtp, async (req, res) => {
  try {
    const { organizacaoId, titularNome, titularEmail, titularCpf, tipoDireito, descricao } = req.body;
    if (!organizacaoId || !titularNome || !titularEmail || !tipoDireito || !descricao) {
      return res.status(400).json({ erro: 'organizacaoId, titularNome, titularEmail, tipoDireito e descricao sao obrigatorios' });
    }

    const org = await prisma.organizacao.findUnique({
      where: { id: organizacaoId },
      select: { id: true, nome: true, ativo: true, modulosAtivos: true }
    });
    if (!org || !org.ativo) return res.status(404).json({ erro: 'Organizacao nao encontrada' });
    if (!org.modulosAtivos.includes('dsar')) return res.status(403).json({ erro: 'Este servico nao esta disponivel para esta organizacao' });

    const otp = await criarOtpDSAR({
      organizacaoId, email: titularEmail, titularNome, titularCpf, tipoDireito, descricao
    });

    // Envia email com o codigo (await para reportar erro real ao titular)
    try {
      await enviarOTP({
        to: titularEmail,
        titularNome,
        codigo: otp.codigo,
        orgNome: org.nome
      });
    } catch (e) {
      console.error('[dsar] falha ao enviar OTP:', e.message);
      // Em dev (sem SMTP), seguimos mesmo assim — o emailService loga no console
    }

    res.status(200).json({
      ok: true,
      mensagem: `Um codigo de verificacao foi enviado para ${titularEmail}. O codigo expira em 10 minutos.`,
      expiraEm: otp.expiresAt
    });
  } catch (err) {
    console.error('[POST /dsar/publico/solicitar-otp]', err);
    res.status(500).json({ erro: 'Erro ao solicitar codigo de verificacao' });
  }
});

// Passo 2: titular confirma OTP. Cria a solicitacao real.
router.post('/publico/confirmar-otp', validadoresConfirmarOtp, async (req, res) => {
  try {
    const { titularEmail, codigo } = req.body;
    if (!titularEmail || !codigo) {
      return res.status(400).json({ erro: 'titularEmail e codigo sao obrigatorios' });
    }

    const otp = await validarOtpDSAR({ email: titularEmail, codigo: String(codigo).trim() });
    if (!otp) return res.status(400).json({ erro: 'Codigo invalido ou expirado' });

    const sol = await criarSolicitacaoApartirDeOtp(otp);

    // Envia confirmacao da solicitacao oficial
    const org = await prisma.organizacao.findUnique({
      where: { id: otp.organizacaoId },
      select: { nome: true }
    });
    enviarConfirmacaoSolicitacao({
      to: otp.email,
      titularNome: otp.titularNome,
      protocolo: sol.protocolo,
      dataLimite: sol.dataLimite,
      orgNome: org?.nome || 'Organizacao'
    }).catch(e => console.error('[dsar] falha email confirmacao:', e.message));

    res.status(201).json({
      protocolo: sol.protocolo,
      dataLimite: sol.dataLimite,
      mensagem: `Sua solicitacao foi registrada com o protocolo ${sol.protocolo}. O prazo para resposta e de 15 dias corridos.`
    });
  } catch (err) {
    console.error('[POST /dsar/publico/confirmar-otp]', err);
    res.status(500).json({ erro: 'Erro ao confirmar codigo' });
  }
});

// Rota legado — redireciona para o novo fluxo OTP
router.post('/publico/nova-solicitacao', async (req, res) => {
  res.status(410).json({
    erro: 'Este endpoint foi substituido. Use POST /dsar/publico/solicitar-otp e depois POST /dsar/publico/confirmar-otp.'
  });
});

module.exports = router;
