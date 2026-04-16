const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { body } = require('express-validator');
const { auditarLogin } = require('../middlewares/auditoria');
const { validar, validarEmail } = require('../middlewares/seguranca');
const { getTrilhasComOverrides, TRILHAS_BASE } = require('./treinamento');

const router = express.Router();
const prisma = new PrismaClient();

// Multer para upload de arquivos do repositorio pelo painel admin.
// Mesmos limites da rota do modulo: 20MB, PDF/DOCX.
const MIMETYPES_REPO = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
]);
const uploadRepo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (MIMETYPES_REPO.has(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de arquivo não suportado. Envie PDF ou DOCX.'));
  }
});

const REPO_SELECT_LISTA = {
  id: true, organizacaoId: true, tipo: true, titulo: true, descricao: true,
  mimetype: true, nomeArquivo: true, tamanhoBytes: true,
  versao: true, status: true, criadoEm: true, atualizadoEm: true
};

const validadoresAdminLogin = [
  validarEmail('email'),
  body('senha').isString().isLength({ min: 1, max: 200 }).withMessage('Senha obrigatória'),
  validar
];

const validadoresCriarCamara = [
  body('nome').trim().isLength({ min: 2, max: 200 }).withMessage('Nome inválido').escape(),
  body('cnpj').trim().matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$|^\d{14}$/).withMessage('CNPJ inválido'),
  validarEmail('email'),
  body('senha').isLength({ min: 8, max: 200 }).withMessage('Senha deve ter ao menos 8 caracteres'),
  body('plano').optional().isIn(['basico', 'intermediario', 'avancado']).withMessage('Plano inválido'),
  validar
];

const adminAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ erro: 'Token inválido' });
  }
};

