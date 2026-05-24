// Rotas do módulo Pesquisa de Satisfação (PNTP TCE/RS 15.6).
//
// Rotas autenticadas exigem JWT + módulo "pesquisa" em modulosAtivos.
// Rotas públicas (/publico/*) são anônimas — sem nome/email/CPF — e
// têm dois limiters: per-IP (3/24h) anti-cidadão hostil, e per-slug
// global (1000/min) anti-DDoS.
//
// Toda submissão pública é auditada via auditarRequisicaoAnonima com
// ipHash (HMAC SHA-256 com salt JWT_SECRET), userAgent e slug —
// sem conteúdo da resposta. Necessário para defesa de integridade
// dos números perante TCE.

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { body, param } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const {
  validar,
  sanitizarTexto
} = require('../middlewares/seguranca');
const { auditarRequisicaoAnonima } = require('../middlewares/auditoria');
const { enviar } = require('../services/emailService');
const {
  validarSetor,
  calcularMetricas,
  calcularMetricasPublicas
} = require('../services/pesquisaService');

const router = express.Router();
const prisma = new PrismaClient();

const VALIDATE_OFF = { xForwardedForHeader: false };

// ==================== Rate limiters ====================
// Per-IP: 3 submissões / 24h. Aplicado APENAS em POST /publico/:slug
// (não em GET). Calibrado pra evitar abuso individual sem bloquear
// cidadão legítimo que erra o form e reenvia.
const limiterPesquisaPublicoPorIp = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  validate: VALIDATE_OFF,
  message: { erro: 'Você já enviou pesquisas recentes. Tente novamente em 24h.' }
});

// Global per-slug: 1000 req/min. Anti-DDoS — protege a câmara contra
// pico abusivo quando o link da pesquisa é divulgado publicamente.
// Aplica a TODAS as rotas /publico/:slug (submit + reads).
const limiterPesquisaPublicoPorSlug = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `slug:${String(req.params.slug || '').toLowerCase()}`,
  validate: VALIDATE_OFF,
  message: { erro: 'Serviço temporariamente indisponível. Tente novamente em instantes.' }
});

// ==================== Middlewares de auth ====================
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
    if (!org || !org.modulosAtivos.includes('pesquisa')) {
      return res.status(403).json({ erro: 'Módulo "pesquisa" não está ativo para sua organização.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar módulos' });
  }
};

// ==================== Validadores ====================
const validadoresSubmeter = [
  param('slug').trim().isLength({ min: 2, max: 100 }).matches(/^[a-z0-9-]+$/i).withMessage('Slug inválido'),
  body('avaliacao').isInt({ min: 1, max: 5 }).withMessage('Avaliação deve ser inteira de 1 a 5'),
  body('setor').isString().trim().isLength({ min: 1, max: 80 }).withMessage('Setor obrigatório (1-80 caracteres)'),
  sanitizarTexto('comentario', { min: 5, max: 2000 }),
  validar
];

const validadoresSetoresUpdate = [
  body('setores').isArray({ min: 1, max: 30 }).withMessage('Setores deve ser array de 1-30 itens'),
  body('setores.*').isString().trim().isLength({ min: 1, max: 80 }).withMessage('Cada setor deve ter 1-80 caracteres'),
  validar
];

// ==================== Rotas autenticadas ====================
// Lista pesquisas com filtros + paginação. Retorna registros completos
// (incluindo comentário) — esta rota só responde a usuários autenticados
// com módulo "pesquisa" ativo.
router.get('/', authMiddleware, requireModulo, async (req, res) => {
  try {
    const { avaliacao, setor, desde, ate } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    const where = { organizacaoId: req.usuario.organizacaoId };
    if (avaliacao) where.avaliacao = parseInt(avaliacao, 10);
    if (setor) where.setor = String(setor);
    if (desde || ate) {
      where.criadoEm = {};
      if (desde) where.criadoEm.gte = new Date(desde);
      if (ate) where.criadoEm.lte = new Date(ate);
    }

    const [pesquisas, total] = await Promise.all([
      prisma.pesquisaSatisfacao.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.pesquisaSatisfacao.count({ where })
    ]);

    res.json({ pesquisas, total, limit, offset });
  } catch (err) {
    console.error('[GET /pesquisa]', err);
    res.status(500).json({ erro: 'Erro ao listar pesquisas' });
  }
});

