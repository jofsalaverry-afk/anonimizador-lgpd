// Etapa 7a: cliente unico do Prisma, trava das tarefas agendadas, sessoes,
// senhas, endurecimento, e-mail, endereco publico e anonimizador sem IA.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const email = require('../src/services/emailService');
const { comTrava, chaveDaTrava } = require('../src/services/travaCron');
const { resolverAppUrl } = require('../src/services/appUrl');
const { origensCors } = require('../src/services/origensCors');
const { celulaCsv, erroLinkEvidencia, limparNomeArquivo } = require('../src/services/textoSeguro');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const chamar = (token, metodo, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: metodo,
  headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
  ...(body !== undefined && { body: JSON.stringify(body) })
});
const json = r => r.json();
const usuario = id => db.__tabelas.usuario.find(u => u.id === id);
const sessaoDe = u => tokenDe(u, { sv: usuario(u.id)?.sessaoVersao || 0 });
const admin = () => jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
async function novoUsuario(email_, senha, extra = {}) {
  return db.usuario.create({ data: { email: email_, senhaHash: await bcrypt.hash(senha, 4), nome: 'Pessoa Teste', perfil: 'OPERADOR', ativo: true, mfaAtivo: false, organizacaoId: s.orgA.id, ...extra } });
}

// ---------- 2. Um PrismaClient so ----------

test('2: so src/db.js cria PrismaClient', () => {
  const achados = [];
  (function varrer(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) varrer(p);
      else if (n.endsWith('.js') && /new PrismaClient\(/.test(fs.readFileSync(p, 'utf8'))) achados.push(path.relative(path.join(__dirname, '..', 'src'), p));
    }
  })(path.join(__dirname, '..', 'src'));
  assert.deepEqual(achados, ['db.js']);
});

// ---------- 3. Trava das tarefas agendadas ----------

test('3: com duas instancias ao mesmo tempo, a tarefa roda uma vez so', async () => {
  // banco falso que imita pg_try_advisory_xact_lock (trava solta no fim da transacao)
  const travas = new Set();
  const dbFalso = {
    async $transaction(fn) {
      const minhas = [];
      const tx = { async $queryRawUnsafe(sql, chave) { if (travas.has(chave)) return [{ ok: false }]; travas.add(chave); minhas.push(chave); return [{ ok: true }]; } };
      try { return await fn(tx); } finally { minhas.forEach(k => travas.delete(k)); }
    }
  };
  let execucoes = 0;
  const tarefa = async () => { execucoes++; await new Promise(r => setTimeout(r, 50)); return 'feito'; };
  const [a, b] = await Promise.all([comTrava(dbFalso, 'jobSlaDSAR', tarefa), comTrava(dbFalso, 'jobSlaDSAR', tarefa)]);
  assert.equal(execucoes, 1);
  assert.deepEqual([a.rodou, b.rodou].sort(), [false, true]);
  // depois de terminar, a trava e solta e a proxima execucao roda
  assert.equal((await comTrava(dbFalso, 'jobSlaDSAR', tarefa)).rodou, true);
  assert.notEqual(chaveDaTrava('jobSlaDSAR'), chaveDaTrava('jobRelatorioDiario'));
  // as 7 tarefas agendadas passam pela trava
  const cron = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'cronJobs.js'), 'utf8');
  assert.equal((cron.match(/cron\.schedule\('[^']+', travado\('/g) || []).length, 7);
});

// ---------- 4. Sessoes ----------

test('4: logout encerra a sessao no servidor', async () => {
  const u = await novoUsuario('logout@teste.local', 'senha-logout-1');
  const t = sessaoDe(u);
  assert.equal((await chamar(t, 'GET', '/auth/me')).status, 200);
  assert.equal((await chamar(t, 'POST', '/auth/logout')).status, 200);
  assert.equal((await chamar(t, 'GET', '/auth/me')).status, 401);
  assert.equal((await chamar(t, 'GET', '/ropa/tratamentos')).status, 401);
});

