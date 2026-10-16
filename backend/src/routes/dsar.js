const express = require('express');
const crypto = require('crypto');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authUsuario } = require('../middlewares/authUsuario');
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
const { registrarHistorico } = require('../services/historico');
const { preencherModelo } = require('../services/modeloResposta');
const { dataPura, fmtData, fmtDataHora, fmtDiaSP, hojeSP } = require('../services/datas');
const R = require('../services/rotulos');
const { responderExport } = require('../services/exportadores');

const router = express.Router();

// Campos da solicitacao que entram no HistoricoRegistro (titularNome/
// Email/Cpf saem como "[omitido]" — ver services/historico.js).
function paraHistorico(s) {
  if (!s) return null;
  const { evidencias, _count, ...resto } = s;
  return resto;
}
const prisma = new PrismaClient();

const TIPOS_DIREITO = ['CONFIRMACAO', 'ACESSO', 'CORRECAO', 'ANONIMIZACAO', 'PORTABILIDADE', 'ELIMINACAO', 'INFORMACAO', 'INFORMACAO_NAO_CONSENTIR', 'REVOGACAO', 'OPOSICAO', 'PETICAO', 'OUTRO'];
// Verificacao manual de identidade (CODIGO_EMAIL e gravado so pelo canal publico)
const METODOS_IDENTIDADE = ['DOCUMENTO', 'CODIGO', 'OUTRO'];
const MEIOS_ENVIO = ['PESSOALMENTE', 'CORREIOS', 'TELEFONE', 'EMAIL_INSTITUCIONAL', 'OUTRO'];

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
  body('codigo').trim().matches(/^\d{6}$/).withMessage('Código deve ter 6 dígitos'),
  validar
];

// ---------- Middlewares ----------

// Auth compartilhado: rejeita tokens intermediarios de MFA (mfaPending/mfaSetup).
const authMiddleware = authUsuario;

const requireModulo = async (req, res, next) => {
  try {
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { modulosAtivos: true }
    });
    if (!org || !org.modulosAtivos.includes('dsar')) {
      return res.status(403).json({ erro: 'Módulo "dsar" não está ativo para sua organização.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar módulos' });
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
    res.status(500).json({ erro: 'Erro ao listar solicitações' });
  }
});

router.get('/solicitacoes/:id', authMiddleware, requireModulo, async (req, res) => {
  try {
    const sol = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId },
      include: { evidencias: true }
    });
    if (!sol) return res.status(404).json({ erro: 'Solicitação não encontrada' });
    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[GET /dsar/solicitacoes/:id]', err);
    res.status(500).json({ erro: 'Erro ao buscar solicitação' });
  }
});

router.post('/solicitacoes', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para criar solicitações' });
    }

    const { titularNome, titularEmail, titularCpf, tipoDireito, descricao } = req.body;
    if (!titularNome || !titularEmail || !tipoDireito || !descricao) {
      return res.status(400).json({ erro: 'titularNome, titularEmail, tipoDireito e descricao são obrigatórios' });
    }

    const protocolo = await gerarProtocolo(req.usuario.organizacaoId);
    const dataRecebimento = new Date();
    const dataLimite = new Date(dataRecebimento);
    dataLimite.setDate(dataLimite.getDate() + 15);

    const sol = await prisma.$transaction(async (tx) => {
      const criada = await tx.solicitacaoTitular.create({
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
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: criada.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null, depois: paraHistorico(criada)
      });
      return criada;
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
      orgNome: org?.nome || 'Organização'
    }).catch(e => console.error('[dsar] falha email confirmacao:', e.message));

    res.status(201).json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[POST /dsar/solicitacoes]', err);
    res.status(500).json({ erro: 'Erro ao criar solicitação' });
  }
});

router.put('/solicitacoes/:id', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (['AUDITOR', 'TREINANDO'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para editar solicitações' });
    }

    const existente = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Solicitação não encontrada' });

    const { status, responsavelId, descricao } = req.body;
    const sol = await prisma.$transaction(async (tx) => {
      const atualizada = await tx.solicitacaoTitular.update({
        where: { id: req.params.id },
        data: {
          ...(status !== undefined && { status }),
          ...(responsavelId !== undefined && { responsavelId }),
          ...(descricao !== undefined && { descricao })
        },
        include: { evidencias: true }
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: req.params.id,
        acao: 'EDITAR', usuarioId: req.usuario.id,
        antes: paraHistorico(existente), depois: paraHistorico(atualizada)
      });
      return atualizada;
    });

    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[PUT /dsar/solicitacoes/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar solicitação' });
  }
});