router.post('/login', validadoresAdminLogin, async (req, res) => {
  try {
    const { email, senha } = req.body;
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'admin', motivo: 'email_nao_encontrado' });
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    const senhaValida = await bcrypt.compare(senha, admin.senhaHash);
    if (!senhaValida) {
      auditarLogin(prisma, { req, sucesso: false, userType: 'admin', userId: admin.id, motivo: 'senha_invalida' });
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    const token = jwt.sign({ id: admin.id, email: admin.email, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '8h' });
    auditarLogin(prisma, { req, sucesso: true, userType: 'admin', userId: admin.id });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Organizacoes (antigo "camaras") ----------

router.get('/camaras', adminAuth, async (req, res) => {
  try {
    const orgs = await prisma.organizacao.findMany({
      select: {
        id: true, nome: true, cnpj: true, ativo: true, plano: true, criadoEm: true, modulosAtivos: true, slug: true,
        _count: { select: { documentos: true, usuarios: true } },
        usuarios: {
          where: { deletedAt: null },
          select: { id: true, email: true, perfil: true, ativo: true, ultimoAcesso: true },
          orderBy: { criadoEm: 'asc' }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/camaras', adminAuth, validadoresCriarCamara, async (req, res) => {
  try {
    const { nome, cnpj, email, senha, plano } = req.body;
    const nomeNormalizado = nome ? nome.normalize('NFC') : nome;
    const senhaHash = await bcrypt.hash(senha, 10);
    // Cria organizacao + primeiro usuario (GESTOR) em transacao
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organizacao.create({
        data: { nome: nomeNormalizado, cnpj, plano: plano || 'basico' }
      });
      const usuario = await tx.usuario.create({
        data: { email, senhaHash, nome: nomeNormalizado, perfil: 'GESTOR', organizacaoId: org.id }
      });
      return { org, usuario };
    });
    res.status(201).json({ id: result.org.id, nome: result.org.nome, email: result.usuario.email });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ erro: 'CNPJ ou email já cadastrado' });
    }
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/camaras/:id/toggle', adminAuth, async (req, res) => {
  try {
    const org = await prisma.organizacao.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ erro: 'Organização não encontrada' });
    const atualizada = await prisma.organizacao.update({ where: { id: req.params.id }, data: { ativo: !org.ativo } });
    res.json({ id: atualizada.id, ativo: atualizada.ativo });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Modulos por organizacao ----------

router.patch('/camaras/:id/modulos', adminAuth, async (req, res) => {
  try {
    const { modulosAtivos } = req.body;
    const MODULOS_VALIDOS = ['anonimizador', 'ropa', 'dsar', 'repositorio', 'treinamento', 'checklist'];
    const validos = (modulosAtivos || []).filter(m => MODULOS_VALIDOS.includes(m));
    const org = await prisma.organizacao.update({
      where: { id: req.params.id },
      data: { modulosAtivos: validos },
      select: { id: true, nome: true, modulosAtivos: true }
    });
    res.json(org);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Organização não encontrada' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Usuarios dentro de organizacoes ----------

router.post('/camaras/:id/usuarios', adminAuth, async (req, res) => {
  try {
    const { email, nome, senha, perfil } = req.body;
    const org = await prisma.organizacao.findUnique({ where: { id: req.params.id } });
    if (!org) return res.status(404).json({ erro: 'Organização não encontrada' });
    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({
      data: {
        email, senhaHash,
        nome: (nome || org.nome).normalize('NFC'),
        perfil: perfil || 'OPERADOR',
        organizacaoId: org.id
      },
      select: { id: true, email: true, nome: true, perfil: true }
    });
    res.status(201).json(usuario);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ erro: 'Email já cadastrado' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/usuarios/:id/toggle', adminAuth, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario || usuario.deletedAt) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const atualizado = await prisma.usuario.update({ where: { id: req.params.id }, data: { ativo: !usuario.ativo } });
    res.json({ id: atualizado.id, ativo: atualizado.ativo });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/usuarios/:id/perfil', adminAuth, async (req, res) => {
  try {
    const { perfil } = req.body;
    const PERFIS_VALIDOS = ['ENCARREGADO_LGPD', 'GESTOR', 'OPERADOR', 'AUDITOR', 'TREINANDO'];
    if (!PERFIS_VALIDOS.includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido' });
    const atualizado = await prisma.usuario.update({
      where: { id: req.params.id },
      data: { perfil },
      select: { id: true, email: true, perfil: true }
    });
    res.json(atualizado);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// Soft delete: mantem a linha no banco com deletedAt preenchido para
// preservar rastreabilidade (logs, DSAR respondidos, etc.) — requisito
// de compliance LGPD. Usuario soft-deletado some da listagem mas referencias
// historicas continuam validas.
router.delete('/usuarios/:id', adminAuth, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario || usuario.deletedAt) return res.status(404).json({ erro: 'Usuário não encontrado' });
    await prisma.usuario.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), ativo: false }
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Stats ----------

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalOrgs, orgsAtivas, totalDocumentos, totalUsuarios] = await Promise.all([
      prisma.organizacao.count(),
      prisma.organizacao.count({ where: { ativo: true } }),
      prisma.documento.count(),
      prisma.usuario.count()
    ]);
    res.json({ totalCamaras: totalOrgs, camarasAtivas: orgsAtivas, totalDocumentos, totalUsuarios });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ---------- Treinamento — gestao de trilhas ----------

// Extrai ID do video de uma URL do YouTube ou retorna o proprio ID se
// ja for um ID (11 chars alfanumerico/underscore/hifen).
function extrairYoutubeId(entrada) {
  if (!entrada) return null;
  const s = entrada.trim();
  // Se ja e um ID valido (11 chars, [A-Za-z0-9_-])
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  // Tenta extrair de URL
  const match = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

router.get('/treinamento/trilhas', adminAuth, async (req, res) => {
  try {
    const trilhas = await getTrilhasComOverrides();
    res.json(trilhas);
  } catch (err) {
    console.error('[GET /admin/treinamento/trilhas]', err);
    res.status(500).json({ erro: 'Erro ao listar trilhas' });
  }
});

router.put('/treinamento/trilhas/:trilhaId/modulos/:moduloId', adminAuth, async (req, res) => {
  try {
    const { trilhaId, moduloId } = req.params;
    const { youtubeId: entradaRaw, titulo } = req.body;

    // Valida que a trilha e modulo existem no hardcoded base
    const trilhaBase = TRILHAS_BASE.find(t => t.id === trilhaId);
    if (!trilhaBase) return res.status(404).json({ erro: 'Trilha não encontrada' });
    const moduloBase = trilhaBase.modulos.find(m => m.moduloId === moduloId);
    if (!moduloBase) return res.status(404).json({ erro: 'Módulo não encontrado' });

    // Extrai/valida o youtubeId (aceita URL completa)
    const youtubeId = extrairYoutubeId(entradaRaw);
    if (!youtubeId) return res.status(400).json({ erro: 'youtubeId inválido (informe o ID de 11 chars ou a URL do YouTube)' });

    // Upsert no override
    const override = await prisma.trilhaOverride.upsert({
      where: { trilhaId_moduloId: { trilhaId, moduloId } },
      create: { trilhaId, moduloId, youtubeId, titulo: titulo || null },
      update: { youtubeId, titulo: titulo || null }
    });

    res.json(override);
  } catch (err) {
    console.error('[PUT /admin/treinamento/trilhas/:trilhaId/modulos/:moduloId]', err);
    res.status(500).json({ erro: 'Erro ao salvar override' });
  }
});

// ---------- Repositorio de Documentos (admin cross-org) ----------

// Lista arquivos do repositorio de uma organizacao especifica. Admin
// pode ver/gerenciar docs de qualquer camara — o id da org vem na query.
router.get('/repositorio', adminAuth, async (req, res) => {
  try {
    const organizacaoId = String(req.query.organizacaoId || '').trim();
    if (!organizacaoId) return res.status(400).json({ erro: 'organizacaoId é obrigatório' });
    const docs = await prisma.documentoRepositorio.findMany({
      where: { organizacaoId },
      orderBy: { criadoEm: 'desc' },
      select: REPO_SELECT_LISTA
    });
    res.json(docs);
  } catch (err) {
    console.error('[GET /admin/repositorio]', err);
    res.status(500).json({ erro: 'Erro ao listar documentos' });
  }
});

// Upload de arquivo pelo admin em nome de uma organizacao. Espera
// multipart/form-data com: arquivo, titulo, categoria, descricao, organizacaoId.
router.post('/repositorio/upload', adminAuth, uploadRepo.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo no campo "arquivo"' });
    const { titulo, descricao, categoria, organizacaoId } = req.body;
    if (!titulo || !categoria || !organizacaoId) {
      return res.status(400).json({ erro: 'titulo, categoria e organizacaoId são obrigatórios' });
    }
    // Valida que a org existe antes de criar
    const org = await prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { id: true } });
    if (!org) return res.status(404).json({ erro: 'Organização não encontrada' });

    const doc = await prisma.documentoRepositorio.create({
      data: {
        organizacaoId,
        tipo: categoria,
        titulo: String(titulo).trim(),
        descricao: descricao ? String(descricao).trim() : null,
        arquivo: req.file.buffer,
        mimetype: req.file.mimetype,
        nomeArquivo: req.file.originalname,
        tamanhoBytes: req.file.size,
        status: 'PUBLICADO',
        conteudoMd: ''
      },
      select: REPO_SELECT_LISTA
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[POST /admin/repositorio/upload]', err);
    const msg = err && err.message && err.message.includes('não suportado')
      ? err.message
      : (err && err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 20MB' : 'Erro ao subir arquivo');
    res.status(400).json({ erro: msg });
  }
});

// Remove um documento do repositorio. So admin.
router.delete('/repositorio/:id', adminAuth, async (req, res) => {
  try {
    const existente = await prisma.documentoRepositorio.findUnique({
      where: { id: req.params.id },
      select: { id: true }
    });
    if (!existente) return res.status(404).json({ erro: 'Documento não encontrado' });
    await prisma.documentoRepositorio.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /admin/repositorio/:id]', err);
    res.status(500).json({ erro: 'Erro ao excluir documento' });
  }
});

module.exports = router;