test('4: desativar usuario (Gestor) e desativar camara (Admin) encerram as sessoes na hora', async () => {
  const u = await novoUsuario('desativar@teste.local', 'senha-desativa-1');
  const t = sessaoDe(u);
  assert.equal((await chamar(t, 'POST', '/ropa/tratamentos', { nome: 'Antes', finalidade: 'x', baseLegal: 'OBRIGACAO_LEGAL' })).status, 201);
  assert.equal((await chamar(sessaoDe(s.gestorA), 'PATCH', `/usuarios/${u.id}/ativo`, { ativo: false })).status, 200);
  assert.equal((await chamar(t, 'POST', '/ropa/tratamentos', { nome: 'Depois', finalidade: 'x', baseLegal: 'OBRIGACAO_LEGAL' })).status, 401, 'não grava mais');

  const tB = sessaoDe(s.gestorB);
  assert.equal((await chamar(tB, 'GET', '/ropa/tratamentos')).status, 200);
  assert.equal((await chamar(admin(), 'PATCH', `/admin/camaras/${s.orgB.id}/toggle`)).status, 200);
  assert.equal((await chamar(tB, 'GET', '/ropa/tratamentos')).status, 401, 'câmara desativada');
  await chamar(admin(), 'PATCH', `/admin/camaras/${s.orgB.id}/toggle`); // reativa para os demais testes
});

// ---------- 5. Senha ----------

test('5: senha inicial criada pelo Gestor: minimo 10 e troca obrigatoria no 1o acesso', async () => {
  const g = sessaoDe(s.gestorA);
  assert.equal((await chamar(g, 'POST', '/usuarios', { nome: 'Novo', email: 'novo7a@teste.local', senha: '123456789', perfil: 'OPERADOR' })).status, 400, '9 caracteres');
  assert.equal((await chamar(g, 'POST', '/usuarios', { nome: 'Novo', email: 'novo7a@teste.local', senha: 'inicial-123', perfil: 'OPERADOR' })).status, 201);
  const l1 = await json(await chamar(null, 'POST', '/auth/login', { email: 'novo7a@teste.local', senha: 'inicial-123' }));
  assert.equal(l1.trocaSenhaObrigatoria, true);
  assert.ok(!l1.token, 'sem sessão antes de trocar');
  assert.equal((await chamar(null, 'POST', '/auth/senha/primeiro-acesso', { trocaToken: l1.trocaToken, novaSenha: 'inicial-123' })).status, 400, 'igual à inicial');
  assert.equal((await chamar(null, 'POST', '/auth/senha/primeiro-acesso', { trocaToken: l1.trocaToken, novaSenha: 'curta' })).status, 400);
  assert.equal((await chamar(null, 'POST', '/auth/senha/primeiro-acesso', { trocaToken: l1.trocaToken, novaSenha: 'minha-senha-pessoal' })).status, 200);
  const l2 = await json(await chamar(null, 'POST', '/auth/login', { email: 'novo7a@teste.local', senha: 'minha-senha-pessoal' }));
  assert.ok(l2.token, 'entra com a senha nova');
  assert.equal((await chamar(null, 'POST', '/auth/login', { email: 'novo7a@teste.local', senha: 'inicial-123' })).status, 401);
});

test('5: troca de senha exige a senha atual e encerra as outras sessoes', async () => {
  const u = await novoUsuario('troca@teste.local', 'senha-atual-123');
  const t = sessaoDe(u);
  assert.equal((await chamar(t, 'PUT', '/auth/senha', { senhaAtual: 'errada-errada', novaSenha: 'senha-nova-123' })).status, 400);
  assert.equal((await chamar(t, 'PUT', '/auth/senha', { senhaAtual: 'senha-atual-123', novaSenha: 'curta' })).status, 400);
  const r = await json(await chamar(t, 'PUT', '/auth/senha', { senhaAtual: 'senha-atual-123', novaSenha: 'senha-nova-123' }));
  assert.ok(r.token, 'devolve sessão nova');
  assert.equal((await chamar(t, 'GET', '/auth/me')).status, 401, 'sessão antiga encerrada');
  assert.equal((await chamar(r.token, 'GET', '/auth/me')).status, 200);
  assert.ok(await bcrypt.compare('senha-nova-123', usuario(u.id).senhaHash));
});