router.get('/metricas', authMiddleware, requireModulo, async (req, res) => {
  try {
    const { desde, ate } = req.query;
    const metricas = await calcularMetricas(req.usuario.organizacaoId, {
      dataInicio: desde,
      dataFim: ate
    });
    res.json(metricas);
  } catch (err) {
    console.error('[GET /pesquisa/metricas]', err);
    res.status(500).json({ erro: 'Erro ao calcular métricas' });
  }
});

router.get('/setores', authMiddleware, requireModulo, async (req, res) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { setoresPesquisa: true }
    });
    res.json({ setores: org?.setoresPesquisa || [] });
  } catch (err) {
    console.error('[GET /pesquisa/setores]', err);
    res.status(500).json({ erro: 'Erro ao buscar setores' });
  }
});

router.put('/setores', authMiddleware, requireModulo, validadoresSetoresUpdate, async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem editar setores' });
    }
    const setores = [...new Set(req.body.setores.map(s => String(s).trim()).filter(Boolean))];
    if (setores.length === 0) {
      return res.status(400).json({ erro: 'Informe ao menos um setor' });
    }
    const org = await prisma.organizacao.update({
      where: { id: req.usuario.organizacaoId },
      data: { setoresPesquisa: setores },
      select: { setoresPesquisa: true }
    });
    res.json({ setores: org.setoresPesquisa });
  } catch (err) {
    console.error('[PUT /pesquisa/setores]', err);
    res.status(500).json({ erro: 'Erro ao atualizar setores' });
  }
});

router.get('/:id', authMiddleware, requireModulo, async (req, res) => {
  try {
    const p = await prisma.pesquisaSatisfacao.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!p) return res.status(404).json({ erro: 'Pesquisa não encontrada' });
    res.json(p);
  } catch (err) {
    console.error('[GET /pesquisa/:id]', err);
    res.status(500).json({ erro: 'Erro ao buscar pesquisa' });
  }
});

// ==================== Rotas públicas ====================
// Resolve dados públicos da organização pelo slug. Espelha
// /dsar/publico/org/:slug mas gateado em modulosAtivos.pesquisa
// para manter o módulo autônomo — câmara que assina só Pesquisa
// (sem DSAR) precisa do endpoint funcionando.
router.get('/publico/org/:slug',
  limiterPesquisaPublicoPorSlug,
  async (req, res) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (!slug) return res.status(400).json({ erro: 'Slug inválido' });
      const org = await prisma.organizacao.findUnique({
        where: { slug },
        select: { id: true, nome: true, municipio: true, logoBase64: true, ativo: true, modulosAtivos: true }
      });
      if (!org || !org.ativo) return res.status(404).json({ erro: 'Organização não encontrada' });
      if (!org.modulosAtivos.includes('pesquisa')) {
        return res.status(403).json({ erro: 'Este serviço não está disponível para esta organização' });
      }
      res.json({
        id: org.id,
        nome: org.nome,
        municipio: org.municipio,
        logoBase64: org.logoBase64
      });
    } catch (err) {
      console.error('[GET /pesquisa/publico/org/:slug]', err);
      res.status(500).json({ erro: 'Erro ao buscar organização' });
    }
  }
);

