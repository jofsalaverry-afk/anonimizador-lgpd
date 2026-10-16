const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
const { registrarHistorico } = require('../services/historico');
const { responsavelValido } = require('../services/entidades');
const { responderExport } = require('../services/exportadores');
const { dataPura, hojeSP, fmtData } = require('../services/datas');
const { comPrazo, RISCOS } = require('../services/incidentes');
const { normalizarCategorias } = require('../services/basesLegais');

// Datas puras do incidente: AAAA-MM-DD, gravadas a meia-noite UTC.
const DATAS_INCIDENTE = ['dataOcorrencia', 'dataCiencia', 'dataComunicacaoANPD', 'dataComunicacaoTitulares'];
// Le os campos de data/risco presentes no corpo. Retorna { data } ou { erro }.
function lerDatasIncidente(b) {
  const data = {};
  for (const c of DATAS_INCIDENTE) {
    if (b[c] === undefined) continue;
    const d = dataPura(b[c]);
    if (d === undefined) return { erro: `Data inválida em ${c} (use AAAA-MM-DD)` };
    data[c] = d;
  }
  if (b.riscoRelevante !== undefined) {
    if (b.riscoRelevante && !RISCOS.includes(b.riscoRelevante)) return { erro: 'Risco relevante inválido (SIM, NAO ou EM_AVALIACAO)' };
    data.riscoRelevante = b.riscoRelevante || null;
  }
  // Compatibilidade: "notificadoANPD" passa a refletir a data de comunicacao
  if (data.dataComunicacaoANPD !== undefined) data.notificadoANPD = !!data.dataComunicacaoANPD;
  return { data };
}

const INCIDENTE_INCLUDE = { responsavel: { select: { id: true, nome: true } } };

// Categorias aceitas no upload (= enum TipoDocRepo). Sem isso, valor
// invalido virava erro 500 do Prisma.
const CATEGORIAS_DOC = ['POLITICA', 'TERMO', 'ADITIVO', 'CONTRATO', 'MODELO', 'OUTRO', 'POLITICA_PRIVACIDADE', 'POLITICA_SEGURANCA', 'MODELO_DSAR', 'TERMO_USO'];
const SEVERIDADES = ['ALTA', 'MEDIA', 'BAIXA'];
const TIPOS_REGISTRO = ['REAL', 'SIMULADO'];

// Valida severidade/tipoRegistro. Retorna mensagem de erro ou null.
function erroClassificacao({ severidade, tipoRegistro }) {
  if (severidade !== undefined && severidade !== null && severidade !== '' && !SEVERIDADES.includes(severidade)) return 'Severidade inválida';
  if (tipoRegistro !== undefined && !TIPOS_REGISTRO.includes(tipoRegistro)) return 'Tipo de registro inválido (REAL ou SIMULADO)';
  return null;
}

function resumoProvidencia(p) {
  const data = fmtData(p.data);
  return `${data} — ${p.descricao}${p.responsavel?.nome ? ` (${p.responsavel.nome})` : ''}`;
}

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
    cb(new Error('Tipo de arquivo não suportado. Envie PDF ou DOCX.'));
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

// Auth compartilhado: rejeita tokens intermediarios de MFA (mfaPending/mfaSetup).
const authMiddleware = authUsuario;

const requireModulo = async (req, res, next) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { modulosAtivos: true }
    });
    if (!org || !org.modulosAtivos.includes('repositorio')) {
      return res.status(403).json({ erro: 'Módulo "repositorio" não está ativo para sua organização.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar módulos' });
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
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar documento' });
  }
});

router.post('/documentos', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    const { titulo, tipo, conteudoMd, status, tags } = req.body;
    if (!titulo || !tipo) return res.status(400).json({ erro: 'titulo e tipo são obrigatórios' });
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
      return res.status(400).json({ erro: 'titulo e categoria são obrigatórios' });
    }
    if (!CATEGORIAS_DOC.includes(categoria)) {
      return res.status(400).json({ erro: 'Categoria inválida' });
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
    const msg = err && err.message && err.message.includes('não suportado')
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
    if (!doc || !doc.arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado' });
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
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    const existente = await prisma.documentoRepositorio.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Documento não encontrado' });

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
    if (!existente) return res.status(404).json({ erro: 'Documento não encontrado' });
    await prisma.documentoRepositorio.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir documento' });
  }
});

// ==================== Incidentes ====================

router.get('/incidentes', async (req, res) => {
  try {
    const where = { organizacaoId: req.usuario.organizacaoId };
    if (SEVERIDADES.includes(req.query.severidade)) where.severidade = req.query.severidade;
    if (TIPOS_REGISTRO.includes(req.query.tipoRegistro)) where.tipoRegistro = req.query.tipoRegistro;
    const incidentes = await prisma.incidente.findMany({
      where,
      include: INCIDENTE_INCLUDE,
      orderBy: { criadoEm: 'desc' }
    });
    res.json(incidentes.map(i => comPrazo(i)));
  } catch (err) {
    console.error('[GET /repositorio/incidentes]', err);
    res.status(500).json({ erro: 'Erro ao listar incidentes' });
  }
});

// GET /repositorio/incidentes/export?formato=csv|json (com providencias)
router.get('/incidentes/export', async (req, res) => {
  try {
    await responderExport(res, prisma, 'incidentes', req.usuario.organizacaoId, req.query.formato);
  } catch (err) {
    console.error('[GET /repositorio/incidentes/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar incidentes' });
  }
});

router.get('/incidentes/:id', async (req, res) => {
  try {
    const inc = await prisma.incidente.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId },
      include: {
        ...INCIDENTE_INCLUDE,
        providencias: { include: { responsavel: { select: { id: true, nome: true } } }, orderBy: { data: 'asc' } }
      }
    });
    if (!inc) return res.status(404).json({ erro: 'Incidente não encontrado' });
    res.json(comPrazo(inc));
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar incidente' });
  }
});

