// Teste de fumaca contra uma API real (ambiente poc/staging).
//
// Uso (dentro de backend/):
//   FUMACA_API=https://... FUMACA_ADMIN_EMAIL=... FUMACA_ADMIN_SENHA=... \
//   FUMACA_SAIDA=<pasta para PDFs e credenciais> node tools/fumaca-poc.js
//
// Cria (ou reaproveita) a organizacao "Camara Demo Staging", usuarios dos
// 5 perfis, liga todos os modulos e chama leitura e escrita de cada modulo
// novo. Imprime uma tabela rota | status | resultado. NUNCA rode contra
// producao: cria dados de teste.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
// Gabarito do questionario: o mesmo arquivo do commit em teste (a API nunca o expoe)
const TRILHAS = require('../src/data/trilhasTreinamento');
const gabarito = (trilhaId, moduloId) => TRILHAS.find(t => t.id === trilhaId).modulos.find(m => m.moduloId === moduloId).quiz.map(q => q.correta);

const API = (process.env.FUMACA_API || '').replace(/\/$/, '');
const SAIDA = process.env.FUMACA_SAIDA || path.join(__dirname, 'fumaca-saida');
if (!API || !process.env.FUMACA_ADMIN_EMAIL || !process.env.FUMACA_ADMIN_SENHA) {
  console.error('Defina FUMACA_API, FUMACA_ADMIN_EMAIL e FUMACA_ADMIN_SENHA');
  process.exit(2);
}
fs.mkdirSync(SAIDA, { recursive: true });
const ARQ_CRED = path.join(SAIDA, 'credenciais-teste.json');

const CNPJ = '00.000.000/0001-91';
const TODOS_MODULOS = ['anonimizador', 'ropa', 'dsar', 'repositorio', 'treinamento', 'checklist', 'pesquisa', 'inventario', 'terceiros'];
const linhas = [];
const ctx = {};
// dia de hoje em Sao Paulo (AAAA-MM-DD)
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const AMANHA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));

