const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const bl = require('../src/services/basesLegais');
const { PERGUNTAS } = require('../src/services/questionarioTerceiro');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const chamar = (token, metodo, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: metodo,
  headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
  ...(body !== undefined && { body: JSON.stringify(body) })
});

// ---------- Tabela de bases legais ----------

test('art. 7 completo (I a X) e art. 11 (I e II a-g), no formato "Art. 7º, II — ..."', () => {
  const rot = bl.ROTULO_BASE_LEGAL;
  const incisos7 = bl.ART7.map(c => rot[c].match(/^Art\. 7º, ([IVX]+)/)[1]);
  assert.deepEqual(incisos7, ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
  assert.equal(rot.INTERESSE_PUBLICO, 'Art. 7º, III c/c art. 23 — Execução de políticas públicas pela administração pública');
  assert.equal(rot.OBRIGACAO_LEGAL, 'Art. 7º, II — Cumprimento de obrigação legal ou regulatória pelo controlador');
  const incisos11 = bl.ART11.map(c => rot[c].match(/^Art\. 11, (I|II, [a-g]) — /)[1]);
  assert.deepEqual(incisos11, ['I', 'II, a', 'II, b', 'II, c', 'II, d', 'II, e', 'II, f', 'II, g']);
});

test('todo valor do enum BaseLegal tem rotulo e os valores antigos continuam existindo', () => {
  // le do schema.prisma (o @prisma/client e substituido pelo fake nos testes)
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const enumBanco = schema.match(/enum BaseLegal \{([^}]*)\}/)[1].split(/\r?\n/).map(l => l.trim()).filter(l => /^[A-Z_]+$/.test(l));
  for (const antigo of ['CONSENTIMENTO', 'OBRIGACAO_LEGAL', 'EXECUCAO_CONTRATO', 'INTERESSE_LEGITIMO', 'PROTECAO_VIDA', 'TUTELA_SAUDE', 'INTERESSE_PUBLICO', 'EXERCICIO_DIREITOS']) {
    assert.ok(enumBanco.includes(antigo), `valor antigo removido: ${antigo}`);
  }
  assert.deepEqual([...enumBanco].sort(), [...bl.ART7, ...bl.ART11].sort(), 'enum e tabela de rótulos batem');
});

test('copia do frontend identica a do backend', (t) => {
  const front = path.join(__dirname, '..', '..', 'frontend', 'src', 'basesLegais.json');
  if (!fs.existsSync(front)) return t.skip('frontend fora deste checkout');
  assert.deepEqual(JSON.parse(fs.readFileSync(front, 'utf8')), require('../src/data/basesLegais.json'));
});

test('categorias sensiveis do art. 5, II (inclui a categoria antiga "Dados de Saude")', () => {
  assert.equal(bl.CATEGORIAS_SENSIVEIS.length, 8);
  assert.ok(bl.temDadoSensivel(['Nome', 'Dado biométrico']));
  assert.ok(bl.temDadoSensivel(['Dados de Saude']));
  assert.ok(!bl.temDadoSensivel(['Nome', 'CPF']));
});

// ---------- ROPA ----------