// Adiciona evidencia (imutavel — sem update/delete)
router.post('/solicitacoes/:id/evidencias', authMiddleware, requireModulo, async (req, res) => {
  try {
    const existente = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Solicitação não encontrada' });

    const { tipo, descricao, arquivoUrl } = req.body;
    if (!tipo || !descricao) {
      return res.status(400).json({ erro: 'tipo e descricao são obrigatórios' });
    }

    // Hash SHA-256 do conteudo para integridade
    const conteudoHash = descricao + (arquivoUrl || '') + new Date().toISOString();
    const hashSha256 = crypto.createHash('sha256').update(conteudoHash).digest('hex');

    const evidencia = await prisma.$transaction(async (tx) => {
      const criada = await tx.evidenciaDSAR.create({
        data: {
          solicitacaoId: req.params.id,
          tipo, descricao,
          arquivoUrl: arquivoUrl || null,
          hashSha256,
          autorId: req.usuario.id
        }
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: req.params.id,
        acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { evidencia: { antes: null, depois: `${tipo}: ${descricao}` } }
      });
      return criada;
    });

    res.status(201).json(evidencia);
  } catch (err) {
    console.error('[POST /dsar/solicitacoes/:id/evidencias]', err);
    res.status(500).json({ erro: 'Erro ao adicionar evidência' });
  }
});

// Responde a solicitacao (muda status para RESPONDIDA + envia email ao titular)
router.post('/solicitacoes/:id/responder', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem responder solicitações' });
    }

    const existente = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Solicitação não encontrada' });

    const { respostaTexto } = req.body;
    if (!respostaTexto) return res.status(400).json({ erro: 'respostaTexto é obrigatório' });

    const sol = await prisma.$transaction(async (tx) => {
      const respondida = await tx.solicitacaoTitular.update({
        where: { id: req.params.id },
        data: {
          status: 'RESPONDIDA',
          respostaTexto,
          dataResposta: new Date(),
          responsavelId: req.usuario.id
        },
        include: { evidencias: true }
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: req.params.id,
        acao: 'STATUS', usuarioId: req.usuario.id,
        antes: paraHistorico(existente), depois: paraHistorico(respondida)
      });
      return respondida;
    });

    // Envia a resposta por e-mail e registra se saiu (Etapa 6c). Sem SMTP
    // configurado (devMode) ou com falha: fica "não enviada por e-mail" e a
    // tela pede o registro do envio por outro meio.
    const org = await prisma.organizacao.findUnique({
      where: { id: req.usuario.organizacaoId },
      select: { nome: true }
    });
    let enviadoEm = null;
    try {
      const r = await Promise.race([
        enviarRespostaTitular({
          to: sol.titularEmail, titularNome: sol.titularNome, protocolo: sol.protocolo,
          respostaTexto, orgNome: org?.nome || 'Organização'
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 15000))
      ]);
      if (r && !r.devMode) enviadoEm = new Date();
    } catch (e) {
      console.error('[dsar] falha email resposta:', e.message);
    }
    let final = sol;
    if (enviadoEm) {
      final = await prisma.$transaction(async (tx) => {
        const u = await tx.solicitacaoTitular.update({ where: { id: sol.id }, data: { respostaEnviadaEmailEm: enviadoEm }, include: { evidencias: true } });
        await registrarHistorico(tx, {
          organizacaoId: req.usuario.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: sol.id, acao: 'EDITAR', usuarioId: req.usuario.id,
          diff: { envioResposta: { antes: null, depois: `Enviada por e-mail em ${fmtDataHora(enviadoEm)}` } }
        });
        return u;
      });
    }

    res.json(enriquecerSolicitacao(final));
  } catch (err) {
    console.error('[POST /dsar/solicitacoes/:id/responder]', err);
    res.status(500).json({ erro: 'Erro ao responder solicitação' });
  }
});

