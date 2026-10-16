const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { verificarRegistro } = require('../services/entidades');
const { registrarHistorico } = require('../services/historico');

const router = express.Router();
const prisma = new PrismaClient();

const LIMITE_BYTES = 20 * 1024 * 1024;

// mimetype declarado pelo navegador -> verificacao da assinatura real
// do arquivo (magic bytes). O mimetype sozinho e controlado pelo cliente.
const TIPOS_ACEITOS = {
  'application/pdf': buf => buf.subarray(0, 5).toString('latin1') === '%PDF-',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': buf => buf[0] === 0x50 && buf[1] === 0x4b,
  'application/msword': buf => buf.subarray(0, 4).toString('hex') === 'd0cf11e0',
  'image/png': buf => buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
  'image/jpeg': buf => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/gif': buf => buf.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': buf => buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_BYTES, files: 1 },
  defParamCharset: 'utf8',
  fileFilter: (_req, file, cb) => {
    if (TIPOS_ACEITOS[file.mimetype]) return cb(null, true);
    const err = new Error('Tipo de arquivo não suportado. Envie PDF, DOCX ou imagem (PNG, JPG, GIF, WEBP).');
    err.code = 'TIPO_INVALIDO';
    cb(err);
  }
});

// Converte erros do multer em 413/400 em vez de 500.
function receberArquivo(req, res, next) {
  upload.single('arquivo')(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erro: 'Arquivo excede o limite de 20 MB' });
    if (err.code === 'TIPO_INVALIDO') return res.status(400).json({ erro: err.message });
    return res.status(400).json({ erro: 'Upload inválido' });
  });
}

function nomeSeguro(nome) {
  const limpo = String(nome || 'arquivo').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return (limpo || 'arquivo').slice(0, 200);
}

const SELECT_SEM_CONTEUDO = {
  id: true, entidade: true, registroId: true, nomeArquivo: true, mimeType: true,
  tamanho: true, hashSha256: true, criadoEm: true,
  enviadoPor: { select: { id: true, nome: true } }
};

router.use(authUsuario);

// GET /anexos?entidade=TRATAMENTO&registroId=... — lista sem o conteudo
router.get('/', async (req, res) => {
  try {
    const { entidade, registroId } = req.query;
    const falha = await verificarRegistro(prisma, {
      entidade: String(entidade || ''), registroId: String(registroId || ''), organizacaoId: req.usuario.organizacaoId, paraAnexo: true
    });
    if (falha) return res.status(falha.status).json({ erro: falha.erro });
    const anexos = await prisma.anexo.findMany({
      where: { organizacaoId: req.usuario.organizacaoId, entidade, registroId },
      select: SELECT_SEM_CONTEUDO,
      orderBy: { criadoEm: 'desc' }
    });
    res.json(anexos);
  } catch (err) {
    console.error('[GET /anexos]', err);
    res.status(500).json({ erro: 'Erro ao listar anexos' });
  }
});

// POST /anexos (multipart: arquivo, entidade, registroId)
router.post('/', receberArquivo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para anexar arquivos' });
    }
    if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo no campo "arquivo"' });
    const { entidade, registroId } = req.body;
    const organizacaoId = req.usuario.organizacaoId;

    const falha = await verificarRegistro(prisma, { entidade, registroId, organizacaoId, paraAnexo: true });
    if (falha) return res.status(falha.status).json({ erro: falha.erro });

    if (!TIPOS_ACEITOS[req.file.mimetype](req.file.buffer)) {
      return res.status(400).json({ erro: 'O conteúdo do arquivo não corresponde ao tipo informado' });
    }

    const nomeArquivo = nomeSeguro(req.file.originalname);
    const hashSha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    const anexo = await prisma.$transaction(async (tx) => {
      const criado = await tx.anexo.create({
        data: {
          organizacaoId, entidade, registroId, nomeArquivo,
          mimeType: req.file.mimetype,
          tamanho: req.file.size,
          conteudo: req.file.buffer,
          hashSha256,
          enviadoPorId: req.usuario.id
        },
        select: SELECT_SEM_CONTEUDO
      });
      await registrarHistorico(tx, {
        organizacaoId, entidade, registroId, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { anexo: { antes: null, depois: `${nomeArquivo} (SHA-256 ${hashSha256.slice(0, 12)}…)` } }
      });
      return criado;
    });

    res.status(201).json(anexo);
  } catch (err) {
    console.error('[POST /anexos]', err);
    res.status(500).json({ erro: 'Erro ao salvar anexo' });
  }
});

// GET /anexos/:id/download — so da propria organizacao
router.get('/:id/download', async (req, res) => {
  try {
    const anexo = await prisma.anexo.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado' });
    const buf = Buffer.from(anexo.conteudo);
    res.setHeader('Content-Type', anexo.mimeType);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(anexo.nomeArquivo)}`);
    res.setHeader('X-Content-SHA256', anexo.hashSha256);
    res.send(buf);
  } catch (err) {
    console.error('[GET /anexos/:id/download]', err);
    res.status(500).json({ erro: 'Erro ao baixar anexo' });
  }
});

module.exports = router;
