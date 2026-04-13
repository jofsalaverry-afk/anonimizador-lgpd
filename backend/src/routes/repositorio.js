const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Upload de arquivos do repositorio: PDF/DOCX, max 20MB. Multer mantem
// o buffer em memoria porque o arquivo sera salvo em bytea no banco.
const MIMETYPES_ACEITOS = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
]);
const uploadArquivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (MIMETYPES_ACEITOS.has(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de arquivo nao suportado. Envie PDF ou DOCX.'));
  }
});

// Select padrao que OMITE o campo arquivo (bytea) — usado em listagens.
// Trazer o bytea na query da lista fica enorme e desnecessario.
const DOC_SELECT_LISTA = {
  id: true, organizacaoId: true, tipo: true, titulo: true, descricao: true,
  conteudoMd: true, versao: true, status: true, autorId: true, tags: true,
  mimetype: true, nomeArquivo: true, tamanhoBytes: true,
  criadoEm: true, atualizadoEm: true
};

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
    if (!org || !org.modulosAtivos.includes('repositorio')) {
      return res.status(403).json({ erro: 'Modulo "repositorio" nao esta ativo para sua organizacao.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar modulos' });
  }
};

router.use(authMiddleware, requireModulo);

// ==================== Documentos ====================

router.get('/documentos', async (req, res) => {
  try {
    const where = { organizacaoId: req.usuario.organizacaoId };
    if (req.query.categoria) where.tipo = String(req.query.categoria);
    const docs = await prisma.documentoRepositorio.findMany({
      where,
      orderBy: { atualizadoEm: 'desc' },
      select: DOC_SELECT_LISTA
    });
    res.json(docs);
  } catch (err) {
    console.error('[GET /repositorio/documentos]', err);
    res.status(500).json({ erro: 'Erro ao listar documentos' });
  }
});

router.get('/documentos/:id', async (req, res) => {
  try {
    const doc = await prisma.documentoRepositorio.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!doc) return res.status(404).json({ erro: 'Documento nao encontrado' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar documento' });
  }
});

router.post('/documentos', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissao' });
    }
    const { titulo, tipo, conteudoMd, status, tags } = req.body;
    if (!titulo || !tipo) return res.status(400).json({ erro: 'titulo e tipo sao obrigatorios' });
    const doc = await prisma.documentoRepositorio.create({
      data: {
        organizacaoId: req.usuario.organizacaoId,
        titulo, tipo,
        conteudoMd: conteudoMd || '',
        status: status || 'RASCUNHO',
        tags: tags || [],
        autorId: req.usuario.id
      }
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[POST /repositorio/documentos]', err);
    res.status(500).json({ erro: 'Erro ao criar documento' });
  }
});

// Upload de arquivo (PDF/DOCX ate 20MB). So ENCARREGADO_LGPD pode subir
// arquivos no fluxo do modulo. O admin sobe pela rota /admin/repositorio.
router.post('/upload', uploadArquivo.single('arquivo'), async (req, res) => {
  try {
    if (req.usuario.perfil !== 'ENCARREGADO_LGPD') {
      return res.status(403).json({ erro: 'Apenas o DPO (Encarregado LGPD) pode subir arquivos' });
    }
    if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo no campo "arquivo"' });
    const { titulo, descricao, categoria } = req.body;
    if (!titulo || !categoria) {
      return res.status(400).json({ erro: 'titulo e categoria sao obrigatorios' });
    }
    const doc = await prisma.documentoRepositorio.create({
      data: {
        organizacaoId: req.usuario.organizacaoId,
        tipo: categoria,
        titulo: String(titulo).trim(),
        descricao: descricao ? String(descricao).trim() : null,
        arquivo: req.file.buffer,
        mimetype: req.file.mimetype,
        nomeArquivo: req.file.originalname,
        tamanhoBytes: req.file.size,
        status: 'PUBLICADO',
        autorId: req.usuario.id,
        conteudoMd: ''
      },
      select: DOC_SELECT_LISTA
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[POST /repositorio/upload]', err);
    const msg = err && err.message && err.message.includes('nao suportado')
      ? err.message
      : (err && err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 20MB' : 'Erro ao subir arquivo');
    res.status(400).json({ erro: msg });
  }
});

// Download binario do arquivo anexado ao documento. Valida org do usuario
// e devolve o bytea com Content-Type/Disposition corretos.
router.get('/documentos/:id/download', async (req, res) => {
  try {
    const doc = await prisma.documentoRepositorio.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId },
      select: { arquivo: true, mimetype: true, nomeArquivo: true }
    });
    if (!doc || !doc.arquivo) return res.status(404).json({ erro: 'Arquivo nao encontrado' });
    res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.nomeArquivo || 'documento'}"`);
    res.send(Buffer.from(doc.arquivo));
  } catch (err) {
    console.error('[GET /repositorio/documentos/:id/download]', err);
    res.status(500).json({ erro: 'Erro ao baixar arquivo' });
  }
});