// POST /dsar/solicitacoes/:id/envio { meio, data, observacao } — registra
// o envio da resposta por outro meio (quando nao saiu por e-mail).
router.post('/solicitacoes/:id/envio', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO registram o envio' });
    }
    const existente = await prisma.solicitacaoTitular.findFirst({ where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId } });
    if (!existente) return res.status(404).json({ erro: 'Solicitação não encontrada' });
    if (!existente.dataResposta) return res.status(400).json({ erro: 'Registre a resposta antes do envio' });
    const { meio, data, observacao } = req.body || {};
    if (!MEIOS_ENVIO.includes(meio)) return res.status(400).json({ erro: 'Meio de envio inválido' });
    const quando = data ? dataPura(data) : hojeSP();
    if (!quando) return res.status(400).json({ erro: 'Data inválida (use AAAA-MM-DD)' });
    const obs = typeof observacao === 'string' ? observacao.trim().slice(0, 1000) : '';
    if (meio === 'OUTRO' && !obs) return res.status(400).json({ erro: 'Descreva o meio de envio na observação' });
    const sol = await prisma.$transaction(async (tx) => {
      const u = await tx.solicitacaoTitular.update({
        where: { id: existente.id },
        data: { respostaEnvioMeio: meio, respostaEnvioData: quando, respostaEnvioObservacao: obs || null },
        include: { evidencias: true }
      });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: existente.id, acao: 'EDITAR', usuarioId: req.usuario.id,
        diff: { envioResposta: { antes: null, depois: `${R.MEIO_ENVIO[meio]} em ${fmtData(quando)}${obs ? ' — ' + obs : ''}` } }
      });
      return u;
    });
    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[POST /dsar/solicitacoes/:id/envio]', err);
    res.status(500).json({ erro: 'Erro ao registrar envio' });
  }
});

// Verifica identidade do titular e inicia o prazo de 15 dias.
// Muda status de AGUARDANDO_VERIFICACAO para EM_ANALISE.
router.patch('/solicitacoes/:id/verificar-identidade', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem verificar identidade' });
    }

    const existente = await prisma.solicitacaoTitular.findFirst({
      where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId }
    });
    if (!existente) return res.status(404).json({ erro: 'Solicitação não encontrada' });

    if (['ENCERRADA', 'CANCELADA'].includes(existente.status)) {
      return res.status(400).json({ erro: 'Solicitação encerrada ou cancelada: não é possível registrar verificação' });
    }

    const { observacao } = req.body || {};
    const metodo = req.body?.metodo || 'DOCUMENTO';
    if (!METODOS_IDENTIDADE.includes(metodo)) return res.status(400).json({ erro: 'Método inválido (DOCUMENTO, CODIGO ou OUTRO)' });
    const obs = typeof observacao === 'string' ? observacao.trim().slice(0, 1000) : '';
    if (metodo === 'OUTRO' && !obs) return res.status(400).json({ erro: 'Descreva na observação como a identidade foi verificada' });
    const aguardando = existente.status === 'AGUARDANDO_VERIFICACAO';
    const agora = new Date();
    const dataLimite = new Date(agora);
    dataLimite.setDate(dataLimite.getDate() + 15);

    const descricaoEvidencia = `Identidade do titular verificada por ${R.METODO_IDENTIDADE[metodo]}${obs ? ': ' + obs : ''}`;
    const hashSha256 = crypto.createHash('sha256')
      .update(descricaoEvidencia + agora.toISOString())
      .digest('hex');

    const sol = await prisma.$transaction(async (tx) => {
      await tx.evidenciaDSAR.create({
        data: {
          solicitacaoId: req.params.id,
          tipo: 'VERIFICACAO_IDENTIDADE',
          descricao: descricaoEvidencia,
          hashSha256,
          autorId: req.usuario.id
        }
      });
      const verificada = await tx.solicitacaoTitular.update({
        where: { id: req.params.id },
        data: {
          identidadeVerificadaEm: agora, identidadeMetodo: metodo, identidadeObservacao: obs || null,
          ...(aguardando && { status: 'EM_ANALISE', dataLimite, responsavelId: req.usuario.id })
        },
        include: { evidencias: true }
      });
      const diff = {
        verificacaoIdentidade: { antes: null, depois: descricaoEvidencia },
        ...(aguardando && {
          status: { antes: existente.status, depois: 'EM_ANALISE' },
          dataLimite: { antes: existente.dataLimite ? existente.dataLimite.toISOString() : null, depois: dataLimite.toISOString() }
        })
      };
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: req.params.id,
        acao: 'STATUS', usuarioId: req.usuario.id, diff
      });
      return verificada;
    });

    res.json(enriquecerSolicitacao(sol));
  } catch (err) {
    console.error('[PATCH /dsar/solicitacoes/:id/verificar-identidade]', err);
    res.status(500).json({ erro: 'Erro ao verificar identidade' });
  }
});