test('5: esqueci minha senha — resposta igual, link de uso unico, 30 minutos', async () => {
  const antes = process.env.EMAIL_TRANSPORTE;
  delete process.env.EMAIL_TRANSPORTE;
  assert.equal((await chamar(null, 'POST', '/auth/senha/esqueci', { email: 'x@teste.local' })).status, 503, 'sem e-mail configurado: não finge');
  process.env.EMAIL_TRANSPORTE = 'memoria';
  try {
    const u = await novoUsuario('esqueci@teste.local', 'senha-esquecida-1');
    const n0 = email.caixaMemoria.length;
    const inexistente = await json(await chamar(null, 'POST', '/auth/senha/esqueci', { email: 'naoexiste@teste.local' }));
    const existente = await json(await chamar(null, 'POST', '/auth/senha/esqueci', { email: 'esqueci@teste.local' }));
    assert.deepEqual(inexistente, existente, 'mesma resposta');
    assert.equal(email.caixaMemoria.length, n0 + 1, 'só o cadastrado recebe');
    const msg = email.caixaMemoria[email.caixaMemoria.length - 1];
    const token = msg.text.match(/#redefinir-senha\/([A-Za-z0-9_-]+)/)[1];
    assert.ok(msg.text.includes('30 minutos'));
    assert.equal((await chamar(null, 'POST', '/auth/senha/redefinir', { token, novaSenha: 'curta' })).status, 400);
    assert.equal((await chamar(null, 'POST', '/auth/senha/redefinir', { token, novaSenha: 'senha-redefinida-1' })).status, 200);
    assert.equal((await chamar(null, 'POST', '/auth/senha/redefinir', { token, novaSenha: 'outra-senha-123' })).status, 400, 'uso único');
    assert.ok(await bcrypt.compare('senha-redefinida-1', usuario(u.id).senhaHash));
    // link vencido
    await chamar(null, 'POST', '/auth/senha/esqueci', { email: 'esqueci@teste.local' });
    const t2 = email.caixaMemoria[email.caixaMemoria.length - 1].text.match(/#redefinir-senha\/([A-Za-z0-9_-]+)/)[1];
    db.__tabelas.tokenRecuperacaoSenha.forEach(r => { if (!r.usadoEm) r.expiraEm = new Date(Date.now() - 1000); });
    assert.equal((await chamar(null, 'POST', '/auth/senha/redefinir', { token: t2, novaSenha: 'senha-vencida-12' })).status, 400, 'vencido');
    // so o hash do token fica no banco
    assert.ok(!JSON.stringify(db.__tabelas.tokenRecuperacaoSenha).includes(token));
    // historico registra o fato, nunca a senha
    const hist = JSON.stringify(db.__tabelas.historicoRegistro);
    assert.ok(hist.includes('redefinida pelo link de recuperação'));
    for (const senha of ['senha-redefinida-1', 'senha-nova-123', 'minha-senha-pessoal']) assert.ok(!hist.includes(senha), 'senha no histórico');
  } finally {
    if (antes === undefined) delete process.env.EMAIL_TRANSPORTE; else process.env.EMAIL_TRANSPORTE = antes;
  }
});

// ---------- 6. Endurecimento ----------

test('6: JWT com algoritmo diferente de HS256 ou "none" e recusado', async () => {
  const dados = { id: s.gestorA.id, organizacaoId: s.orgA.id, perfil: 'GESTOR' };
  const hs384 = jwt.sign(dados, process.env.JWT_SECRET, { algorithm: 'HS384' });
  const none = jwt.sign(dados, null, { algorithm: 'none' });
  for (const t of [hs384, none]) assert.equal((await chamar(t, 'GET', '/ropa/tratamentos')).status, 401);
  assert.equal((await chamar(jwt.sign({ id: 'adm', isAdmin: true }, process.env.JWT_SECRET, { algorithm: 'HS384' }), 'GET', '/admin/camaras')).status, 401);
});

test('6: CORS sem localhost em producao; origem de PUBLIC_APP_URL entra', () => {
  const prod = origensCors({ NODE_ENV: 'production' }, 'https://anonimizadorldpd.com');
  assert.ok(!prod.some(o => o.includes('localhost')));
  assert.ok(prod.includes('https://anonimizadorldpd.com'));
  assert.ok(origensCors({ NODE_ENV: 'production' }, 'http://localhost:3000').includes('http://localhost:3000'), 'ambiente de teste explícito');
  assert.ok(origensCors({}, 'https://anonimizadorldpd.com').includes('http://localhost:3000'), 'desenvolvimento');
  assert.ok(!origensCors({ RAILWAY_ENVIRONMENT_NAME: 'production' }, 'https://anonimizadorldpd.com').some(o => o.includes('localhost')), 'Railway production sem NODE_ENV');
});

test('6: CSV neutraliza formula; link de evidencia so http/https; nome de anexo sem controle', async () => {
  assert.equal(celulaCsv('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(celulaCsv('+5521'), "'+5521");
  const g = sessaoDe(s.gestorA);
  await chamar(g, 'POST', '/ropa/tratamentos', { nome: '=cmd|calc', finalidade: '@soma', baseLegal: 'OBRIGACAO_LEGAL' });
  const csv = await (await chamar(g, 'GET', '/ropa/export?formato=csv')).text();
  assert.ok(csv.includes(`"'=cmd|calc"`) && csv.includes(`"'@soma"`), 'fórmula neutralizada');
  assert.ok(!/(^|,)"?=cmd/m.test(csv));
  // evidencia
  const item = db.__tabelas.itemChecklist?.[0] || await db.itemChecklist.create({ data: { codigo: 'T-7A', categoria: 'X', titulo: 'x', descricao: 'x', fundamentoLegal: 'x', criticidade: 'MEDIA', evidenciaRequerida: 'DOCUMENTO' } });
  assert.equal((await chamar(g, 'POST', `/conformidade/checklist/${item.id}/responder`, { status: 'CONFORME', evidenciaUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await chamar(g, 'POST', `/conformidade/checklist/${item.id}/responder`, { status: 'CONFORME', evidenciaUrl: 'https://portal.camara.gov.br/doc' })).status, 200);
  assert.equal((await chamar(g, 'POST', `/conformidade/checklist/${item.id}/responder`, { status: 'CONFORME', evidenciaUrl: 'Processo SEI 123/2026' })).status, 200);
  assert.ok(erroLinkEvidencia('data:text/html,x'));
  assert.equal(limparNomeArquivo('fatura‮gpj.pdf'), 'faturagpj.pdf');
  assert.equal(limparNomeArquivo('a\u0085b‏c.pdf'), 'a_bc.pdf');
});

test('6: HTML escapado no e-mail e codigo mascarado no log', async () => {
  const antes = process.env.EMAIL_TRANSPORTE;
  process.env.EMAIL_TRANSPORTE = 'memoria';
  try {
    await email.enviarRespostaTitular({ to: 't@teste.local', titularNome: '<b>Fulano</b>', protocolo: 'P-1', respostaTexto: '<script>alert(1)</script>', orgNome: 'Câmara' });
    const m = email.caixaMemoria[email.caixaMemoria.length - 1];
    assert.ok(m.html.includes('&lt;script&gt;') && !m.html.includes('<script>'));
    assert.ok(m.html.includes('&lt;b&gt;Fulano'));
  } finally {
    if (antes === undefined) delete process.env.EMAIL_TRANSPORTE; else process.env.EMAIL_TRANSPORTE = antes;
  }
  assert.equal(email.mascarar('Código de verificação: 482913 para maria.silva@exemplo.com'), 'Código de verificação: ****** para m***@exemplo.com');
});

// ---------- 7. E-mail ----------

test('7: sem SMTP (ou sem remetente) nada e "enviado"; canal publico mostra erro e contato do encarregado', async () => {
  const salvo = { h: process.env.SMTP_HOST, f: process.env.SMTP_FROM, t: process.env.EMAIL_TRANSPORTE };
  delete process.env.EMAIL_TRANSPORTE;
  try {
    process.env.SMTP_HOST = 'smtp.exemplo.invalid'; delete process.env.SMTP_FROM;
    assert.equal(email.emailConfigurado(), false, 'sem remetente não conta como configurado');
    await assert.rejects(email.enviar({ to: 'a@b.c', subject: 's', text: 't' }), e => e.code === 'EMAIL_INDISPONIVEL');
    delete process.env.SMTP_HOST;
    await db.organizacao.update({ where: { id: s.orgA.id }, data: { encarregadoNome: 'Encarregada A', encarregadoEmail: 'lgpd@camara-a.gov.br' } });
    const r = await chamar(null, 'POST', '/dsar/publico/solicitar-otp', {
      organizacaoId: s.orgA.id, titularNome: 'Titular Teste', titularEmail: 'titular@teste.local', tipoDireito: 'ACESSO', descricao: 'Quero meus dados'
    });
    assert.equal(r.status, 503);
    const b = await r.json();
    assert.ok(!/enviad/i.test(b.erro), 'não diz "enviado"');
    assert.ok(b.erro.includes('lgpd@camara-a.gov.br'), 'contato do encarregado');
    assert.equal(b.envioIndisponivel, true);
  } finally {
    if (salvo.h === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = salvo.h;
    if (salvo.f === undefined) delete process.env.SMTP_FROM; else process.env.SMTP_FROM = salvo.f;
    if (salvo.t === undefined) delete process.env.EMAIL_TRANSPORTE; else process.env.EMAIL_TRANSPORTE = salvo.t;
  }
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'emailService.js'), 'utf8');
  assert.ok(!fonte.includes("|| 'Anonimizador LGPD <nao-responda@anonimizador.local>'"), 'sem remetente padrão');
});

// ---------- 8. Endereco publico ----------

test('8: em producao, sem PUBLIC_APP_URL o backend nao sobe', () => {
  assert.throws(() => resolverAppUrl({ NODE_ENV: 'production' }), /PUBLIC_APP_URL não definida/);
  assert.throws(() => resolverAppUrl({ NODE_ENV: 'production', PUBLIC_APP_URL: 'anonimizadorldpd.com' }), /inválida/);
  assert.equal(resolverAppUrl({ NODE_ENV: 'production', PUBLIC_APP_URL: 'https://anonimizadorldpd.com/' }), 'https://anonimizadorldpd.com');
  assert.throws(() => resolverAppUrl({ RAILWAY_ENVIRONMENT_NAME: 'production' }), /PUBLIC_APP_URL não definida/, 'ambiente Railway production sem NODE_ENV');
  assert.equal(resolverAppUrl({ RAILWAY_ENVIRONMENT_NAME: 'poc' }), 'https://anonimizadorldpd.com', 'poc/dev usa o domínio oficial');
  assert.equal(resolverAppUrl({}), 'https://anonimizadorldpd.com', 'fora de produção usa o domínio oficial');
});

// ---------- 9. Anonimizador sem IA ----------

const pdfDeTeste = () => new Promise(resolve => {
  const doc = new PDFDocument();
  const partes = [];
  doc.on('data', b => partes.push(b));
  doc.on('end', () => resolve(Buffer.concat(partes)));
  doc.fontSize(12).text('Declaração de Fulano de Tal, CPF 123.456.789-09, RG 12.345.678-9, telefone (51) 99999-8888, e-mail fulano@gmail.com, residente na Rua das Flores, 10.');
  doc.end();
});
const enviarArquivo = (token, nome, buf, tipo) => {
  const fd = new FormData();
  fd.append('arquivo', new Blob([buf], { type: tipo }), nome);
  return fetch(`${srv.base}/documents/anonymize`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
};

test('9: sem a chave da IA — aviso fiel ao modo basico, texto recusado com mensagem, PDF invalido 400 sem pilha', async () => {
  const chave = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const g = sessaoDe(s.gestorA);
    const r = await json(await enviarArquivo(g, 'decl.pdf', await pdfDeTeste(), 'application/pdf'));
    assert.equal(r.modoBasico, true);
    assert.match(r.avisoIA, /apenas CPF, e-mail pessoal \(não institucional\) e telefone/);
    assert.match(r.avisoIA, /RG, endereço.*NÃO foram tarjados/);
    assert.ok(!/CPF, RG/.test(r.avisoIA), 'não promete RG');

    const t = await chamar(g, 'POST', '/documents/anonymize', { texto: 'Fulano, CPF 123.456.789-09' });
    assert.equal(t.status, 503);
    assert.match((await t.json()).erro, /depende da inteligência artificial/);

    const ruim = await enviarArquivo(g, 'quebrado.pdf', Buffer.from('%PDF-1.4\nisto nao e um pdf de verdade'), 'application/pdf');
    assert.equal(ruim.status, 400);
    const corpo = await ruim.json();
    assert.match(corpo.erro, /não é um PDF válido ou está corrompido/);
    assert.ok(!('stack' in corpo) && !JSON.stringify(corpo).includes('at '), 'sem pilha técnica');
  } finally {
    if (chave !== undefined) process.env.ANTHROPIC_API_KEY = chave;
  }
});