router.post('/incidentes', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    const { titulo, dataOcorrencia, tipoIncidente, dadosAfetados, qtdTitulares, descricao, planoAcao, responsavelId, severidade, tipoRegistro } = req.body;
    if (!titulo || !dataOcorrencia || !tipoIncidente || !descricao) {
      return res.status(400).json({ erro: 'titulo, dataOcorrencia, tipoIncidente e descricao são obrigatórios' });
    }
    const erroCls = erroClassificacao({ severidade, tipoRegistro });
    if (erroCls) return res.status(400).json({ erro: erroCls });
    const datas = lerDatasIncidente(req.body);
    if (datas.erro) return res.status(400).json({ erro: datas.erro });
    if (!(await responsavelValido(prisma, responsavelId, req.usuario.organizacaoId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }
    const inc = await prisma.$transaction(async (tx) => {
      const criado = await tx.incidente.create({
        data: {
          organizacaoId: req.usuario.organizacaoId,
          titulo, tipoIncidente, descricao,
          ...datas.data,
          dadosAfetados: normalizarCategorias(dadosAfetados),
          qtdTitulares: qtdTitulares || 0,
          planoAcao: planoAcao || null,
          responsavelId: responsavelId || null,
          severidade: severidade || null,
          tipoRegistro: tipoRegistro || 'REAL',
          autorId: req.usuario.id
        },
        include: INCIDENTE_INCLUDE
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'INCIDENTE', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null, depois: criado
      });
      return criado;
    });
    res.status(201).json(comPrazo(inc));
  } catch (err) {
    console.error('[POST /repositorio/incidentes]', err);
    res.status(500).json({ erro: 'Erro ao registrar incidente' });
  }
});

router.put('/incidentes/:id', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    const existente = await prisma.incidente.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Incidente não encontrado' });

    const { titulo, status, tipoIncidente, dadosAfetados, qtdTitulares, descricao, planoAcao, notificadoANPD, responsavelId, severidade, tipoRegistro } = req.body;
    const erroCls = erroClassificacao({ severidade, tipoRegistro });
    if (erroCls) return res.status(400).json({ erro: erroCls });
    const datas = lerDatasIncidente(req.body);
    if (datas.erro) return res.status(400).json({ erro: datas.erro });
    if (datas.data.dataOcorrencia === null) return res.status(400).json({ erro: 'A data de ocorrência é obrigatória' });
    if (responsavelId !== undefined && !(await responsavelValido(prisma, responsavelId, req.usuario.organizacaoId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }
    const inc = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.incidente.update({
        where: { id: req.params.id },
        data: {
          ...(titulo !== undefined && { titulo }),
          ...(status !== undefined && { status }),
          ...(tipoIncidente !== undefined && { tipoIncidente }),
          ...(dadosAfetados !== undefined && { dadosAfetados: normalizarCategorias(dadosAfetados) }),
          ...(qtdTitulares !== undefined && { qtdTitulares }),
          ...(descricao !== undefined && { descricao }),
          ...(planoAcao !== undefined && { planoAcao }),
          ...(notificadoANPD !== undefined && datas.data.dataComunicacaoANPD === undefined && { notificadoANPD }),
          ...datas.data,
          ...(responsavelId !== undefined && { responsavelId: responsavelId || null }),
          ...(severidade !== undefined && { severidade: severidade || null }),
          ...(tipoRegistro !== undefined && { tipoRegistro })
        },
        include: INCIDENTE_INCLUDE
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'INCIDENTE', registroId: req.params.id,
        acao: 'EDITAR', usuarioId: req.usuario.id, antes: existente, depois: atualizado
      });
      return atualizado;
    });
    res.json(comPrazo(inc));
  } catch (err) {
    console.error('[PUT /repositorio/incidentes/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar incidente' });
  }
});

// POST /repositorio/incidentes/:id/providencias { descricao, data, responsavelId }
router.post('/incidentes/:id/providencias', async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    const orgId = req.usuario.organizacaoId;
    const inc = await prisma.incidente.findFirst({ where: { id: req.params.id, organizacaoId: orgId } });
    if (!inc) return res.status(404).json({ erro: 'Incidente não encontrado' });
    const { descricao, data, responsavelId } = req.body || {};
    const desc = typeof descricao === 'string' ? descricao.trim() : '';
    if (!desc) return res.status(400).json({ erro: 'Descreva a providência' });
    const quando = data ? dataPura(data) : hojeSP();
    if (!quando) return res.status(400).json({ erro: 'Data inválida (use AAAA-MM-DD)' });
    if (!(await responsavelValido(prisma, responsavelId, orgId))) {
      return res.status(400).json({ erro: 'Responsável inválido' });
    }
    const prov = await prisma.$transaction(async (tx) => {
      const criada = await tx.providenciaIncidente.create({
        data: {
          organizacaoId: orgId, incidenteId: inc.id, descricao: desc.slice(0, 2000), data: quando,
          responsavelId: responsavelId || null, criadoPorId: req.usuario.id
        },
        include: { responsavel: { select: { id: true, nome: true } } }
      });
      await registrarHistorico(tx, {
        organizacaoId: orgId, entidade: 'INCIDENTE', registroId: inc.id, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { providencia: { antes: null, depois: resumoProvidencia(criada) } }
      });
      return criada;
    });
    res.status(201).json(prov);
  } catch (err) {
    console.error('[POST /repositorio/incidentes/:id/providencias]', err);
    res.status(500).json({ erro: 'Erro ao registrar providência' });
  }
});

module.exports = router;
