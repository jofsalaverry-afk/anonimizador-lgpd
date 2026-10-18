// Monta um express com os mesmos routers do server.js, mas sem
// listen/cron/rate limit, usando o Prisma falso em memoria.
process.env.JWT_SECRET = process.env.JWT_SECRET_TESTE || 'segredo-de-teste-local';
// Etapa 7a: testes nunca chamam servicos externos (IA, OCR), mesmo que a
// maquina tenha as chaves no ambiente.
delete process.env.ANTHROPIC_API_KEY;
for (const k of Object.keys(process.env)) if (/^AZURE/i.test(k)) delete process.env[k];

const { instalar } = require('./fakePrisma');
const db = instalar();

const express = require('express');
const jwt = require('jsonwebtoken');

function criarApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/auth', require('../../src/routes/auth'));
  app.use('/perfil', require('../../src/routes/perfil'));
  app.use('/documents', require('../../src/routes/documents'));
  app.use('/ropa', require('../../src/routes/ropa'));
  app.use('/dsar', require('../../src/routes/dsar'));
  app.use('/pesquisa', require('../../src/routes/pesquisa'));
  app.use('/repositorio', require('../../src/routes/repositorio'));
  app.use('/conformidade', require('../../src/routes/conformidade'));
  app.use('/treinamento', require('../../src/routes/treinamento'));
  app.use('/anexos', require('../../src/routes/anexos'));
  app.use('/historico', require('../../src/routes/historico'));
  app.use('/usuarios', require('../../src/routes/usuarios'));
  app.use('/setores', require('../../src/routes/setores'));
  app.use('/inventario', require('../../src/routes/inventario'));
  app.use('/terceiros', require('../../src/routes/terceiros'));
  app.use('/certificado', require('../../src/routes/certificadoPublico'));
  app.use('/indicadores', require('../../src/routes/indicadores'));
  app.use('/relatorios', require('../../src/routes/relatorios'));
  app.use('/portabilidade', require('../../src/routes/portabilidade'));
  app.use('/admin', require('../../src/routes/admin'));
  app.use('/gerador', require('../../src/routes/gerador'));
  app.use('/organizacao', require('../../src/routes/organizacao'));
  app.use('/transparencia', require('../../src/routes/transparencia'));
  return app;
}

// Sobe o app numa porta efemera e devolve { base, fechar }.
function subir() {
  return new Promise(resolve => {
    const srv = criarApp().listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${srv.address().port}`;
      resolve({ base, fechar: () => new Promise(r => srv.close(r)) });
    });
  });
}

const TODOS_MODULOS = ['anonimizador', 'ropa', 'dsar', 'repositorio', 'treinamento', 'checklist', 'pesquisa', 'inventario', 'terceiros'];

async function semear() {
  db.__limpar();
  const orgA = await db.organizacao.create({ data: { nome: 'Câmara A', cnpj: '1', ativo: true, plano: 'basico', modulosAtivos: TODOS_MODULOS, mfaObrigatorio: false } });
  const orgB = await db.organizacao.create({ data: { nome: 'Câmara B', cnpj: '2', ativo: true, plano: 'basico', modulosAtivos: TODOS_MODULOS, mfaObrigatorio: false } });
  const novoUsuario = (org, nome, perfil) => db.usuario.create({
    data: { email: `${nome.toLowerCase().replace(/\s/g, '')}@teste.local`, senhaHash: 'x', nome, perfil, ativo: true, mfaAtivo: false, deletedAt: null, organizacaoId: org.id }
  });
  const gestorA = await novoUsuario(orgA, 'Gestora A', 'GESTOR');
  const dpoA = await novoUsuario(orgA, 'DPO A', 'ENCARREGADO_LGPD');
  const auditorA = await novoUsuario(orgA, 'Auditor A', 'AUDITOR');
  const gestorB = await novoUsuario(orgB, 'Gestor B', 'GESTOR');
  const tratamentoA = await db.tratamento.create({
    data: { organizacaoId: orgA.id, nome: 'Folha de pagamento', finalidade: 'Pagar servidores', baseLegal: 'OBRIGACAO_LEGAL', categoriasDados: ['nome'], categoriasTitulares: ['servidores'], ativo: true }
  });
  const incidenteA = await db.incidente.create({
    data: { organizacaoId: orgA.id, titulo: 'E-mail enviado ao destinatário errado', dataOcorrencia: new Date('2026-10-01'), tipoIncidente: 'VAZAMENTO', dadosAfetados: ['nome'], qtdTitulares: 1, notificadoANPD: false, status: 'ABERTO', descricao: 'Teste', planoAcao: null, autorId: null, responsavelId: null }
  });
  return { orgA, orgB, gestorA, dpoA, auditorA, gestorB, tratamentoA, incidenteA };
}

function tokenDe(usuario, extra = {}) {
  return jwt.sign({ id: usuario.id, email: usuario.email, nome: usuario.nome, perfil: usuario.perfil, organizacaoId: usuario.organizacaoId, ...extra }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

module.exports = { db, subir, semear, tokenDe };