test('ROPA valida o artigo de cada campo e exige art. 11 para ser "mapeado" com dado sensivel', async () => {
  const t = tokenDe(s.gestorA);
  const setor = await db.setor.create({ data: { organizacaoId: s.orgA.id, nome: 'Saúde' } });
  const base = {
    nome: 'Junta médica', finalidade: 'Perícias de servidores', categoriasDados: ['Nome', 'Saúde'], retencaoDias: 1825,
    setorId: setor.id, responsavelId: s.dpoA.id, outrosMeios: 'Prontuário em papel'
  };
  assert.equal((await chamar(t, 'POST', '/ropa/tratamentos', { ...base, baseLegal: 'SENSIVEL_TUTELA_SAUDE' })).status, 400, 'art. 11 no campo do art. 7');
  assert.equal((await chamar(t, 'POST', '/ropa/tratamentos', { ...base, baseLegal: 'OBRIGACAO_LEGAL', baseLegalSensivel: 'OBRIGACAO_LEGAL' })).status, 400, 'art. 7 no campo do art. 11');
  assert.equal((await chamar(t, 'POST', '/ropa/tratamentos', { ...base, baseLegal: 'INVENTADA' })).status, 400);

  const sem11 = await (await chamar(t, 'POST', '/ropa/tratamentos', { ...base, baseLegal: 'OBRIGACAO_LEGAL' })).json();
  let lista = await (await chamar(t, 'GET', '/ropa/tratamentos')).json();
  const a = lista.find(x => x.id === sem11.id);
  assert.equal(a.mapeado, false);
  assert.deepEqual(a.pendenciasMapeamento, ['base legal do art. 11 (dados sensíveis)']);

  const r = await chamar(t, 'PUT', `/ropa/tratamentos/${sem11.id}`, { baseLegalSensivel: 'SENSIVEL_OBRIGACAO_LEGAL' });
  assert.equal(r.status, 200);
  lista = await (await chamar(t, 'GET', '/ropa/tratamentos')).json();
  assert.equal(lista.find(x => x.id === sem11.id).mapeado, true);

  // novos valores do art. 7 sao aceitos
  assert.equal((await chamar(t, 'POST', '/ropa/tratamentos', { ...base, categoriasDados: ['Nome'], baseLegal: 'PROTECAO_CREDITO' })).status, 201);

  // exportacoes e transparencia com rotulos (nunca o codigo)
  const csv = await (await chamar(t, 'GET', '/ropa/export?formato=csv')).text();
  const linha = csv.split('\n').find(l => l.startsWith('"Junta médica"'));
  assert.ok(linha.includes('"Art. 7º, II — Cumprimento de obrigação legal ou regulatória pelo controlador"'));
  assert.ok(linha.endsWith('"Art. 11, II, a — Cumprimento de obrigação legal ou regulatória pelo controlador"'));
  assert.ok(!/,OBRIGACAO_LEGAL,/.test(csv), 'código cru no CSV');
  const exp = await (await chamar(t, 'GET', '/ropa/export?formato=json')).json();
  assert.equal(exp.find(x => x.id === sem11.id).baseLegal, 'OBRIGACAO_LEGAL', 'JSON mantém o código');
  assert.equal(exp.find(x => x.id === sem11.id).baseLegalRotulo, 'Art. 7º, II — Cumprimento de obrigação legal ou regulatória pelo controlador');

  await db.organizacao.update({ where: { id: s.orgA.id }, data: { slug: 'camara-a' } });
  const pub = await (await chamar(null, 'GET', '/transparencia/publico/camara-a')).json();
  const tp = pub.tratamentos.find(x => x.nome === 'Junta médica');
  assert.equal(tp.baseLegalSensivel, 'Art. 11, II, a — Cumprimento de obrigação legal ou regulatória pelo controlador');

  const previa = await (await chamar(tokenDe(s.dpoA), 'POST', '/gerador/modelos/politica-privacidade/previa', {})).json();
  assert.ok(previa.texto.includes('Art. 7º, II — Cumprimento de obrigação legal ou regulatória pelo controlador / Art. 11, II, a —'));
});

// ---------- Historico ----------

test('historico devolve perfil de quem alterou e o texto da pergunta do questionario', async () => {
  const t = tokenDe(s.dpoA);
  const terc = await (await chamar(t, 'POST', '/terceiros', { razaoSocial: 'Fornecedor X' })).json();
  await chamar(t, 'PUT', `/terceiros/${terc.id}/questionario`, { respostas: [{ perguntaId: 'DIR2', resposta: 'SIM' }] });
  const h = await (await chamar(t, 'GET', `/historico?entidade=TERCEIRO&registroId=${terc.id}`)).json();
  assert.equal(h.usuarios[s.dpoA.id], 'DPO A');
  assert.equal(h.perfis[s.dpoA.id], 'ENCARREGADO_LGPD');
  assert.equal(h.rotulosCampos['questionario.DIR2'], 'Atende a pedidos da Câmara em prazo que permita cumprir o art. 19 da LGPD? (DIR2)');
});

test('DIR2 com o texto novo', () => {
  assert.equal(PERGUNTAS.DIR2.texto, 'Atende a pedidos da Câmara em prazo que permita cumprir o art. 19 da LGPD?');
});

// ---------- Admin: nome da pessoa do primeiro usuario ----------

test('criar camara exige o nome da PESSOA do primeiro usuario e o usa no Gestor', async () => {
  const admin = jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const corpo = { nome: 'Câmara Nova', cnpj: '33333333000191', email: 'gestor-nova@teste.local', senha: '12345678' };
  assert.equal((await chamar(admin, 'POST', '/admin/camaras', corpo)).status, 400, 'sem nomeGestor');
  const r = await chamar(admin, 'POST', '/admin/camaras', { ...corpo, nomeGestor: 'Maria Gestora' });
  assert.equal(r.status, 201);
  const u = db.__tabelas.usuario.find(x => x.email === 'gestor-nova@teste.local');
  assert.equal(u.nome, 'Maria Gestora');
  assert.equal(u.perfil, 'GESTOR');
});