// GET /dsar/export?formato=csv|json — contem dados pessoais dos titulares:
// so Gestor, DPO ou Auditor.
router.get('/export', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!['GESTOR', 'ENCARREGADO_LGPD', 'AUDITOR'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Apenas Gestor, DPO ou Auditor exportam solicitações de titulares' });
    }
    await responderExport(res, prisma, 'dsar', req.usuario.organizacaoId, req.query.formato);
  } catch (err) {
    console.error('[GET /dsar/export]', err);
    res.status(500).json({ erro: 'Erro ao exportar solicitações' });
  }
});

// ---------- Modelos de resposta (Etapa 3 PoC) ----------
// Leitura para todos com o modulo; escrita so Gestor/DPO.

function lerModelo(b, { parcial }) {
  const data = {};
  if (!parcial || b.tipoDireito !== undefined) {
    if (!TIPOS_DIREITO.includes(b.tipoDireito)) return { erro: 'Tipo de direito inválido' };
    data.tipoDireito = b.tipoDireito;
  }
  for (const [campo, max] of [['titulo', 200], ['conteudo', 20000]]) {
    if (!parcial || b[campo] !== undefined) {
      const v = typeof b[campo] === 'string' ? b[campo].trim() : '';
      if (!v) return { erro: `${campo === 'titulo' ? 'Título' : 'Conteúdo'} é obrigatório` };
      data[campo] = v.slice(0, max);
    }
  }
  if (b.padrao !== undefined) data.padrao = !!b.padrao;
  return { data };
}

const ehGestorOuDpo = req => ['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil);

// "conteudo" e ignorado pelo diff generico (pensado para arquivo/documento).
// O texto do modelo nao tem dado pessoal e precisa aparecer no historico.
function modeloParaHistorico(m) {
  if (!m) return null;
  const { conteudo, ...resto } = m;
  return { ...resto, texto: conteudo };
}

router.get('/modelos', authMiddleware, requireModulo, async (req, res) => {
  try {
    const where = { organizacaoId: req.usuario.organizacaoId };
    if (TIPOS_DIREITO.includes(req.query.tipoDireito)) where.tipoDireito = req.query.tipoDireito;
    const modelos = await prisma.modeloRespostaDSAR.findMany({ where, orderBy: [{ tipoDireito: 'asc' }, { titulo: 'asc' }] });
    res.json(modelos);
  } catch (err) {
    console.error('[GET /dsar/modelos]', err);
    res.status(500).json({ erro: 'Erro ao listar modelos' });
  }
});

router.post('/modelos', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem cadastrar modelos' });
    const lido = lerModelo(req.body || {}, { parcial: false });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const modelo = await prisma.$transaction(async (tx) => {
      const criado = await tx.modeloRespostaDSAR.create({ data: { ...lido.data, organizacaoId: req.usuario.organizacaoId } });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'MODELO_DSAR', registroId: criado.id,
        acao: 'CRIAR', usuarioId: req.usuario.id, antes: null, depois: modeloParaHistorico(criado)
      });
      return criado;
    });
    res.status(201).json(modelo);
  } catch (err) {
    console.error('[POST /dsar/modelos]', err);
    res.status(500).json({ erro: 'Erro ao criar modelo' });
  }
});

router.put('/modelos/:id', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem editar modelos' });
    const existente = await prisma.modeloRespostaDSAR.findFirst({ where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId } });
    if (!existente) return res.status(404).json({ erro: 'Modelo não encontrado' });
    const lido = lerModelo(req.body || {}, { parcial: true });
    if (lido.erro) return res.status(400).json({ erro: lido.erro });
    const modelo = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.modeloRespostaDSAR.update({ where: { id: existente.id }, data: lido.data });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'MODELO_DSAR', registroId: existente.id,
        acao: 'EDITAR', usuarioId: req.usuario.id, antes: modeloParaHistorico(existente), depois: modeloParaHistorico(atualizado)
      });
      return atualizado;
    });
    res.json(modelo);
  } catch (err) {
    console.error('[PUT /dsar/modelos/:id]', err);
    res.status(500).json({ erro: 'Erro ao atualizar modelo' });
  }
});