router.put('/documentos/:id', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissao' });
    }
    const existente = await prisma.documentoRepositorio.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Documento nao encontrado' });

    const { titulo, tipo, conteudoMd, status, tags } = req.body;
    // Incrementa versao se conteudo mudou
    const novaVersao = conteudoMd !== undefined && conteudoMd !== existente.conteudoMd
      ? existente.versao + 1 : existente.versao;

    const doc = await prisma.documentoRepositorio.update({
      where: { id: req.params.id },
      data: {
        ...(titulo !== undefined && { titulo }),
        ...(tipo !== undefined && { tipo }),
        ...(conteudoMd !== undefined && { conteudoMd }),
        ...(status !== undefined && { status }),
        ...(tags !== undefined && { tags }),
        versao: novaVersao
      }
    });
    res.json(doc);
  } catch (err) {
    console.error('[PUT /repositorio/documentos/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar documento' });
  }
});

router.delete('/documentos/:id', async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem excluir' });
    }
    const existente = await prisma.documentoRepositorio.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Documento nao encontrado' });
    await prisma.documentoRepositorio.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir documento' });
  }
});

// ==================== Incidentes ====================

router.get('/incidentes', async (req, res) => {
  try {
    const incidentes = await prisma.incidente.findMany({
      where: { organizacaoId: req.usuario.organizacaoId },
      orderBy: { criadoEm: 'desc' }
    });
    res.json(incidentes);
  } catch (err) {
    console.error('[GET /repositorio/incidentes]', err);
    res.status(500).json({ erro: 'Erro ao listar incidentes' });
  }
});

router.get('/incidentes/:id', async (req, res) => {
  try {
    const inc = await prisma.incidente.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!inc) return res.status(404).json({ erro: 'Incidente nao encontrado' });
    res.json(inc);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar incidente' });
  }
});

router.post('/incidentes', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissao' });
    }
    const { titulo, dataOcorrencia, tipoIncidente, dadosAfetados, qtdTitulares, descricao, planoAcao } = req.body;
    if (!titulo || !dataOcorrencia || !tipoIncidente || !descricao) {
      return res.status(400).json({ erro: 'titulo, dataOcorrencia, tipoIncidente e descricao sao obrigatorios' });
    }
    const inc = await prisma.incidente.create({
      data: {
        organizacaoId: req.usuario.organizacaoId,
        titulo, tipoIncidente, descricao,
        dataOcorrencia: new Date(dataOcorrencia),
        dadosAfetados: dadosAfetados || [],
        qtdTitulares: qtdTitulares || 0,
        planoAcao: planoAcao || null,
        autorId: req.usuario.id
      }
    });
    res.status(201).json(inc);
  } catch (err) {
    console.error('[POST /repositorio/incidentes]', err);
    res.status(500).json({ erro: 'Erro ao registrar incidente' });
  }
});

router.put('/incidentes/:id', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissao' });
    }
    const existente = await prisma.incidente.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Incidente nao encontrado' });

    const { titulo, status, tipoIncidente, dadosAfetados, qtdTitulares, descricao, planoAcao, notificadoANPD } = req.body;
    const inc = await prisma.incidente.update({
      where: { id: req.params.id },
      data: {
        ...(titulo !== undefined && { titulo }),
        ...(status !== undefined && { status }),
        ...(tipoIncidente !== undefined && { tipoIncidente }),
        ...(dadosAfetados !== undefined && { dadosAfetados }),
        ...(qtdTitulares !== undefined && { qtdTitulares }),
        ...(descricao !== undefined && { descricao }),
        ...(planoAcao !== undefined && { planoAcao }),
        ...(notificadoANPD !== undefined && { notificadoANPD })
      }
    });
    res.json(inc);
  } catch (err) {
    console.error('[PUT /repositorio/incidentes/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar incidente' });
  }
});

module.exports = router;