// GET de setores ativos pra popular o select da página pública.
router.get('/publico/setores/:slug',
  limiterPesquisaPublicoPorSlug,
  async (req, res) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const org = await prisma.organizacao.findUnique({
        where: { slug },
        select: { ativo: true, modulosAtivos: true, setoresPesquisa: true }
      });
      if (!org || !org.ativo) return res.status(404).json({ erro: 'Organização não encontrada' });
      if (!org.modulosAtivos.includes('pesquisa')) {
        return res.status(403).json({ erro: 'Este serviço não está disponível para esta organização' });
      }
      res.json({ setores: org.setoresPesquisa });
    } catch (err) {
      console.error('[GET /pesquisa/publico/setores/:slug]', err);
      res.status(500).json({ erro: 'Erro ao buscar setores' });
    }
  }
);

// Métricas públicas anonimizadas — gate de mínimo 5 respostas.
// Sem comentários, sem ids individuais — só agregados.
router.get('/publico/metricas/:slug',
  limiterPesquisaPublicoPorSlug,
  async (req, res) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const org = await prisma.organizacao.findUnique({
        where: { slug },
        select: { id: true, ativo: true, modulosAtivos: true }
      });
      if (!org || !org.ativo) return res.status(404).json({ erro: 'Organização não encontrada' });
      if (!org.modulosAtivos.includes('pesquisa')) {
        return res.status(403).json({ erro: 'Este serviço não está disponível para esta organização' });
      }
      const { desde, ate } = req.query;
      const metricas = await calcularMetricasPublicas(org.id, {
        dataInicio: desde,
        dataFim: ate
      });
      res.json(metricas);
    } catch (err) {
      console.error('[GET /pesquisa/publico/metricas/:slug]', err);
      res.status(500).json({ erro: 'Erro ao calcular métricas' });
    }
  }
);