// Modelo e texto de apoio (nao e registro do titular): exclusao fisica,
// com o conteudo final preservado no historico.
router.delete('/modelos/:id', authMiddleware, requireModulo, async (req, res) => {
  try {
    if (!ehGestorOuDpo(req)) return res.status(403).json({ erro: 'Apenas Gestor ou DPO podem excluir modelos' });
    const existente = await prisma.modeloRespostaDSAR.findFirst({ where: { id: req.params.id, organizacaoId: req.usuario.organizacaoId } });
    if (!existente) return res.status(404).json({ erro: 'Modelo não encontrado' });
    await prisma.$transaction(async (tx) => {
      await tx.modeloRespostaDSAR.delete({ where: { id: existente.id } });
      await registrarHistorico(tx, {
        organizacaoId: req.usuario.organizacaoId, entidade: 'MODELO_DSAR', registroId: existente.id,
        acao: 'EXCLUIR', usuarioId: req.usuario.id, antes: modeloParaHistorico(existente), depois: null
      });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /dsar/modelos/:id]', err);
    res.status(500).json({ erro: 'Erro ao excluir modelo' });
  }
});

// GET /dsar/solicitacoes/:id/modelos/:modeloId/preenchido — texto do
// modelo com {nome_titular}, {protocolo} e {nome_organizacao} trocados.
router.get('/solicitacoes/:id/modelos/:modeloId/preenchido', authMiddleware, requireModulo, async (req, res) => {
  try {
    const orgId = req.usuario.organizacaoId;
    const [sol, modelo, org] = await Promise.all([
      prisma.solicitacaoTitular.findFirst({
        where: { id: req.params.id, organizacaoId: orgId },
        select: { titularNome: true, protocolo: true, dataRecebimento: true, evidencias: { select: { tipo: true, descricao: true, criadoEm: true }, orderBy: { criadoEm: 'asc' } } }
      }),
      prisma.modeloRespostaDSAR.findFirst({ where: { id: req.params.modeloId, organizacaoId: orgId } }),
      prisma.organizacao.findUnique({ where: { id: orgId }, select: { nome: true, encarregadoNome: true, encarregadoEmail: true, encarregadoTelefone: true } })
    ]);
    if (!sol || !modelo) return res.status(404).json({ erro: 'Solicitação ou modelo não encontrado' });
    const provs = (sol.evidencias || []).map(e => `- ${fmtDiaSP(e.criadoEm)}: ${e.descricao}`);
    res.json({
      texto: preencherModelo(modelo.conteudo, {
        nome_titular: sol.titularNome, protocolo: sol.protocolo, nome_organizacao: org?.nome,
        data_pedido: fmtDiaSP(sol.dataRecebimento), data_resposta: fmtDiaSP(new Date()),
        providencias: provs.length ? provs.join('\n') : '[nenhuma providência registrada — descreva o que foi feito]',
        encarregado_nome: org?.encarregadoNome || '[nome do encarregado]',
        encarregado_email: org?.encarregadoEmail || '[e-mail do encarregado]',
        encarregado_telefone: org?.encarregadoTelefone || '[telefone]'
      })
    });
  } catch (err) {
    console.error('[GET /dsar/solicitacoes/:id/modelos/:modeloId/preenchido]', err);
    res.status(500).json({ erro: 'Erro ao preencher modelo' });
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
    if (!slug) return res.status(400).json({ erro: 'Slug inválido' });
    const org = await prisma.organizacao.findUnique({
      where: { slug },
      select: { id: true, nome: true, municipio: true, logoBase64: true, ativo: true, modulosAtivos: true }
    });
    if (!org || !org.ativo) return res.status(404).json({ erro: 'Organização não encontrada' });
    if (!org.modulosAtivos.includes('dsar')) {
      return res.status(403).json({ erro: 'Este serviço não está disponível para esta organização' });
    }
    res.json({
      id: org.id,
      nome: org.nome,
      municipio: org.municipio,
      logoBase64: org.logoBase64
    });
  } catch (err) {
    console.error('[GET /dsar/publico/org/:slug]', err);
    res.status(500).json({ erro: 'Erro ao buscar organização' });
  }
});

// Passo 1: titular envia o formulario. Gera OTP e envia email.
// NAO cria SolicitacaoTitular ainda — so guarda dados em DsarOtp.
router.post('/publico/solicitar-otp', validadoresSolicitarOtp, async (req, res) => {
  try {
    const { organizacaoId, titularNome, titularEmail, titularCpf, tipoDireito, descricao } = req.body;
    if (!organizacaoId || !titularNome || !titularEmail || !tipoDireito || !descricao) {
      return res.status(400).json({ erro: 'organizacaoId, titularNome, titularEmail, tipoDireito e descricao são obrigatórios' });
    }

    const org = await prisma.organizacao.findUnique({
      where: { id: organizacaoId },
      select: { id: true, nome: true, ativo: true, modulosAtivos: true }
    });
    if (!org || !org.ativo) return res.status(404).json({ erro: 'Organização não encontrada' });
    if (!org.modulosAtivos.includes('dsar')) return res.status(403).json({ erro: 'Este serviço não está disponível para esta organização' });

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
      return res.status(502).json({
        erro: 'Não foi possível enviar o código por email. Tente novamente em instantes ou contate o suporte.'
      });
    }

    res.status(200).json({
      ok: true,
      mensagem: `Um código de verificação foi enviado para ${titularEmail}. O código expira em 10 minutos.`,
      expiraEm: otp.expiresAt
    });
  } catch (err) {
    console.error('[POST /dsar/publico/solicitar-otp]', err);
    res.status(500).json({ erro: 'Erro ao solicitar código de verificação' });
  }
});