async function req(metodo, rota, { token, body, form, binario } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${rota}`, { method: metodo, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  if (!binario) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* nao-JSON */ } }
  return { status: r.status, json, buf, tipo: r.headers.get('content-type') || '' };
}

// Registra uma checagem. esperado: numero ou lista; validar(r) opcional
async function passo(modulo, descricao, metodo, rota, opts = {}, esperado = 200, validar) {
  let r;
  try {
    r = await req(metodo, rota, opts);
  } catch (e) {
    linhas.push({ modulo, descricao, metodo, rota, status: 'ERRO', ok: false, nota: e.message });
    return null;
  }
  const esperados = [].concat(esperado);
  let ok = esperados.includes(r.status);
  let nota = ok ? '' : (r.json?.erro || `esperado ${esperados.join('/')}`);
  if (ok && validar) {
    try {
      const v = validar(r);
      if (v !== true) { ok = false; nota = v || 'validação falhou'; }
    } catch (e) { ok = false; nota = e.message; }
  }
  linhas.push({ modulo, descricao, metodo, rota: rota.replace(/[a-z0-9]{20,}/g, ':id'), status: r.status, ok, nota });
  return r;
}

const pdf = b => b.subarray(0, 5).toString() === '%PDF-' || 'não é PDF';
const zip = b => (b[0] === 0x50 && b[1] === 0x4b) || 'não é ZIP/DOCX';

async function main() {
  const cred = fs.existsSync(ARQ_CRED) ? JSON.parse(fs.readFileSync(ARQ_CRED, 'utf8')) : {};

  // ---------- Admin: organizacao, modulos, usuarios ----------
  const adm = await passo('Admin', 'login do admin', 'POST', '/admin/login', { body: { email: process.env.FUMACA_ADMIN_EMAIL, senha: process.env.FUMACA_ADMIN_SENHA } });
  ctx.admin = adm?.json?.token;
  if (!ctx.admin) throw new Error('sem token de admin — confira as credenciais');
  const orgs = await passo('Admin', 'listar organizações', 'GET', '/admin/camaras', { token: ctx.admin });
  let org = (orgs?.json || []).find(o => o.cnpj === CNPJ);
  if (!org) {
    cred.GESTOR = { email: 'gestor@demo-staging.local', senha: 'Demo-' + crypto.randomBytes(9).toString('base64url') };
    const c = await passo('Admin', 'criar organização (já com slug)', 'POST', '/admin/camaras', {
      token: ctx.admin, body: { nome: 'Camara Demo Staging', cnpj: CNPJ, nomeGestor: 'Gestora de Teste', email: cred.GESTOR.email, senha: cred.GESTOR.senha }
    }, 201, r => !!r.json.slug || 'sem slug');
    org = { id: c.json.id, slug: c.json.slug };
  } else {
    linhas.push({ modulo: 'Admin', descricao: 'organização já existia (reaproveitada)', metodo: '-', rota: '-', status: '-', ok: true, nota: '' });
  }
  ctx.org = org;
  await passo('Admin', 'ligar todos os módulos', 'PATCH', `/admin/camaras/${org.id}/modulos`, { token: ctx.admin, body: { modulosAtivos: TODOS_MODULOS } });
  await passo('Admin', 'garantir MFA obrigatório desligado', 'PATCH', `/admin/camaras/${org.id}/mfa-obrigatorio`, { token: ctx.admin, body: { mfaObrigatorio: false } });

  for (const perfil of ['ENCARREGADO_LGPD', 'OPERADOR', 'AUDITOR', 'TREINANDO']) {
    if (cred[perfil]) continue;
    cred[perfil] = { email: `${perfil.toLowerCase().replace('_lgpd', '')}@demo-staging.local`, senha: 'Demo-' + crypto.randomBytes(9).toString('base64url') };
    await passo('Admin', `criar usuário ${perfil}`, 'POST', `/admin/camaras/${org.id}/usuarios`, {
      token: ctx.admin, body: { email: cred[perfil].email, nome: `Usuário ${perfil}`, senha: cred[perfil].senha, perfil }
    }, 201);
  }
  fs.writeFileSync(ARQ_CRED, JSON.stringify(cred, null, 2));

  ctx.t = {};
  for (const perfil of ['GESTOR', 'ENCARREGADO_LGPD', 'OPERADOR', 'AUDITOR', 'TREINANDO']) {
    const r = await passo('Login', `login ${perfil}`, 'POST', '/auth/login', { body: cred[perfil] }, 200,
      x => (!!x.json.token || !!x.json.mfaPendente) || 'sem token');
    ctx.t[perfil] = r?.json?.token;
    if (r?.json?.mfaPendente && cred[perfil].mfaSecret) {
      const v = await passo('Login', `MFA ${perfil}`, 'POST', '/auth/mfa/verificar', {
        body: { tempToken: r.json.tempToken, codigo: speakeasy.totp({ secret: cred[perfil].mfaSecret, encoding: 'base32' }) }
      });
      ctx.t[perfil] = v?.json?.token;
    }
  }
  const G = ctx.t.GESTOR, D = ctx.t.ENCARREGADO_LGPD;

  // ---------- Encarregado, portal, FAQ, setores ----------
  await passo('Portal', 'dados do encarregado', 'PUT', '/organizacao/dados', { token: G, body: {
    encarregadoNome: 'Encarregada de Teste', encarregadoEmail: 'lgpd@demo-staging.local', encarregadoTelefone: '(51) 0000-0000',
    enderecoSede: 'Rua de Teste, 100', municipio: 'Cidade Demo', uf: 'RS'
  } });
  await passo('Portal', 'FAQ personalizado', 'PUT', '/organizacao/faq', { token: G, body: { faq: [{ pergunta: 'Pergunta de teste?', resposta: 'Resposta de teste.' }] } });
  await passo('Portal', 'trecho HTML (sem script)', 'GET', '/organizacao/trecho-portal', { token: G }, 200, r => !/<script/i.test(r.json.html) || 'tem script');
  const setor = await passo('Setores', 'criar setor', 'POST', '/setores', { token: G, body: { nome: `Setor ${Date.now()}` } }, 201);

  // ---------- Inventario, terceiros, ROPA ----------
  const sis = await passo('Inventário', 'criar sistema', 'POST', '/inventario/sistemas', { token: G, body: {
    nome: `Sistema de Protocolo ${Date.now()}`, tipo: 'APLICACAO', finalidade: 'Protocolo', tipoHospedagem: 'NUVEM', paisHospedagem: 'Brasil', regiaoHospedagem: 'São Paulo'
  } }, 201);
  await passo('Inventário', 'listar sistemas', 'GET', '/inventario/sistemas', { token: G });
  await passo('Inventário', 'exportar CSV', 'GET', '/inventario/sistemas/export?formato=csv', { token: G, binario: true });
  await passo('Permissões', 'AUDITOR não cria sistema (403 esperado)', 'POST', '/inventario/sistemas', { token: ctx.t.AUDITOR, body: { nome: 'x', tipo: 'OUTRO' } }, 403);

  const terc = await passo('Terceiros', 'criar terceiro crítico', 'POST', '/terceiros', { token: G, body: {
    razaoSocial: 'Fornecedor Demo Ltda', cnpj: '00.000.000/0002-72', descricaoServico: 'hospedagem do sistema de protocolo', contratoVigente: true, contratoCritico: true
  } }, 201);
  const q = await req('GET', '/terceiros/questionario', { token: G });
  await passo('Terceiros', 'responder questionário', 'PUT', `/terceiros/${terc?.json?.id}/questionario`, { token: G, body: {
    respostas: q.json.blocos.flatMap(b => b.perguntas.map(p => ({ perguntaId: p.id, resposta: 'SIM' })))
  } }, 200, r => !!r.json.risco || 'sem risco calculado');
  await passo('Terceiros', 'criar ação do plano', 'POST', `/terceiros/${terc?.json?.id}/acoes`, { token: G, body: { descricao: 'Assinar aditivo LGPD', prazo: '2026-12-31' } }, 201);
  await passo('Terceiros', 'detalhe do terceiro', 'GET', `/terceiros/${terc?.json?.id}`, { token: G });
  await passo('Terceiros', 'exportar JSON', 'GET', '/terceiros/export?formato=json', { token: G });

  const me = await req('GET', '/auth/me', { token: D });
  const trat = await passo('ROPA', 'criar tratamento completo', 'POST', '/ropa/tratamentos', { token: G, body: {
    nome: `Atendimento ao cidadão ${Date.now()}`, finalidade: 'Registrar e responder protocolos', baseLegal: 'OBRIGACAO_LEGAL',
    categoriasDados: ['Nome', 'E-mail'], categoriasTitulares: ['Cidadaos'], retencaoDias: 1825, formaDescarte: 'Exclusão definitiva',
    responsavelId: me.json?.id, setorId: setor?.json?.id, sistemaIds: [sis?.json?.id], outrosMeios: 'Fichas em papel',
    compartilhamentos: [{ terceiroId: terc?.json?.id, terceiroNome: '', finalidadeCompartilhamento: 'Hospedagem', paisDestino: 'Brasil' }]
  } }, 201);
  await passo('ROPA', 'lista com "mapeado"', 'GET', '/ropa/tratamentos', { token: G }, 200,
    r => r.json.some(t => t.id === trat?.json?.id && t.mapeado) || 'tratamento completo não ficou mapeado');

  // ---------- Bases legais (Etapa 6b) ----------
  const sens = await passo('Bases legais', 'tratamento com dado sensível sem art. 11', 'POST', '/ropa/tratamentos', { token: G, body: {
    nome: `Junta médica ${Date.now()}`, finalidade: 'Perícias de servidores', baseLegal: 'OBRIGACAO_LEGAL', categoriasDados: ['Nome', 'Saúde'],
    categoriasTitulares: ['Servidores'], retencaoDias: 1825, responsavelId: me.json?.id, setorId: setor?.json?.id, outrosMeios: 'Prontuário em papel'
  } }, 201);
  await passo('Bases legais', 'sem art. 11 não conta como mapeado', 'GET', '/ropa/tratamentos', { token: G }, 200,
    r => (r.json.find(t => t.id === sens?.json?.id)?.mapeado === false) || 'deveria estar não mapeado');
  await passo('Bases legais', 'art. 7 no campo do art. 11 é recusado (400)', 'PUT', `/ropa/tratamentos/${sens?.json?.id}`, { token: G, body: { baseLegalSensivel: 'OBRIGACAO_LEGAL' } }, 400);
  await passo('Bases legais', 'informar art. 11, II, a', 'PUT', `/ropa/tratamentos/${sens?.json?.id}`, { token: G, body: { baseLegalSensivel: 'SENSIVEL_OBRIGACAO_LEGAL' } });
  await passo('Bases legais', 'com art. 11 passa a mapeado', 'GET', '/ropa/tratamentos', { token: G }, 200,
    r => (r.json.find(t => t.id === sens?.json?.id)?.mapeado === true) || 'deveria estar mapeado');
  await passo('Bases legais', 'CSV com rótulo "Art. 7º, II — ..."', 'GET', '/ropa/export?formato=csv', { token: G, binario: true }, 200,
    r => (r.buf.toString('utf8').includes('Art. 7º, II — Cumprimento de obrigação legal') && !/,OBRIGACAO_LEGAL,/.test(r.buf.toString('utf8'))) || 'código cru no CSV');
  await passo('Histórico', 'nome + perfil e texto da pergunta', 'GET', `/historico?entidade=TERCEIRO&registroId=${terc?.json?.id}`, { token: G }, 200,
    r => (Object.values(r.json.perfis || {}).includes('GESTOR') && Object.values(r.json.rotulosCampos || {}).some(t => t.includes('art. 19 da LGPD'))) || 'sem perfil ou sem texto da pergunta');

  // ---------- Anexos e historico ----------
  const fd = new FormData();
  fd.append('entidade', 'TRATAMENTO');
  fd.append('registroId', trat?.json?.id);
  fd.append('arquivo', new Blob([Buffer.from('%PDF-1.4 evidencia de teste')], { type: 'application/pdf' }), 'evidencia.pdf');
  await passo('Anexos', 'enviar anexo', 'POST', '/anexos', { token: G, form: fd }, 201);
  await passo('Anexos', 'listar anexos', 'GET', `/anexos?entidade=TRATAMENTO&registroId=${trat?.json?.id}`, { token: G });
  await passo('Histórico', 'histórico do tratamento', 'GET', `/historico?entidade=TRATAMENTO&registroId=${trat?.json?.id}`, { token: G }, 200,
    r => r.json.itens.length >= 2 || 'histórico incompleto');

  // ---------- Descartes ----------
  await passo('Descartes', 'registrar descarte', 'POST', `/ropa/tratamentos/${trat?.json?.id}/descartes`, { token: G, body: {
    dataDescarte: new Date().toISOString().slice(0, 10), descricao: 'Fichas antigas', metodo: 'Trituração', quantidade: 10
  } }, 201);
  await passo('Descartes', 'listar descartes + retenção', 'GET', `/ropa/tratamentos/${trat?.json?.id}/descartes`, { token: G });
  await passo('Descartes', 'exportar CSV', 'GET', '/ropa/descartes/export?formato=csv', { token: G, binario: true });

  // ---------- Incidentes ----------
  const inc = await passo('Incidentes', 'registrar simulado', 'POST', '/repositorio/incidentes', { token: G, body: {
    titulo: 'Simulado anual', dataOcorrencia: HOJE, tipoIncidente: 'VAZAMENTO', descricao: 'Exercício', severidade: 'MEDIA', tipoRegistro: 'SIMULADO'
  } }, 201);
  await passo('Incidentes', 'registrar providência', 'POST', `/repositorio/incidentes/${inc?.json?.id}/providencias`, { token: G, body: { descricao: 'Senhas trocadas' } }, 201);
  await passo('Incidentes', 'listar (filtro simulado)', 'GET', '/repositorio/incidentes?tipoRegistro=SIMULADO', { token: G });
  await passo('Incidentes', 'simulado: sem prazo ANPD (coluna N/A)', 'GET', `/repositorio/incidentes/${inc?.json?.id}`, { token: G }, 200,
    r => r.json.prazoComunicacao === null || 'simulado com prazo');
  const real = await passo('Incidentes', 'real em 16/10 com ciência e risco SIM', 'POST', '/repositorio/incidentes', { token: G, body: {
    titulo: `Vazamento de planilha ${Date.now()}`, dataOcorrencia: '2026-10-16', dataCiencia: '2026-10-16', riscoRelevante: 'SIM',
    tipoIncidente: 'VAZAMENTO', descricao: 'Planilha enviada a destinatário errado', severidade: 'ALTA', tipoRegistro: 'REAL',
    dadosAfetados: ['Nome', 'Endereço', 'Saúde'], planoAcao: 'Conferir destinatário antes do envio'
  } }, 201, r => (r.json.dataOcorrencia === '2026-10-16T00:00:00.000Z' && r.json.prazoComunicacao?.prazo === '2026-10-21') || `data ${r.json.dataOcorrencia} / prazo ${r.json.prazoComunicacao?.prazo}`);
  await passo('Incidentes', 'data 16/10 sem deslocar no CSV', 'GET', '/repositorio/incidentes/export?formato=csv', { token: G, binario: true }, 200,
    r => (r.buf.toString('utf8').includes(';16/10/2026;') && r.buf.toString('utf8').includes('21/10/2026')) || 'data deslocada ou sem prazo');
  await passo('Incidentes', 'registrar comunicação ANPD/titulares', 'PUT', `/repositorio/incidentes/${real?.json?.id}`, { token: G, body: {
    dataComunicacaoANPD: HOJE, dataComunicacaoTitulares: HOJE
  } }, 200, r => (r.json.prazoComunicacao?.situacao === 'COMUNICADO' && r.json.notificadoANPD === true) || 'não marcou comunicado');
  await passo('Incidentes', 'risco inválido recusado (400)', 'POST', '/repositorio/incidentes', { token: G, body: {
    titulo: 'x', dataOcorrencia: '2026-10-16', tipoIncidente: 'PERDA', descricao: 'x', riscoRelevante: 'TALVEZ'
  } }, 400);
  await passo('Incidentes', 'alertas carregam (inclui comunicação ANPD)', 'GET', '/conformidade/alertas', { token: G });
  await passo('Incidentes', 'exportar CSV', 'GET', '/repositorio/incidentes/export?formato=csv', { token: G, binario: true });

  // ---------- DSAR ----------
  const sol = await passo('DSAR', 'criar solicitação', 'POST', '/dsar/solicitacoes', { token: G, body: {
    titularNome: 'Titular Fictício', titularEmail: 'titular@demo-staging.local', tipoDireito: 'ACESSO', descricao: 'Pedido de teste'
  } }, 201);
  const mod = await passo('DSAR', 'criar modelo de resposta', 'POST', '/dsar/modelos', { token: G, body: {
    tipoDireito: 'ACESSO', titulo: 'Acesso padrão', conteudo: 'Prezado(a) {nome_titular}, protocolo {protocolo}, {nome_organizacao}.'
  } }, 201);
  await passo('DSAR', 'usar modelo (variáveis trocadas)', 'GET', `/dsar/solicitacoes/${sol?.json?.id}/modelos/${mod?.json?.id}/preenchido`, { token: G }, 200,
    r => !/\{/.test(r.json.texto) || 'sobrou variável');
  const modelos = await passo('DSAR', '9 modelos padrão (MINUTA) da carga inicial', 'GET', '/dsar/modelos', { token: G }, 200,
    r => r.json.filter(m => m.padrao && m.titulo.startsWith('MINUTA')).length >= 9 || `só ${r.json.filter(m => m.padrao).length} padrão`);
  const mAcesso = (modelos?.json || []).find(m => m.padrao && m.tipoDireito === 'ACESSO');
  await passo('DSAR', 'identidade: registrar verificação (documento)', 'PATCH', `/dsar/solicitacoes/${sol?.json?.id}/verificar-identidade`, { token: G, body: { metodo: 'DOCUMENTO', observacao: 'RG conferido' } }, 200,
    r => (r.json.identidade?.verificada && r.json.identidade.metodo === 'DOCUMENTO') || 'sem identidade');
  await passo('DSAR', 'providência registrada', 'POST', `/dsar/solicitacoes/${sol?.json?.id}/evidencias`, { token: G, body: { tipo: 'Consulta', descricao: 'Dados levantados no protocolo' } }, 201);
  await passo('DSAR', 'modelo padrão de acesso preenchido (providências e encarregado)', 'GET', `/dsar/solicitacoes/${sol?.json?.id}/modelos/${mAcesso?.id}/preenchido`, { token: G }, 200,
    r => (r.json.texto.includes('Dados levantados no protocolo') && r.json.texto.includes('lgpd@demo-staging.local') && !/\{(providencias|protocolo|nome_titular)\}/.test(r.json.texto)) || 'variável não preenchida');
  await passo('DSAR', 'responder (sem SMTP: não sai por e-mail)', 'POST', `/dsar/solicitacoes/${sol?.json?.id}/responder`, { token: G, body: { respostaTexto: 'Segue a declaração.' } }, 200,
    r => r.json.respostaEnviadaEmailEm === null || 'marcou e-mail enviado sem SMTP');
  await passo('DSAR', 'registrar envio por outro meio', 'POST', `/dsar/solicitacoes/${sol?.json?.id}/envio`, { token: G, body: { meio: 'PESSOALMENTE', data: HOJE } }, 200,
    r => (r.json.respostaEnvioMeio === 'PESSOALMENTE' && r.json.respostaEnvioData === HOJE + 'T00:00:00.000Z') || 'envio não gravado');
  await passo('DSAR', 'exportar CSV', 'GET', '/dsar/export?formato=csv', { token: G, binario: true });

  // ---------- Checklist ----------
  const at = ctx.atividade = await passo('Checklist', 'criar atividade própria', 'POST', '/conformidade/atividades', { token: G, body: { titulo: 'Revisar contratos', prazo: '2026-12-15', responsavelId: me.json?.id } }, 201);
  await passo('Checklist', 'responder atividade', 'POST', `/conformidade/checklist/${at?.json?.id}/responder`, { token: G, body: { status: 'CONFORME', observacao: 'ok' } });
  await passo('Checklist', 'catálogo (20 itens) + atividade AP-nnn', 'GET', '/conformidade/checklist', { token: G }, 200, r => {
    const globais = r.json.filter(i => !i.organizacaoId);
    const ap = r.json.find(i => i.id === at?.json?.id);
    if (globais.length < 20) return `catálogo com ${globais.length} itens`;
    if (!/^AP-\d{3}$/.test(ap?.codigoExibicao || '')) return `código ${ap?.codigoExibicao}`;
    if (/50, I, g/.test(globais.find(i => i.codigo === 'GOV-05')?.fundamentoLegal || '')) return 'GOV-05 ainda cita o art. 50';
    return ap.resposta?.responsavelId === ap.responsavelId || 'dois responsáveis';
  });
  await passo('Checklist', 'score com itens respondidos', 'GET', '/conformidade/score', { token: G }, 200,
    r => (Number.isInteger(r.json.respondidos) && r.json.respondidos >= 1) || 'sem respondidos');
  await passo('Checklist', 'exportar JSON', 'GET', '/conformidade/checklist/export?formato=json', { token: G });

  // ---------- Treinamento ----------
  let cert = null;
  await passo('Treinamento', 'trilhas em texto + questionário, sem gabarito', 'GET', '/treinamento/trilhas', { token: D }, 200,
    r => (r.json.length === 2 && r.json.every(t => t.modulos.every(m => m.quiz.length === 3 && m.conteudo.length)) && !JSON.stringify(r.json).includes('"correta"')) || 'conteúdo/gabarito');
  const gab0 = gabarito('introducao-lgpd', 'o-que-e-lgpd');
  await passo('Treinamento', '1 acerto não conclui o módulo', 'POST', '/treinamento/progresso', { token: ctx.t.AUDITOR, body: {
    trilhaId: 'introducao-lgpd', moduloId: 'o-que-e-lgpd', respostas: gab0.map((c, i) => (i === 0 ? c : (c + 1) % 3))
  } }, 200, r => (r.json.tentativa.aprovado === false && r.json.tentativa.acertos === 1) || 'aprovou com 1 acerto');
  for (const m of ['o-que-e-lgpd', 'principios-lgpd']) {
    const r = await passo('Treinamento', `questionário ${m} (3 acertos)`, 'POST', '/treinamento/progresso', { token: D, body: { trilhaId: 'introducao-lgpd', moduloId: m, respostas: gabarito('introducao-lgpd', m) } }, 200,
      x => x.json.tentativa?.aprovado === true || 'não aprovou');
    cert = r?.json?.certificadoCodigo || cert;
  }
  await passo('Treinamento', 'certificado PDF', 'GET', `/treinamento/certificados/${cert}/pdf`, { token: D, binario: true }, 200, r => pdf(r.buf));
  await passo('Treinamento', 'verificação pública com câmara e carga 0h20min', 'GET', `/certificado/verificar/${cert}`, {}, 200,
    r => (r.json.valido === true && r.json.cargaHoraria === '0h20min' && r.json.organizacao?.nome === 'Camara Demo Staging') || 'dados incompletos');
  await passo('Treinamento', 'relatório: "X de Y servidores"', 'GET', '/treinamento/relatorio?resumo=1', { token: G }, 200,
    r => (r.json.resumo?.servidores >= 5 && r.json.resumo.concluiramObrigatoria >= 1 && r.json.resumo.trilhasTotal >= 10) || 'resumo incompleto');
  await passo('Treinamento', 'relatório CSV (Gestor)', 'GET', '/treinamento/relatorio?formato=csv', { token: G, binario: true });
  await passo('Treinamento', 'admin: link de material complementar', 'PUT', '/admin/treinamento/trilhas/introducao-lgpd/modulos/o-que-e-lgpd', { token: ctx.admin, body: { linkComplementar: 'https://www.gov.br/anpd/pt-br' } }, 200);
  await passo('Treinamento', 'link aparece no módulo', 'GET', '/treinamento/trilhas', { token: D }, 200,
    r => r.json[0].modulos[0].linkComplementar === 'https://www.gov.br/anpd/pt-br' || 'sem link');
  await passo('Permissões', 'TREINANDO acessa trilhas', 'GET', '/treinamento/trilhas', { token: ctx.t.TREINANDO });

  // ---------- Indicadores ----------
  await passo('Indicadores', 'painel', 'GET', '/indicadores', { token: G }, 200, r => r.json.indicadores.length === 5 || 'faltam indicadores');
  await passo('Indicadores', 'DSAR sem conclusões no mês = selo neutro', 'GET', '/indicadores', { token: G }, 200, r => {
    const d = r.json.indicadores.find(i => i.chave === 'DSAR');
    return d.total > 0 ? true : (d.status === 'SEM_DADOS' && d.ok === null) || `status ${d.status}`;
  });
  await passo('Indicadores', 'salvar metas', 'PUT', '/indicadores/metas', { token: G, body: { metas: { TREINAMENTOS: 70 } } });
  await passo('Indicadores', 'foto mensal sob demanda', 'POST', '/indicadores/snapshots', { token: G }, 201);
  await passo('Indicadores', 'exportar CSV', 'GET', '/indicadores/export?formato=csv', { token: G, binario: true });

  // ---------- Gerador de minutas ----------
  await passo('Minutas', 'listar modelos', 'GET', '/gerador/modelos', { token: G }, 200, r => r.json.length === 9 || 'não são 9 modelos');
  await passo('Minutas', 'prévia sem pendências', 'POST', '/gerador/modelos/politica-privacidade/previa', { token: G, body: {} }, 200,
    r => (r.json.pendencias.length === 0 && r.json.texto.includes('Art. 7º, II —')) || `pendências: ${r.json.pendencias.join('; ')} ou sem rótulo com artigo`);
  const ger = await passo('Minutas', 'gerar DOCX + PDF/A (Etapa 7b)', 'POST', '/gerador/modelos/politica-privacidade/gerar', { token: G, body: {} }, 201,
    r => (r.json.pdfa === true && r.json.documentos.map(d => d.formato).join('+') === 'DOCX+PDF/A') || `formatos ${r.json.documentos?.map(d => d.formato)} pdfa=${r.json.pdfa}`);
  for (const d of ger?.json?.documentos || []) {
    const b = await passo('Minutas', `baixar ${d.formato}`, 'GET', `/repositorio/documentos/${d.id}/download`, { token: G, binario: true }, 200,
      r => (d.formato.startsWith('PDF') ? (pdf(r.buf) === true && (d.formato !== 'PDF/A' || /pdfaid:part/.test(r.buf.toString('latin1'))) ? true : 'sem identificação PDF/A') : zip(r.buf)));
    if (b?.status === 200 && d.formato === 'PDF/A') fs.writeFileSync(path.join(SAIDA, 'documento-gerado-pdfa.pdf'), b.buf);
  }
  await passo('Minutas', 'aditivo com terceiro', 'POST', '/gerador/modelos/aditivo-lgpd/gerar', { token: G, body: { terceiroId: terc?.json?.id } }, 201);

  // ---------- Transparencia (publica) ----------
  await passo('Transparência', 'página pública', 'GET', `/transparencia/publico/${ctx.org.slug}`, {}, 200,
    r => (r.json.tratamentos.length > 0 && !JSON.stringify(r.json).includes('"responsavelId"')) || 'sem tratamentos ou com campo interno');
  await passo('Transparência', 'base legal com artigo (7 e 11)', 'GET', `/transparencia/publico/${ctx.org.slug}`, {}, 200,
    r => (r.json.tratamentos.every(t => t.baseLegal.startsWith('Art. 7º')) && r.json.tratamentos.some(t => (t.baseLegalSensivel || '').startsWith('Art. 11, II, a'))) || 'rótulo sem artigo');

  // ---------- Portabilidade ----------
  await passo('Portabilidade', 'pacote ZIP', 'GET', '/portabilidade/pacote', { token: G, binario: true }, 200, r => zip(r.buf));

  // ---------- PDF/A ----------
  const st = await passo('PDF/A', 'status do Ghostscript', 'GET', '/relatorios/pdfa/status', { token: G }, 200, r => r.json.disponivel === true || `indisponível (gs=${r.json.ghostscript}, icc=${r.json.icc})`);
  ctx.pdfaStatus = st?.json;
  for (const tipo of ['ropa', 'indicadores', 'incidentes', 'dsar']) {
    const r = await passo('PDF/A', `relatório ${tipo}`, 'GET', `/relatorios/${tipo}/pdfa`, { token: G, binario: true }, 200, x => pdf(x.buf));
    if (r?.status === 200) fs.writeFileSync(path.join(SAIDA, `relatorio-${tipo}-pdfa.pdf`), r.buf);
  }

  // ---------- Usuarios (gestao pela organizacao) ----------
  const lista = await passo('Usuários', 'listar (Gestor)', 'GET', '/usuarios/gestao', { token: G });
  const operador = (lista?.json || []).find(u => u.email === cred.OPERADOR.email);
  const treinando = (lista?.json || []).find(u => u.email === cred.TREINANDO.email);
  await passo('Usuários', 'trocar perfil OPERADOR→AUDITOR', 'PATCH', `/usuarios/${operador?.id}/perfil`, { token: G, body: { perfil: 'AUDITOR' } });
  await passo('Usuários', 'voltar perfil para OPERADOR', 'PATCH', `/usuarios/${operador?.id}/perfil`, { token: G, body: { perfil: 'OPERADOR' } });
  await passo('Usuários', 'desativar TREINANDO', 'PATCH', `/usuarios/${treinando?.id}/ativo`, { token: G, body: { ativo: false } });
  await passo('Usuários', 'TREINANDO desativado não entra (403)', 'POST', '/auth/login', { body: cred.TREINANDO }, 403);
  await passo('Usuários', 'reativar TREINANDO', 'PATCH', `/usuarios/${treinando?.id}/ativo`, { token: G, body: { ativo: true } });
  await passo('Usuários', 'OPERADOR não gerencia usuários (403)', 'GET', '/usuarios/gestao', { token: ctx.t.OPERADOR }, 403);
  const gestorU = (lista?.json || []).find(u => u.email === cred.GESTOR.email);
  await passo('Usuários', 'Gestor corrige o próprio nome', 'PATCH', `/usuarios/${gestorU?.id}/nome`, { token: G, body: { nome: 'Gestora de Teste' } }, 200, r => r.json.nome === 'Gestora de Teste' || 'nome não mudou');
  await passo('Usuários', 'admin corrige nome do AUDITOR', 'PATCH', `/admin/usuarios/${(lista?.json || []).find(u => u.email === cred.AUDITOR.email)?.id}/nome`, { token: ctx.admin, body: { nome: 'Auditora de Teste' } }, 200);

  // ---------- MFA obrigatorio (com o OPERADOR; Gestor fica sem MFA) ----------
  await passo('MFA', 'ligar MFA obrigatório', 'PATCH', `/admin/camaras/${org.id}/mfa-obrigatorio`, { token: ctx.admin, body: { mfaObrigatorio: true } });
  // Na 1a rodada o OPERADOR ainda nao tem autenticador (pede configuracao);
  // nas seguintes ja tem (pede o codigo). O nome do passo diz qual caso e.
  const jaConfigurado = !!cred.OPERADOR.mfaSecret;
  const l1 = await passo('MFA', jaConfigurado ? 'login com MFA obrigatório pede o código (autenticador já configurado)' : 'login sem autenticador pede configuração',
    'POST', '/auth/login', { body: cred.OPERADOR }, 200,
    r => (jaConfigurado ? r.json.mfaPendente === true : r.json.mfaSetupObrigatorio === true) || 'emitiu sessão sem MFA');
  if (l1?.json?.mfaSetupObrigatorio) {
    await passo('MFA', 'setupToken não abre módulo (401)', 'GET', '/ropa/tratamentos', { token: l1.json.setupToken }, 401);
    const cfg = await passo('MFA', 'configurar autenticador', 'POST', '/auth/mfa/configurar', { token: l1.json.setupToken, body: {} });
    cred.OPERADOR.mfaSecret = cfg?.json?.secret;
    fs.writeFileSync(ARQ_CRED, JSON.stringify(cred, null, 2));
    await passo('MFA', 'ativar com código TOTP → sessão', 'POST', '/auth/mfa/ativar', {
      token: l1.json.setupToken, body: { codigo: speakeasy.totp({ secret: cred.OPERADOR.mfaSecret, encoding: 'base32' }) }
    }, 200, r => !!r.json.token || 'sem sessão');
  }
  const l2 = await passo('MFA', 'próximo login pede código', 'POST', '/auth/login', { body: cred.OPERADOR }, 200, r => r.json.mfaPendente === true || 'não pediu código');
  let sessaoOp = null;
  if (l2?.json?.mfaPendente) {
    const v = await passo('MFA', 'verificar código', 'POST', '/auth/mfa/verificar', {
      body: { tempToken: l2.json.tempToken, codigo: speakeasy.totp({ secret: cred.OPERADOR.mfaSecret, encoding: 'base32' }) }
    }, 200, r => !!r.json.token || 'sem sessão');
    sessaoOp = v?.json?.token;
  }
  await passo('MFA', 'desligar MFA obrigatório (para o teste no navegador)', 'PATCH', `/admin/camaras/${org.id}/mfa-obrigatorio`, { token: ctx.admin, body: { mfaObrigatorio: false } });
  await passo('MFA', 'ligar/desligar "MFA obrigatório" no histórico da câmara', 'GET', `/historico?entidade=ORGANIZACAO&registroId=${org.id}`, { token: G }, 200,
    r => (r.json.itens.some(h => h.diff?.mfaObrigatorio?.depois === true) && r.json.itens.some(h => h.diff?.mfaObrigatorio?.depois === false)) || 'sem registro');

  // ---------- Etapa 6d: troca de autenticador, desativar, zerar ----------
  const totp = sec => speakeasy.totp({ secret: sec, encoding: 'base32' });
  if (sessaoOp) {
    await passo('MFA 6d', 'MFA ativo: configurar sem código é recusado (400)', 'POST', '/auth/mfa/configurar', { token: sessaoOp, body: {} }, 400);
    await passo('MFA 6d', 'MFA ativo: configurar com código errado é recusado (400)', 'POST', '/auth/mfa/configurar', { token: sessaoOp, body: { codigo: totp(cred.OPERADOR.mfaSecret) === '000000' ? '111111' : '000000' } }, 400);
    await passo('MFA 6d', 'Gestor não zera o próprio MFA (400)', 'POST', `/usuarios/${gestorU?.id}/mfa/zerar`, { token: G, body: { motivo: 'teste' } }, 400);
    await passo('MFA 6d', 'zerar sem motivo é recusado (400)', 'POST', `/usuarios/${operador?.id}/mfa/zerar`, { token: G, body: {} }, 400);
    await passo('MFA 6d', 'Gestor zera o MFA do OPERADOR (com motivo)', 'POST', `/usuarios/${operador?.id}/mfa/zerar`, { token: G, body: { motivo: 'fumaça: perdeu o celular' } }, 200,
      r => (r.json.mfaAtivo === false && /sessões/.test(r.json.mensagem)) || 'não zerou');
    await passo('MFA 6d', 'sessão antiga do OPERADOR foi encerrada (401)', 'GET', '/auth/me', { token: sessaoOp }, 401);
    await passo('MFA 6d', 'histórico: quem zerou e o motivo', 'GET', `/historico?entidade=USUARIO&registroId=${operador?.id}`, { token: G }, 200,
      r => (r.json.itens[0]?.diff?.motivo?.depois === 'fumaça: perdeu o celular' && r.json.itens[0].usuarioId === gestorU?.id) || 'sem motivo/autor');
    delete cred.OPERADOR.mfaSecret; // zerado: a proxima rodada configura de novo
    fs.writeFileSync(ARQ_CRED, JSON.stringify(cred, null, 2));
  }
  // AUDITOR: ativa, desativa com senha, ativa de novo e o Admin zera
  const audLogin = await req('POST', '/auth/login', { body: cred.AUDITOR });
  const tA = audLogin.json?.token;
  const cfgA = await passo('MFA 6d', 'AUDITOR: configurar autenticador', 'POST', '/auth/mfa/configurar', { token: tA, body: {} }, 200, r => !!r.json.secret || 'sem segredo');
  await passo('MFA 6d', 'AUDITOR: ativar', 'POST', '/auth/mfa/ativar', { token: tA, body: { codigo: totp(cfgA?.json?.secret) } });
  await passo('MFA 6d', 'desativar sem código nem senha: erro com mensagem (400)', 'PUT', '/auth/mfa/desativar', { token: tA, body: {} }, 400, r => !!r.json.erro || 'sem mensagem');
  await passo('MFA 6d', 'desativar com a senha', 'PUT', '/auth/mfa/desativar', { token: tA, body: { senha: cred.AUDITOR.senha } }, 200, r => r.json.mensagem === 'MFA desativado.' || 'sem mensagem');
  const cfgA2 = await passo('MFA 6d', 'AUDITOR: configurar de novo', 'POST', '/auth/mfa/configurar', { token: tA, body: {} });
  await passo('MFA 6d', 'AUDITOR: ativar de novo', 'POST', '/auth/mfa/ativar', { token: tA, body: { codigo: totp(cfgA2?.json?.secret) } });
  await passo('MFA 6d', 'Admin zera o MFA do AUDITOR (com motivo)', 'POST', `/admin/usuarios/${(lista?.json || []).find(u => u.email === cred.AUDITOR.email)?.id}/mfa/zerar`, { token: ctx.admin, body: { motivo: 'fumaça: zerar pelo admin' } }, 200,
    r => r.json.mfaAtivo === false || 'não zerou');
  await passo('MFA 6d', 'AUDITOR entra de novo sem código', 'POST', '/auth/login', { body: cred.AUDITOR }, 200, r => (!!r.json.token && !r.json.mfaPendente) || 'pediu código');

  // ---------- Etapa 7a ----------
  // Usuario novo por rodada (desativado no fim). Senhas so em memoria.
  const novo = { email: `novo7a-${crypto.randomBytes(4).toString('hex')}@demo-staging.local`, senha: 'Ini-' + crypto.randomBytes(9).toString('base64url') };
  const nova1 = 'Pes-' + crypto.randomBytes(9).toString('base64url');
  const nova2 = 'Pes-' + crypto.randomBytes(9).toString('base64url');
  await passo('Senha 7a', 'senha inicial com 9 caracteres é recusada (400)', 'POST', '/usuarios', { token: G, body: { nome: 'Pessoa Nova 7a', email: novo.email, senha: '123456789', perfil: 'OPERADOR' } }, 400, r => /10 caracteres/.test(r.json.erro) || 'mensagem sem o mínimo');
  const cri = await passo('Senha 7a', 'Gestor cria usuário (senha inicial ≥ 10)', 'POST', '/usuarios', { token: G, body: { nome: 'Pessoa Nova 7a', email: novo.email, senha: novo.senha, perfil: 'OPERADOR' } }, 201);
  const p1 = await passo('Senha 7a', '1º acesso: login não abre sessão, pede troca', 'POST', '/auth/login', { body: novo }, 200, r => (r.json.trocaSenhaObrigatoria === true && !r.json.token) || 'abriu sessão');
  await passo('Senha 7a', 'trocaToken não abre módulo (401)', 'GET', '/ropa/tratamentos', { token: p1?.json?.trocaToken }, 401);
  await passo('Senha 7a', '1º acesso: cria a senha pessoal', 'POST', '/auth/senha/primeiro-acesso', { body: { trocaToken: p1?.json?.trocaToken, novaSenha: nova1 } });
  const p2 = await passo('Senha 7a', 'entra com a senha pessoal', 'POST', '/auth/login', { body: { email: novo.email, senha: nova1 } }, 200, r => !!r.json.token || 'sem sessão');
  await passo('Senha 7a', 'senha inicial não entra mais (401)', 'POST', '/auth/login', { body: novo }, 401);
  const sNovo = p2?.json?.token;
  await passo('Senha 7a', 'trocar senha com a atual errada (400)', 'PUT', '/auth/senha', { token: sNovo, body: { senhaAtual: 'errada-errada-1', novaSenha: nova2 } }, 400);
  const tr = await passo('Senha 7a', 'trocar senha com a atual certa → sessão nova', 'PUT', '/auth/senha', { token: sNovo, body: { senhaAtual: nova1, novaSenha: nova2 } }, 200, r => !!r.json.token || 'sem sessão nova');
  await passo('Senha 7a', 'sessão anterior à troca foi encerrada (401)', 'GET', '/ropa/tratamentos', { token: sNovo }, 401);
  await passo('Senha 7a', 'histórico registra as trocas sem a senha', 'GET', `/historico?entidade=USUARIO&registroId=${cri?.json?.id}`, { token: G }, 200, r => {
    const txt = JSON.stringify(r.json);
    if (![novo.senha, nova1, nova2].every(x => !txt.includes(x))) return 'senha no histórico';
    return (/primeiro acesso/.test(txt) && /alterada pelo próprio usuário/.test(txt)) || 'sem registro da troca';
  });
  await passo('Sessão 7a', 'logout', 'POST', '/auth/logout', { token: tr?.json?.token, body: {} });
  await passo('Sessão 7a', 'token depois do logout não vale (401)', 'GET', '/ropa/tratamentos', { token: tr?.json?.token }, 401);
  const p3 = await req('POST', '/auth/login', { body: { email: novo.email, senha: nova2 } });
  await passo('Sessão 7a', 'Gestor desativa o usuário', 'PATCH', `/usuarios/${cri?.json?.id}/ativo`, { token: G, body: { ativo: false } });
  await passo('Sessão 7a', 'sessão do desativado cai na hora (401)', 'GET', '/ropa/tratamentos', { token: p3.json?.token }, 401);
  await passo('E-mail 7a', '"esqueci minha senha" sem SMTP no poc: 503, nunca "enviado"', 'POST', '/auth/senha/esqueci', { body: { email: cred.GESTOR.email } }, 503, r => !/enviad/i.test(r.json.erro) || 'disse enviado');
  await passo('E-mail 7a', 'canal público sem SMTP: 503 com contato, nunca "enviado"', 'POST', '/dsar/publico/solicitar-otp', {
    body: { organizacaoId: org.id, titularNome: 'Titular Fumaça', titularEmail: 'titular-fumaca@demo-staging.local', tipoDireito: 'ACESSO', descricao: 'Pedido de teste da fumaça' }
  }, 503, r => (r.json.envioIndisponivel === true && !/enviad/i.test(r.json.erro) && /encarregad|protocolo/.test(r.json.erro)) || 'mensagem inadequada');

  // JWT com alg "none" (sem assinatura) e CORS
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const semAssinatura = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: gestorU?.id, organizacaoId: org.id, perfil: 'GESTOR', sv: 0 })}.`;
  await passo('Endurecimento 7a', 'JWT sem assinatura (alg none) é recusado (401)', 'GET', '/ropa/tratamentos', { token: semAssinatura }, 401);
  for (const [origem, deve] of [['https://anonimizadorldpd.com', true], ['http://localhost:5173', false]]) {
    try {
      const r = await fetch(`${API}/auth/me`, { method: 'OPTIONS', headers: { Origin: origem, 'Access-Control-Request-Method': 'GET' } });
      const ok = (r.headers.get('access-control-allow-origin') === origem) === deve;
      linhas.push({ modulo: 'Endurecimento 7a', descricao: `CORS ${deve ? 'aceita' : 'recusa'} ${origem}${deve ? '' : ' (poc roda com NODE_ENV=production)'}`, metodo: 'OPTIONS', rota: '/auth/me', status: r.status, ok, nota: ok ? '' : 'cabeçalho inesperado' });
    } catch (e) { linhas.push({ modulo: 'Endurecimento 7a', descricao: `CORS ${origem}`, metodo: 'OPTIONS', rota: '/auth/me', status: 'ERRO', ok: false, nota: e.message }); }
  }
  await passo('Endurecimento 7a', 'evidência "javascript:" é recusada (400)', 'POST', `/conformidade/checklist/${ctx.atividade?.json?.id}/responder`, { token: G, body: { status: 'CONFORME', evidenciaUrl: 'javascript:alert(1)' } }, 400);
  await passo('Endurecimento 7a', 'evidência https é aceita', 'POST', `/conformidade/checklist/${ctx.atividade?.json?.id}/responder`, { token: G, body: { status: 'CONFORME', evidenciaUrl: 'https://anonimizadorldpd.com/evidencia' } });
  const formula = await passo('Endurecimento 7a', 'tratamento com nome iniciando por "="', 'POST', '/ropa/tratamentos', { token: G, body: { nome: '=1+1 fumaça 7a', finalidade: '@soma', baseLegal: 'OBRIGACAO_LEGAL' } }, 201);
  await passo('Endurecimento 7a', 'CSV da ROPA neutraliza a fórmula', 'GET', '/ropa/export?formato=csv', { token: G, binario: true }, 200, r => {
    const t = r.buf.toString('utf8');
    return (t.includes(`'=1+1 fumaça 7a;`) && t.includes(`;'@soma;`)) || 'fórmula sem apóstrofo';
  });
  if (formula?.json?.id) await req('DELETE', `/ropa/tratamentos/${formula.json.id}`, { token: G });
  const fdA = new FormData();
  const pdfAnexo = await new Promise(res => { const PDFDocument = require('pdfkit'); const d = new PDFDocument(); const p = []; d.on('data', b => p.push(b)); d.on('end', () => res(Buffer.concat(p))); d.text('anexo de teste'); d.end(); });
  fdA.append('arquivo', new Blob([pdfAnexo], { type: 'application/pdf' }), 'fatura\u202Egpj.pdf');
  fdA.append('entidade', 'CHECKLIST_ITEM');
  fdA.append('registroId', ctx.atividade?.json?.id || '');
  await passo('Endurecimento 7a', 'nome de anexo sem caractere de direção (U+202E)', 'POST', '/anexos', { token: G, form: fdA }, 201, r => (r.json.nomeArquivo === 'faturagpj.pdf') || `nome gravado: ${JSON.stringify(r.json.nomeArquivo)}`);

  // Anonimizador sem a chave da IA (poc nao tem a chave)
  const fdR = new FormData();
  fdR.append('arquivo', new Blob([Buffer.from('%PDF-1.4\nisto nao e um pdf')], { type: 'application/pdf' }), 'quebrado.pdf');
  await passo('Anonimizador 7a', 'PDF inválido: 400 amigável, sem pilha técnica', 'POST', '/documents/anonymize', { token: G, form: fdR }, 400, r => (/não é um PDF válido/.test(r.json.erro) && !('stack' in r.json)) || 'mensagem/pilha');
  const pdfOk = await new Promise(res => {
    const PDFDocument = require('pdfkit');
    const d = new PDFDocument(); const partes = [];
    d.on('data', b => partes.push(b)); d.on('end', () => res(Buffer.concat(partes)));
    d.fontSize(12).text('Declaro, Fulano de Tal, CPF 123.456.789-09, RG 12.345.678-9, telefone (51) 99999-8888, e-mail fulano@gmail.com.'); d.end();
  });
  const fdP = new FormData();
  fdP.append('arquivo', new Blob([pdfOk], { type: 'application/pdf' }), 'declaracao.pdf');
  await passo('Anonimizador 7a', 'sem IA: aviso diz o que tarja e não promete RG', 'POST', '/documents/anonymize', { token: G, form: fdP }, 200,
    r => (r.json.modoBasico === true && /apenas CPF, e-mail pessoal \(não institucional\) e telefone/.test(r.json.avisoIA) && /RG, endereço/.test(r.json.avisoIA) && /manualmente/.test(r.json.avisoIA)) || 'aviso inadequado');
  // Etapa 7c: PDF digitalizado (sem texto) com o OCR desligado — 422 com a mensagem clara
  const pdfImagem = await new Promise(res => { const PDFDocument = require('pdfkit'); const d = new PDFDocument(); const p = []; d.on('data', b => p.push(b)); d.on('end', () => res(Buffer.concat(p))); d.rect(50, 50, 400, 600).fill('#999999'); d.end(); });
  const fdS = new FormData();
  fdS.append('arquivo', new Blob([pdfImagem], { type: 'application/pdf' }), 'digitalizado.pdf');
  await passo('Anonimizador 7c', 'PDF digitalizado sem texto: 422 com mensagem clara (OCR desligado)', 'POST', '/documents/anonymize', { token: G, form: fdS }, 422,
    r => r.json.message === 'PDF digitalizado sem texto: não é possível processar; envie um PDF com texto selecionável.' || r.json.message);
  await passo('Anonimizador 7a', 'sem IA: texto colado recebe mensagem clara (503)', 'POST', '/documents/anonymize', { token: G, body: { texto: 'Fulano, CPF 123.456.789-09' } }, 503, r => /depende da inteligência artificial/.test(r.json.erro) || 'mensagem');

  // ---------- Etapa 7b ----------
  // DSAR
  await passo('DSAR 7b', 'CPF com dígito errado recusado (400)', 'POST', '/dsar/solicitacoes', { token: G, body: { titularNome: 'Titular CPF', titularEmail: 'cpf@demo-staging.local', titularCpf: '529.982.247-24', tipoDireito: 'ACESSO', descricao: 'x' } }, 400);
  const s7 = await passo('DSAR 7b', 'pedido interno nasce aguardando verificação, sem prazo', 'POST', '/dsar/solicitacoes', { token: G, body: { titularNome: 'Titular 7b', titularEmail: 't7b@demo-staging.local', titularCpf: '529.982.247-25', tipoDireito: 'OPOSICAO', descricao: 'Oposição a tratamento' } }, 201,
    r => (r.json.status === 'AGUARDANDO_VERIFICACAO' && r.json.dataLimite === null && /Aguardando verificação/.test(r.json.sla.label)) || `status ${r.json.status}`);
  const id7 = s7?.json?.id;
  await passo('DSAR 7b', 'responder sem identidade verificada é bloqueado (400)', 'POST', `/dsar/solicitacoes/${id7}/responder`, { token: G, body: { respostaTexto: 'Resposta completa.' } }, 400);
  await passo('DSAR 7b', 'verificação "Outro" com observação', 'PATCH', `/dsar/solicitacoes/${id7}/verificar-identidade`, { token: G, body: { metodo: 'OUTRO', observacao: 'Confirmado por telefone com os dados do cadastro' } }, 200,
    r => (r.json.status === 'EM_ANALISE' && r.json.sla.label === '15 dias restantes') || `prazo: ${r.json.sla?.label}`);
  await passo('DSAR 7b', 'resposta com "MINUTA" é bloqueada (400)', 'POST', `/dsar/solicitacoes/${id7}/responder`, { token: G, body: { respostaTexto: 'MINUTA — revisar\nPrezado Titular 7b, segue.' } }, 400);
  await passo('DSAR 7b', 'resposta com [campo] entre colchetes é bloqueada (400)', 'POST', `/dsar/solicitacoes/${id7}/responder`, { token: G, body: { respostaTexto: 'Prezado [NOME], segue.' } }, 400);
  await passo('DSAR 7b', 'resposta completa → "Respondido no prazo"', 'POST', `/dsar/solicitacoes/${id7}/responder`, { token: G, body: { respostaTexto: 'Prezado Titular 7b, registramos a sua oposição.' } }, 200,
    r => r.json.sla?.label === 'Respondido no prazo' || r.json.sla?.label);
  await passo('DSAR 7b', 'data de envio futura recusada (400)', 'POST', `/dsar/solicitacoes/${id7}/envio`, { token: G, body: { meio: 'CORREIOS', data: AMANHA } }, 400);
  await passo('DSAR 7b', 'CSV: rótulo no lugar de VERIFICACAO_IDENTIDADE, ";" e Brasília', 'GET', '/dsar/export?formato=csv', { token: G, binario: true }, 200, r => {
    const t = r.buf.toString('utf8');
    return (t.includes('Verificação de identidade — ') && !t.includes('VERIFICACAO_IDENTIDADE') && t.split('\r\n')[0].includes(';') && !/\d{4}-\d{2}-\d{2}T\d{2}/.test(t) && t.includes('Respondido no prazo')) || 'CSV fora do padrão';
  });
  // Repositorio
  const fdD = new FormData();
  fdD.append('titulo', 'Política de teste 7b'); fdD.append('categoria', 'POLITICA');
  fdD.append('arquivo', new Blob([await new Promise(res => { const PDFDocument = require('pdfkit'); const d = new PDFDocument(); const p = []; d.on('data', b => p.push(b)); d.on('end', () => res(Buffer.concat(p))); d.text('politica de teste'); d.end(); })], { type: 'application/pdf' }), 'politica-7b.pdf');
  const doc7 = await passo('Repositório 7b', 'Gestor envia arquivo', 'POST', '/repositorio/upload', { token: G, form: fdD }, 201);
  await passo('Repositório 7b', 'excluir sem motivo é recusado (400)', 'DELETE', `/repositorio/documentos/${doc7?.json?.id}`, { token: G, body: {} }, 400);
  await passo('Repositório 7b', 'excluir com motivo (exclusão lógica)', 'DELETE', `/repositorio/documentos/${doc7?.json?.id}`, { token: G, body: { motivo: 'Fumaça: versão substituída' } });
  await passo('Repositório 7b', 'excluído some da lista e aparece em "excluídos"', 'GET', '/repositorio/documentos?excluidos=1', { token: G }, 200,
    r => r.json.some(d => d.id === doc7?.json?.id && d.motivoExclusao === 'Fumaça: versão substituída') || 'não está nos excluídos');
  await passo('Repositório 7b', 'histórico do documento: enviado e excluído, por quem e quando', 'GET', `/historico?entidade=DOCUMENTO&registroId=${doc7?.json?.id}`, { token: G }, 200,
    r => (r.json.itens.map(i => i.acao).sort().join(',') === 'CRIAR,EXCLUIR' && r.json.itens.every(i => i.usuarioId && i.criadoEm)) || 'histórico incompleto');
  await passo('Checklist 7b', 'Auditor vê evidências e histórico do checklist', 'GET', `/historico?entidade=CHECKLIST_ITEM&registroId=${ctx.atividade?.json?.id}`, { token: (await req('POST', '/auth/login', { body: cred.AUDITOR })).json?.token }, 200); // sessao nova: a do inicio foi encerrada ao zerar o MFA (6d)
  // Validacoes
  await passo('Validações 7b', 'retenção negativa recusada (400)', 'POST', '/ropa/tratamentos', { token: G, body: { nome: 'Ret 7b', finalidade: 'x', baseLegal: 'OBRIGACAO_LEGAL', retencaoDias: -1 } }, 400);
  await passo('Validações 7b', 'país estrangeiro sem hipótese do art. 33 recusado (400)', 'POST', '/ropa/tratamentos', { token: G, body: { nome: 'Ext 7b', finalidade: 'x', baseLegal: 'OBRIGACAO_LEGAL', compartilhamentos: [{ terceiroNome: 'Nuvem EUA', finalidadeCompartilhamento: 'Hospedagem', paisDestino: 'Estados Unidos' }] } }, 400);
  const ext = await passo('Validações 7b', 'país estrangeiro com art. 33, II aceito', 'POST', '/ropa/tratamentos', { token: G, body: { nome: 'Ext 7b', finalidade: 'x', baseLegal: 'OBRIGACAO_LEGAL', compartilhamentos: [{ terceiroNome: 'Nuvem EUA', finalidadeCompartilhamento: 'Hospedagem', paisDestino: 'Estados Unidos', baseLegalTransferencia: 'ART33_II' }] } }, 201);
  if (ext?.json?.id) await req('DELETE', `/ropa/tratamentos/${ext.json.id}`, { token: G });
  await passo('Validações 7b', 'CNPJ com dígito errado recusado (400)', 'POST', '/terceiros', { token: G, body: { razaoSocial: 'CNPJ errado', cnpj: '11.222.333/0001-82' } }, 400);
  await passo('Validações 7b', 'incidente com data futura recusado (400)', 'POST', '/repositorio/incidentes', { token: G, body: { titulo: 'Futuro', tipoIncidente: 'PERDA', descricao: 'x', dataOcorrencia: AMANHA } }, 400);
  await passo('Validações 7b', 'ciência anterior à ocorrência recusada (400)', 'POST', '/repositorio/incidentes', { token: G, body: { titulo: 'Ordem', tipoIncidente: 'PERDA', descricao: 'x', dataOcorrencia: '2026-10-10', dataCiencia: '2026-10-09' } }, 400);
  await passo('Validações 7b', 'titulares negativos recusados (400)', 'POST', '/repositorio/incidentes', { token: G, body: { titulo: 'Neg', tipoIncidente: 'PERDA', descricao: 'x', dataOcorrencia: '2026-10-10', qtdTitulares: -1 } }, 400);
  // MFA da camara pelo Gestor
  await passo('MFA 7b', 'Gestor liga o MFA obrigatório da câmara', 'PUT', '/organizacao/mfa-obrigatorio', { token: G, body: { mfaObrigatorio: true } }, 200, r => r.json.mfaObrigatorio === true || 'não ligou');
  await passo('MFA 7b', 'Gestor desliga (para o teste no navegador)', 'PUT', '/organizacao/mfa-obrigatorio', { token: G, body: { mfaObrigatorio: false } });
  await passo('MFA 7b', 'histórico da câmara com quem ligou', 'GET', `/historico?entidade=ORGANIZACAO&registroId=${org.id}`, { token: G }, 200,
    r => r.json.itens.some(h => h.diff?.mfaObrigatorio?.depois === true && h.usuarioId === gestorU?.id) || 'sem registro do Gestor');
  // Indicador do ROPA
  await passo('Indicadores 7b', 'ROPA mostra pendentes por falta de setor ou sistema, com link', 'GET', '/indicadores', { token: G }, 200,
    r => { const i = (r.json.indicadores || []).find(x => x.chave === 'ROPA'); return (typeof i?.pendentesSetorSistema === 'number' && i.linkSetorSistema?.filtro === 'sem-setor-sistema') || 'sem o contador'; });

  // ---------- Limites de tentativas (por último: bloqueiam a conta/IP por 15 min) ----------
  let st429 = null, n = 0;
  for (n = 1; n <= 12; n++) {
    const r = await req('POST', '/auth/login', { body: { email: 'nao-existe-7a@demo-staging.local', senha: 'senha-errada-7a' } });
    if (r.status === 429) { st429 = r; break; }
  }
  linhas.push({ modulo: 'Limites 7b', descricao: `login: 429 na 11ª falha da MESMA conta (veio na tentativa ${n})`, metodo: 'POST', rota: '/auth/login', status: st429?.status || '-', ok: !!st429 && n === 11, nota: st429 ? (n === 11 ? '' : `na tentativa ${n}`) : 'nunca deu 429' });
  await passo('Limites 7b', 'colega no mesmo IP (outra conta) não fica bloqueado', 'POST', '/auth/login', { body: { email: 'colega-7b@demo-staging.local', senha: 'senha-errada-7b' } }, 401);
  let ad429 = null, m = 0;
  for (m = 1; m <= 12; m++) {
    const r = await req('POST', '/admin/login', { body: { email: 'nao-existe-7a@demo-staging.local', senha: 'senha-errada-7a' } });
    if (r.status === 429) { ad429 = r; break; }
  }
  linhas.push({ modulo: 'Limites 7a', descricao: `login do Admin: 429 na 11ª falha da mesma conta (veio na tentativa ${m})`, metodo: 'POST', rota: '/admin/login', status: ad429?.status || '-', ok: !!ad429 && m === 11, nota: ad429 ? (m === 11 ? '' : `na tentativa ${m}`) : 'nunca deu 429' });
}

main()
  .catch(e => linhas.push({ modulo: 'FATAL', descricao: e.message, metodo: '-', rota: '-', status: '-', ok: false, nota: '' }))
  .finally(() => {
    const falhas = linhas.filter(l => !l.ok);
    console.log('| # | Módulo | Verificação | Rota | Status | Resultado |');
    console.log('|---|---|---|---|---|---|');
    linhas.forEach((l, i) => console.log(`| ${i + 1} | ${l.modulo} | ${l.descricao} | \`${l.metodo} ${l.rota}\` | ${l.status} | ${l.ok ? 'ok' : 'FALHOU: ' + l.nota} |`));
    console.log(`\nTotal: ${linhas.length} verificações, ${linhas.length - falhas.length} ok, ${falhas.length} falha(s).`);
    if (ctx.pdfaStatus) console.log('PDF/A status:', JSON.stringify(ctx.pdfaStatus));
    process.exitCode = falhas.length ? 1 : 0;
  });
