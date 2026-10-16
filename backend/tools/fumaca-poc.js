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
      token: ctx.admin, body: { nome: 'Camara Demo Staging', cnpj: CNPJ, email: cred.GESTOR.email, senha: cred.GESTOR.senha }
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
    titulo: 'Simulado anual', dataOcorrencia: new Date().toISOString().slice(0, 10), tipoIncidente: 'VAZAMENTO', descricao: 'Exercício', severidade: 'MEDIA', tipoRegistro: 'SIMULADO'
  } }, 201);
  await passo('Incidentes', 'registrar providência', 'POST', `/repositorio/incidentes/${inc?.json?.id}/providencias`, { token: G, body: { descricao: 'Senhas trocadas' } }, 201);
  await passo('Incidentes', 'listar (filtro simulado)', 'GET', '/repositorio/incidentes?tipoRegistro=SIMULADO', { token: G });
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
  await passo('DSAR', 'exportar CSV', 'GET', '/dsar/export?formato=csv', { token: G, binario: true });

  // ---------- Checklist ----------
  const at = await passo('Checklist', 'criar atividade própria', 'POST', '/conformidade/atividades', { token: G, body: { titulo: 'Revisar contratos', prazo: '2026-12-15', responsavelId: me.json?.id } }, 201);
  await passo('Checklist', 'responder atividade', 'POST', `/conformidade/checklist/${at?.json?.id}/responder`, { token: G, body: { status: 'CONFORME', observacao: 'ok' } });
  await passo('Checklist', 'listar checklist', 'GET', '/conformidade/checklist', { token: G });
  await passo('Checklist', 'exportar JSON', 'GET', '/conformidade/checklist/export?formato=json', { token: G });

  // ---------- Treinamento ----------
  let cert = null;
  for (const m of ['o-que-e-lgpd', 'principios-lgpd']) {
    const r = await passo('Treinamento', `concluir módulo ${m}`, 'POST', '/treinamento/progresso', { token: D, body: { trilhaId: 'introducao-lgpd', moduloId: m } });
    cert = r?.json?.certificadoCodigo || cert;
  }
  await passo('Treinamento', 'certificado PDF', 'GET', `/treinamento/certificados/${cert}/pdf`, { token: D, binario: true }, 200, r => pdf(r.buf));
  await passo('Treinamento', 'verificação pública do certificado', 'GET', `/certificado/verificar/${cert}`, {}, 200, r => r.json.valido === true || 'inválido');
  await passo('Treinamento', 'relatório CSV (Gestor)', 'GET', '/treinamento/relatorio?formato=csv', { token: G, binario: true });
  await passo('Permissões', 'TREINANDO acessa trilhas', 'GET', '/treinamento/trilhas', { token: ctx.t.TREINANDO });

  // ---------- Indicadores ----------
  await passo('Indicadores', 'painel', 'GET', '/indicadores', { token: G }, 200, r => r.json.indicadores.length === 5 || 'faltam indicadores');
  await passo('Indicadores', 'salvar metas', 'PUT', '/indicadores/metas', { token: G, body: { metas: { TREINAMENTOS: 70 } } });
  await passo('Indicadores', 'foto mensal sob demanda', 'POST', '/indicadores/snapshots', { token: G }, 201);
  await passo('Indicadores', 'exportar CSV', 'GET', '/indicadores/export?formato=csv', { token: G, binario: true });

  // ---------- Gerador de minutas ----------
  await passo('Minutas', 'listar modelos', 'GET', '/gerador/modelos', { token: G }, 200, r => r.json.length === 9 || 'não são 9 modelos');
  await passo('Minutas', 'prévia sem pendências', 'POST', '/gerador/modelos/politica-privacidade/previa', { token: G, body: {} }, 200,
    r => r.json.pendencias.length === 0 || `pendências: ${r.json.pendencias.join('; ')}`);
  const ger = await passo('Minutas', 'gerar DOCX + PDF', 'POST', '/gerador/modelos/politica-privacidade/gerar', { token: G, body: {} }, 201);
  for (const d of ger?.json?.documentos || []) {
    await passo('Minutas', `baixar ${d.formato}`, 'GET', `/repositorio/documentos/${d.id}/download`, { token: G, binario: true }, 200, r => (d.formato === 'PDF' ? pdf(r.buf) : zip(r.buf)));
  }
  await passo('Minutas', 'aditivo com terceiro', 'POST', '/gerador/modelos/aditivo-lgpd/gerar', { token: G, body: { terceiroId: terc?.json?.id } }, 201);

  // ---------- Transparencia (publica) ----------
  await passo('Transparência', 'página pública', 'GET', `/transparencia/publico/${ctx.org.slug}`, {}, 200,
    r => (r.json.tratamentos.length > 0 && !JSON.stringify(r.json).includes('"responsavelId"')) || 'sem tratamentos ou com campo interno');

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
  const operador = (lista?.json || []).find(u => u.perfil === 'OPERADOR' || u.email === cred.OPERADOR.email);
  const treinando = (lista?.json || []).find(u => u.email === cred.TREINANDO.email);
  await passo('Usuários', 'trocar perfil OPERADOR→AUDITOR', 'PATCH', `/usuarios/${operador?.id}/perfil`, { token: G, body: { perfil: 'AUDITOR' } });
  await passo('Usuários', 'voltar perfil para OPERADOR', 'PATCH', `/usuarios/${operador?.id}/perfil`, { token: G, body: { perfil: 'OPERADOR' } });
  await passo('Usuários', 'desativar TREINANDO', 'PATCH', `/usuarios/${treinando?.id}/ativo`, { token: G, body: { ativo: false } });
  await passo('Usuários', 'TREINANDO desativado não entra (403)', 'POST', '/auth/login', { body: cred.TREINANDO }, 403);
  await passo('Usuários', 'reativar TREINANDO', 'PATCH', `/usuarios/${treinando?.id}/ativo`, { token: G, body: { ativo: true } });
  await passo('Usuários', 'OPERADOR não gerencia usuários (403)', 'GET', '/usuarios/gestao', { token: ctx.t.OPERADOR }, 403);

  // ---------- MFA obrigatorio (com o OPERADOR; Gestor fica sem MFA) ----------
  await passo('MFA', 'ligar MFA obrigatório', 'PATCH', `/admin/camaras/${org.id}/mfa-obrigatorio`, { token: ctx.admin, body: { mfaObrigatorio: true } });
  const l1 = await passo('MFA', 'login sem MFA pede configuração', 'POST', '/auth/login', { body: cred.OPERADOR }, 200,
    r => (r.json.mfaSetupObrigatorio || r.json.mfaPendente) ? true : 'emitiu sessão sem MFA');
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
  if (l2?.json?.mfaPendente) {
    await passo('MFA', 'verificar código', 'POST', '/auth/mfa/verificar', {
      body: { tempToken: l2.json.tempToken, codigo: speakeasy.totp({ secret: cred.OPERADOR.mfaSecret, encoding: 'base32' }) }
    }, 200, r => !!r.json.token || 'sem sessão');
  }
  await passo('MFA', 'desligar MFA obrigatório (para o teste no navegador)', 'PATCH', `/admin/camaras/${org.id}/mfa-obrigatorio`, { token: ctx.admin, body: { mfaObrigatorio: false } });
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