// Passo 2: titular confirma OTP. Cria a solicitacao real.
router.post('/publico/confirmar-otp', validadoresConfirmarOtp, async (req, res) => {
  try {
    const { titularEmail, codigo } = req.body;
    if (!titularEmail || !codigo) {
      return res.status(400).json({ erro: 'titularEmail e codigo são obrigatórios' });
    }

    const otp = await validarOtpDSAR({ email: titularEmail, codigo: String(codigo).trim() });
    if (!otp) return res.status(400).json({ erro: 'Código inválido ou expirado' });

    const sol = await criarSolicitacaoApartirDeOtp(otp);

    // Historico sem usuario (canal publico). Falha aqui nao pode
    // derrubar a resposta ao titular — a solicitacao ja foi criada.
    registrarHistorico(prisma, {
      organizacaoId: sol.organizacaoId, entidade: 'SOLICITACAO_DSAR', registroId: sol.id,
      acao: 'CRIAR', usuarioId: null, antes: null, depois: paraHistorico(sol)
    }).catch(e => console.error('[dsar] falha historico canal publico:', e.message));

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
      orgNome: org?.nome || 'Organização'
    }).catch(e => console.error('[dsar] falha email confirmacao:', e.message));

    res.status(201).json({
      protocolo: sol.protocolo,
      dataLimite: sol.dataLimite,
      mensagem: `Sua solicitação foi registrada com o protocolo ${sol.protocolo}. O prazo para resposta é de 15 dias corridos.`
    });
  } catch (err) {
    console.error('[POST /dsar/publico/confirmar-otp]', err);
    res.status(500).json({ erro: 'Erro ao confirmar código' });
  }
});

// Pesquisa de satisfacao migrada para modulo proprio em 2026-05 (Fase 3).
// Endpoint mantido vivo retornando 410 Gone para sinalizar deprecacao
// ao frontend legado. Apos Fase 4 do migrate, considerar remover.
router.post('/publico/pesquisa', (req, res) => {
  res.status(410).json({
    erro: 'Este endpoint foi substituído. Use POST /pesquisa/publico/:slug.'
  });
});

// Rota legado — redireciona para o novo fluxo OTP
router.post('/publico/nova-solicitacao', async (req, res) => {
  res.status(410).json({
    erro: 'Este endpoint foi substituído. Use POST /dsar/publico/solicitar-otp e depois POST /dsar/publico/confirmar-otp.'
  });
});

module.exports = router;