// Submissão anônima. Aplica AMBOS os limiters (per-slug global + per-IP).
// Audita o evento (sem conteúdo) e — se avaliacao <= 2 — notifica gestores.
router.post('/publico/:slug',
  limiterPesquisaPublicoPorSlug,
  limiterPesquisaPublicoPorIp,
  validadoresSubmeter,
  async (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    try {
      const org = await prisma.organizacao.findUnique({
        where: { slug },
        select: { id: true, nome: true, ativo: true, modulosAtivos: true, setoresPesquisa: true }
      });
      if (!org || !org.ativo) {
        auditarRequisicaoAnonima(prisma, { req, statusCode: 404, slug, evento: 'pesquisa_org_invalida' });
        return res.status(404).json({ erro: 'Organização não encontrada' });
      }
      if (!org.modulosAtivos.includes('pesquisa')) {
        auditarRequisicaoAnonima(prisma, { req, statusCode: 403, slug, evento: 'pesquisa_modulo_inativo', organizacaoId: org.id });
        return res.status(403).json({ erro: 'Este serviço não está disponível para esta organização' });
      }

      const { avaliacao, setor, comentario } = req.body;
      if (!org.setoresPesquisa.includes(setor)) {
        auditarRequisicaoAnonima(prisma, { req, statusCode: 400, slug, evento: 'pesquisa_setor_invalido', organizacaoId: org.id });
        return res.status(400).json({ erro: `Setor inválido. Aceitos: ${org.setoresPesquisa.join(', ')}` });
      }

      const pesquisa = await prisma.pesquisaSatisfacao.create({
        data: {
          organizacaoId: org.id,
          avaliacao,
          setor,
          comentario
        },
        select: { id: true, criadoEm: true }
      });

      // Audita ANTES de qualquer envio de email (audit é compliance-crítico;
      // email é best-effort).
      auditarRequisicaoAnonima(prisma, {
        req,
        statusCode: 201,
        slug,
        evento: 'pesquisa_submetida',
        organizacaoId: org.id
      });

      // Notifica gestores SOMENTE em insatisfação real (avaliacao <= 2).
      // Decisão de design: notas 3-5 não geram email; gestor consulta painel.
      if (avaliacao <= 2) {
        (async () => {
          try {
            const gestores = await prisma.usuario.findMany({
              where: { organizacaoId: org.id, ativo: true, perfil: { in: ['GESTOR', 'ENCARREGADO_LGPD'] } },
              select: { email: true }
            });
            const destinatarios = gestores.map(g => g.email).filter(Boolean);
            // Fallback: org sem gestor/DPO ativo → alerta admin da plataforma,
            // que aciona a câmara pra cadastrar destinatário.
            if (!destinatarios.length) {
              const adminEmail = process.env.ADMIN_ALERT_EMAIL;
              if (!adminEmail) return;
              const subjectAdmin = `[SEM_GESTOR] Nova pesquisa ${avaliacao}/5 — ${org.nome}`;
              const textAdmin =
                `Pesquisa de satisfação com nota baixa recebida, mas a organização não possui ` +
                `usuário ativo com perfil GESTOR ou ENCARREGADO_LGPD para receber a notificação.\n\n` +
                `Organização: ${org.nome}\n` +
                `Slug: ${slug}\n` +
                `Avaliação: ${avaliacao}/5\n` +
                `Setor: ${setor}\n` +
                `Recebida em: ${pesquisa.criadoEm.toISOString()}\n\n` +
                `Ação necessária: cadastrar ao menos um usuário GESTOR ou ENCARREGADO_LGPD ativo ` +
                `nesta organização para que futuras avaliações baixas sejam roteadas à câmara.`;
              const htmlAdmin = `<p><strong>Pesquisa de satisfação com nota baixa recebida, mas a organização não possui usuário ativo com perfil GESTOR ou ENCARREGADO_LGPD para receber a notificação.</strong></p>
<p><strong>Organização:</strong> ${org.nome}<br>
<strong>Slug:</strong> ${slug}<br>
<strong>Avaliação:</strong> ${avaliacao}/5<br>
<strong>Setor:</strong> ${setor}<br>
<strong>Recebida em:</strong> ${pesquisa.criadoEm.toISOString()}</p>
<p><strong>Ação necessária:</strong> cadastrar ao menos um usuário GESTOR ou ENCARREGADO_LGPD ativo nesta organização para que futuras avaliações baixas sejam roteadas à câmara.</p>`;
              await enviar({ to: adminEmail, subject: subjectAdmin, text: textAdmin, html: htmlAdmin });
              return;
            }
            const subject = `[INSATISFACAO] Nova pesquisa ${avaliacao}/5 — ${org.nome}`;
            const text =
              `Nova pesquisa de satisfação com nota baixa recebida.\n\n` +
              `Organização: ${org.nome}\n` +
              `Avaliação: ${avaliacao}/5\n` +
              `Setor: ${setor}\n` +
              `Recebida em: ${pesquisa.criadoEm.toISOString()}\n\n` +
              `Comentário:\n${comentario}\n\n` +
              `Acesse o painel para mais detalhes.`;
            const html = `<p><strong>Nova pesquisa de satisfação com nota baixa recebida.</strong></p>
<p><strong>Organização:</strong> ${org.nome}<br>
<strong>Avaliação:</strong> ${avaliacao}/5<br>
<strong>Setor:</strong> ${setor}<br>
<strong>Recebida em:</strong> ${pesquisa.criadoEm.toISOString()}</p>
<p><strong>Comentário:</strong></p>
<p>${String(comentario).replace(/\n/g, '<br>')}</p>
<p>Acesse o painel para mais detalhes.</p>`;
            await enviar({ to: destinatarios.join(','), subject, text, html });
          } catch (e) {
            console.error('[pesquisa] falha ao notificar gestores:', e.message);
          }
        })();
      }

      res.status(201).json({
        ok: true,
        mensagem: 'Obrigado por compartilhar sua opinião. Sua avaliação foi registrada e ajudará a melhorar os serviços.'
      });
    } catch (err) {
      console.error('[POST /pesquisa/publico/:slug]', err);
      auditarRequisicaoAnonima(prisma, { req, statusCode: 500, slug, evento: 'pesquisa_erro_servidor' });
      res.status(500).json({ erro: 'Erro ao enviar pesquisa' });
    }
  }
);

module.exports = router;
