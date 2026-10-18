// Etapa 7b: DSAR, repositorio/gerador, PDF/A dos documentos gerados, CSV,
// validacoes, MFA da camara, indicador do ROPA e fontes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const { calcularSLA, erroTextoResposta } = require('../src/services/dsarService');
const { cpfValido, cnpjValido } = require('../src/services/documentosId');
const email = require('../src/services/emailService');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const chamar = (token, metodo, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: metodo,
  headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
  ...(body !== undefined && { body: JSON.stringify(body) })
});
const json = r => r.json();
const dia = n => new Date(Date.now() + n * 86400000);
const operador = async () => db.usuario.create({ data: { email: `op${Date.now()}${Math.random()}@teste.local`, senhaHash: 'x', nome: 'Operador A', perfil: 'OPERADOR', ativo: true, organizacaoId: s.orgA.id } });

// ---------- 1. DSAR ----------

test('1: situacao do prazo calculada pelo status', () => {
  assert.equal(calcularSLA({ status: 'EM_ANALISE', dataLimite: dia(10) }).label, '10 dias restantes');
  assert.equal(calcularSLA({ status: 'EM_ANALISE', dataLimite: dia(-3) }).label, 'Vencido há 3 dias');
  assert.equal(calcularSLA({ status: 'EM_ANALISE', dataLimite: dia(-1) }).label, 'Vencido há 1 dia');
  assert.equal(calcularSLA({ status: 'RESPONDIDA', dataLimite: dia(2), dataResposta: new Date() }).label, 'Respondido no prazo');
  assert.equal(calcularSLA({ status: 'RESPONDIDA', dataLimite: dia(-2), dataResposta: new Date() }).label, 'Respondido fora do prazo');
  assert.equal(calcularSLA({ status: 'ENCERRADA', dataLimite: dia(-30), dataResposta: dia(-40) }).label, 'Respondido no prazo', 'encerrada depois de respondida no prazo');
  assert.equal(calcularSLA({ status: 'CANCELADA', dataLimite: dia(-30) }).label, 'Cancelada', 'cancelada não aparece como vencida');
  assert.match(calcularSLA({ status: 'AGUARDANDO_VERIFICACAO' }).label, /Aguardando verificação de identidade/);
});

test('1: CPF com digito verificador no cadastro interno e no canal publico', async () => {
  assert.ok(cpfValido('529.982.247-25') && !cpfValido('529.982.247-24') && !cpfValido('111.111.111-11'));
  const t = tokenDe(s.dpoA);
  const base = { titularNome: 'Titular C', titularEmail: 'c@teste.local', tipoDireito: 'ACESSO', descricao: 'Pedido' };
  const r = await chamar(t, 'POST', '/dsar/solicitacoes', { ...base, titularCpf: '529.982.247-24' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /dígito verificador/);
  assert.equal((await chamar(t, 'POST', '/dsar/solicitacoes', { ...base, titularCpf: '529.982.247-25' })).status, 201);
  const p = await chamar(null, 'POST', '/dsar/publico/solicitar-otp', { organizacaoId: s.orgA.id, ...base, titularCpf: '529.982.247-24', descricao: 'Pedido do titular' });
  assert.equal(p.status, 400);
  assert.match(JSON.stringify(await p.json()), /dígito verificador/);
});

test('1: pedido interno segue a regra do canal publico (prazo so depois da verificacao)', async () => {
  const t = tokenDe(s.dpoA);
  const sol = await json(await chamar(t, 'POST', '/dsar/solicitacoes', { titularNome: 'Titular P', titularEmail: 'p@teste.local', tipoDireito: 'ACESSO', descricao: 'Pedido' }));
  assert.equal(sol.status, 'AGUARDANDO_VERIFICACAO');
  assert.equal(sol.dataLimite, null);
  assert.equal((await chamar(t, 'PUT', `/dsar/solicitacoes/${sol.id}`, { status: 'EM_ANALISE' })).status, 400, 'não pula a verificação');
  const v = await json(await chamar(t, 'PATCH', `/dsar/solicitacoes/${sol.id}/verificar-identidade`, { metodo: 'DOCUMENTO' }));
  assert.equal(v.status, 'EM_ANALISE');
  const dias = Math.round((new Date(v.dataLimite) - new Date(v.identidade.em)) / 86400000);
  assert.equal(dias, 15);
});

test('1: resposta bloqueada com MINUTA, [colchetes] ou sem identidade verificada; Outro com observacao libera', async () => {
  assert.ok(erroTextoResposta('MINUTA — revisar. Prezado...'));
  assert.ok(erroTextoResposta('Prezado [NOME DO TITULAR], segue.'));
  assert.equal(erroTextoResposta('Prezado Fulano, segue a resposta.'), null);
  const t = tokenDe(s.dpoA);
  const sol = await json(await chamar(t, 'POST', '/dsar/solicitacoes', { titularNome: 'Titular M', titularEmail: 'm@teste.local', tipoDireito: 'ACESSO', descricao: 'Pedido' }));
  const sem = await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/responder`, { respostaTexto: 'Segue a resposta completa.' });
  assert.equal(sem.status, 400);
  assert.match((await sem.json()).erro, /verificação de identidade/);
  assert.equal((await chamar(t, 'PATCH', `/dsar/solicitacoes/${sol.id}/verificar-identidade`, { metodo: 'OUTRO' })).status, 400, 'Outro exige observação');
  assert.equal((await chamar(t, 'PATCH', `/dsar/solicitacoes/${sol.id}/verificar-identidade`, { metodo: 'OUTRO', observacao: 'Confirmado por telefone com dados do cadastro' })).status, 200);
  const m = await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/responder`, { respostaTexto: 'MINUTA — revisar\nPrezado Titular M, segue.' });
  assert.equal(m.status, 400);
  assert.match((await m.json()).erro, /MINUTA/);
  const c = await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/responder`, { respostaTexto: 'Prezado [NOME], segue.' });
  assert.equal(c.status, 400);
  assert.match((await c.json()).erro, /\[NOME\]/);
  const ok = await json(await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/responder`, { respostaTexto: 'Prezado Titular M, segue a resposta.' }));
  assert.equal(ok.status, 'RESPONDIDA');
  assert.equal(ok.sla.label, 'Respondido no prazo');
  // data do envio: nao futura
  const amanha = require('../src/services/datas').isoDiaSP(dia(1));
  assert.equal((await chamar(t, 'POST', `/dsar/solicitacoes/${sol.id}/envio`, { meio: 'CORREIOS', data: amanha })).status, 400, 'data futura');

  // rotulo legivel no lugar de VERIFICACAO_IDENTIDADE no CSV e no PDF/A (mesmas linhas)
  const csv = await (await chamar(t, 'GET', '/dsar/export?formato=csv')).text();
  assert.ok(csv.includes('Verificação de identidade — Identidade do titular verificada por outro meio'));
  assert.ok(!csv.includes('VERIFICACAO_IDENTIDADE'));
  const { gerarExport } = require('../src/services/exportadores');
  const { linhas } = await gerarExport(db, 'dsar', s.orgA.id);
  assert.ok(linhas.every(l => !l.providencias.includes('VERIFICACAO_IDENTIDADE')), 'linhas do PDF/A');
  // tela: rotulo no frontend
  const front = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'DsarDetail.js');
  if (fs.existsSync(front)) assert.ok(fs.readFileSync(front, 'utf8').includes('rotuloProvidenciaDsar(ev.tipo)'));
});

test('1: e-mail de confirmacao com o prazo no fuso de Sao Paulo (e sem prazo antes da verificacao)', async () => {
  const antes = process.env.EMAIL_TRANSPORTE;
  process.env.EMAIL_TRANSPORTE = 'memoria';
  try {
    // 18/10 01:30 UTC = 17/10 22:30 em Sao Paulo
    await email.enviarConfirmacaoSolicitacao({ to: 't@teste.local', titularNome: 'T', protocolo: 'P-1', dataLimite: new Date('2026-10-18T01:30:00Z'), orgNome: 'Câmara' });
    assert.ok(email.caixaMemoria[email.caixaMemoria.length - 1].text.includes('Prazo para resposta: 17/10/2026'));
    await email.enviarConfirmacaoSolicitacao({ to: 't@teste.local', titularNome: 'T', protocolo: 'P-2', dataLimite: null, orgNome: 'Câmara' });
    const m = email.caixaMemoria[email.caixaMemoria.length - 1].text;
    assert.ok(m.includes('15 dias a partir da verificação') && !m.includes('Invalid'));
  } finally {
    if (antes === undefined) delete process.env.EMAIL_TRANSPORTE; else process.env.EMAIL_TRANSPORTE = antes;
  }
});

test('1: "Oposição" no formulario publico', () => {
  const f = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'SolicitarDireitos.js');
  if (fs.existsSync(f)) assert.ok(fs.readFileSync(f, 'utf8').includes("value: 'OPOSICAO'"));
});

// ---------- 2. Repositorio, historico do documento, Auditor ----------

const enviarArquivo = (token, titulo) => {
  const fd = new FormData();
  fd.append('titulo', titulo);
  fd.append('categoria', 'POLITICA');
  fd.append('arquivo', new Blob([Buffer.from('%PDF-1.4 teste')], { type: 'application/pdf' }), 'politica.pdf');
  return fetch(`${srv.base}/repositorio/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
};

test('2: Gestor envia, exclui (logico, com motivo) e o documento mostra o historico', async () => {
  const g = tokenDe(s.gestorA);
  const doc = await json(await enviarArquivo(g, 'Política interna 7b'));
  assert.ok(doc.id);
  assert.equal((await enviarArquivo(tokenDe(await operador()), 'x')).status, 403, 'Operador não envia');
  assert.equal((await chamar(tokenDe(await operador()), 'DELETE', `/repositorio/documentos/${doc.id}`, { motivo: 'teste' })).status, 403);
  assert.equal((await chamar(g, 'DELETE', `/repositorio/documentos/${doc.id}`, {})).status, 400, 'motivo obrigatório');
  assert.equal((await chamar(g, 'DELETE', `/repositorio/documentos/${doc.id}`, { motivo: 'Versão substituída' })).status, 200);
  const lista = await json(await chamar(g, 'GET', '/repositorio/documentos'));
  assert.ok(!lista.some(d => d.id === doc.id), 'some da lista');
  const excluidos = await json(await chamar(g, 'GET', '/repositorio/documentos?excluidos=1'));
  const ex = excluidos.find(d => d.id === doc.id);
  assert.ok(ex && ex.motivoExclusao === 'Versão substituída' && ex.excluidoPorId === s.gestorA.id);
  assert.ok(db.__tabelas.documentoRepositorio.find(d => d.id === doc.id), 'continua guardado');
  // historico: enviado e excluido, por quem e quando (o Auditor tambem ve)
  const h = await json(await chamar(tokenDe(s.auditorA), 'GET', `/historico?entidade=DOCUMENTO&registroId=${doc.id}`));
  const acoes = h.itens.map(i => i.acao).sort();
  assert.deepEqual(acoes, ['CRIAR', 'EXCLUIR']);
  assert.ok(h.itens.every(i => i.usuarioId === s.gestorA.id && i.criadoEm));
  assert.equal(h.itens.find(i => i.acao === 'EXCLUIR').diff.motivo.depois, 'Versão substituída');
});

test('2: gerador salva em PDF/A pelo mesmo conversor e registra "gerado" no historico', async () => {
  const { gerar } = require('../src/services/geradorDocumentos');
  let chamadas = 0;
  const falsoPdfA = async (pdf, { titulo }) => { chamadas++; assert.ok(titulo); return Buffer.concat([pdf, Buffer.from('\n%PDFA-falso')]); };
  const r = await gerar(db, s.orgA.id, 'politica-privacidade', { usuarioId: s.dpoA.id, converterPdfA: falsoPdfA });
  assert.equal(chamadas, 1);
  assert.equal(r.pdfa, true);
  assert.deepEqual(r.documentos.map(d => d.formato), ['DOCX', 'PDF/A']);
  assert.match(r.documentos[1].nomeArquivo, /-pdfa\.pdf$/);
  const h = db.__tabelas.historicoRegistro.find(x => x.registroId === r.documentos[1].id);
  assert.equal(h.diff.origem.depois, 'Gerado a partir de modelo');
  // sem Ghostscript: PDF comum e o aviso
  const { PdfaIndisponivelError } = require('../src/services/pdfa');
  const r2 = await gerar(db, s.orgA.id, 'politica-privacidade', { usuarioId: s.dpoA.id, converterPdfA: async () => { throw new PdfaIndisponivelError('sem gs'); } });
  assert.equal(r2.pdfa, false);
  assert.deepEqual(r2.documentos.map(d => d.formato), ['DOCX', 'PDF']);
});

test('2: Auditor ve evidencias e historico do checklist, sem escrever', async () => {
  const item = await db.itemChecklist.create({ data: { codigo: 'T-7B', categoria: 'X', titulo: 'x', descricao: 'x', fundamentoLegal: 'x', criticidade: 'MEDIA', evidenciaRequerida: 'DOCUMENTO' } });
  const a = tokenDe(s.auditorA);
  assert.equal((await chamar(a, 'GET', `/anexos?entidade=CHECKLIST_ITEM&registroId=${item.id}`)).status, 200);
  assert.equal((await chamar(a, 'GET', `/historico?entidade=CHECKLIST_ITEM&registroId=${item.id}`)).status, 200);
  assert.equal((await chamar(a, 'POST', `/conformidade/checklist/${item.id}/responder`, { status: 'CONFORME' })).status, 403);
  const front = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'ChecklistPage.js');
  if (fs.existsSync(front)) assert.ok(fs.readFileSync(front, 'utf8').includes("'Evidências e histórico'"));
});

// ---------- 4. CSV ----------

test('4: todo CSV com ";", BOM, datas de Brasilia e rotulos (sem ISO nem codigos)', async () => {
  const g = tokenDe(s.gestorA);
  const ROTAS = ['/ropa/export', '/ropa/descartes/export', '/dsar/export', '/repositorio/incidentes/export', '/conformidade/checklist/export',
    '/inventario/sistemas/export', '/terceiros/export', '/indicadores/export', '/indicadores/snapshots/export', '/treinamento/relatorio'];
  const CODIGOS = /(^|;)(EM_ANALISE|AGUARDANDO_VERIFICACAO|OBRIGACAO_LEGAL|NAO_CONFORME|VERIFICACAO_IDENTIDADE|ENCARREGADO_LGPD|ON_PREMISE|SIMULADO|REAL|ALTA|MEDIA|BAIXA|true|false)(;|$)/m;
  for (const rota of ROTAS) {
    const r = await chamar(g, 'GET', `${rota}?formato=csv`);
    assert.equal(r.status, 200, rota);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf', `${rota}: BOM`);
    const txt = bytes.toString('utf8').slice(1);
    const cab = txt.split('\r\n')[0];
    assert.ok(cab.includes(';') && !/^[a-z]+[A-Z]\w*,/.test(cab), `${rota}: separador ";" e cabeçalho legível: ${cab.slice(0, 80)}`);
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(txt), `${rota}: sem data ISO`);
    assert.ok(!CODIGOS.test(txt), `${rota}: código cru no CSV: ${(txt.match(CODIGOS) || [])[0]}`);
  }
  // todos os exportadores (inclusive historico e usuarios, que saem no pacote de portabilidade)
  const { EXPORTADORES, gerarExport, valorCsv } = require('../src/services/exportadores');
  for (const nome of Object.keys(EXPORTADORES)) {
    const { csv } = await gerarExport(db, nome, s.orgA.id);
    assert.ok(csv.startsWith('﻿') && csv.split('\r\n')[0].includes(';'), nome);
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(csv), `${nome}: sem data ISO`);
    assert.ok(!CODIGOS.test(csv), `${nome}: código cru: ${(csv.match(CODIGOS) || [])[0]}`);
  }
  assert.equal(valorCsv('2026-10-18T01:30:00.000Z', 'datahora'), '17/10/2026 22:30', 'Brasília');
  assert.equal(valorCsv(true), 'Sim');
});

// ---------- 5. Validacoes ----------

test('5: retencao, incidente, art. 33 e CNPJ', async () => {
  const g = tokenDe(s.gestorA);
  const base = { nome: 'Trat 7b', finalidade: 'x', baseLegal: 'OBRIGACAO_LEGAL' };
  assert.equal((await chamar(g, 'POST', '/ropa/tratamentos', { ...base, retencaoDias: -1 })).status, 400);
  assert.equal((await chamar(g, 'POST', '/ropa/tratamentos', { ...base, retencaoDias: 0 })).status, 201);
  const exterior = { terceiroNome: 'Nuvem EUA', finalidadeCompartilhamento: 'Hospedagem', paisDestino: 'Estados Unidos' };
  const r = await chamar(g, 'POST', '/ropa/tratamentos', { ...base, compartilhamentos: [exterior] });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /art\. 33/);
  assert.equal((await chamar(g, 'POST', '/ropa/tratamentos', { ...base, compartilhamentos: [{ ...exterior, baseLegalTransferencia: 'ART33_X' }] })).status, 400, 'inciso inexistente');
  const ok = await json(await chamar(g, 'POST', '/ropa/tratamentos', { ...base, compartilhamentos: [{ ...exterior, baseLegalTransferencia: 'ART33_II' }] }));
  assert.equal(ok.compartilhamentos[0].baseLegalTransferencia, 'ART33_II');
  assert.equal((await chamar(g, 'POST', '/ropa/tratamentos', { ...base, compartilhamentos: [{ terceiroNome: 'Local', finalidadeCompartilhamento: 'x', paisDestino: 'Brasil' }] })).status, 201, 'Brasil não exige');
  assert.equal((await chamar(g, 'POST', '/ropa/tratamentos', { ...base, compartilhamentos: [{ terceiroNome: 'Local', finalidadeCompartilhamento: 'x', terceiroCNPJ: '11.222.333/0001-82' }] })).status, 400, 'CNPJ inválido');
  // CSV mostra a hipotese do art. 33
  const csv = await (await chamar(g, 'GET', '/ropa/export?formato=csv')).text();
  assert.ok(csv.includes('Estados Unidos — Art. 33, II'));

  // incidente
  const inc = { titulo: 'Inc 7b', tipoIncidente: 'PERDA', descricao: 'x' };
  const futuro = require('../src/services/datas').isoDiaSP(dia(2));
  assert.equal((await chamar(g, 'POST', '/repositorio/incidentes', { ...inc, dataOcorrencia: futuro })).status, 400, 'ocorrência futura');
  assert.equal((await chamar(g, 'POST', '/repositorio/incidentes', { ...inc, dataOcorrencia: '2026-10-10', dataCiencia: '2026-10-09' })).status, 400, 'ciência antes da ocorrência');
  assert.equal((await chamar(g, 'POST', '/repositorio/incidentes', { ...inc, dataOcorrencia: '2026-10-10', qtdTitulares: -5 })).status, 400, 'titulares negativos');
  const criado = await json(await chamar(g, 'POST', '/repositorio/incidentes', { ...inc, dataOcorrencia: '2026-10-10', dataCiencia: '2026-10-11', qtdTitulares: 3 }));
  assert.equal(criado.qtdTitulares, 3);
  assert.equal((await chamar(g, 'PUT', `/repositorio/incidentes/${criado.id}`, { dataCiencia: '2026-10-01' })).status, 400, 'edição: ciência antes da ocorrência gravada');
  assert.equal((await chamar(g, 'POST', `/repositorio/incidentes/${criado.id}/providencias`, { descricao: 'x', data: futuro })).status, 400, 'providência futura');

  // CNPJ: terceiro e camara
  assert.ok(cnpjValido('11.222.333/0001-81') && !cnpjValido('11.222.333/0001-82'));
  assert.equal((await chamar(g, 'POST', '/terceiros', { razaoSocial: 'X', cnpj: '11.222.333/0001-82' })).status, 400);
  assert.equal((await chamar(g, 'POST', '/terceiros', { razaoSocial: 'Y', cnpj: '11.222.333/0001-81' })).status, 201);
  const admin = jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const cam = await chamar(admin, 'POST', '/admin/camaras', { nome: 'Câmara CNPJ', cnpj: '11.222.333/0001-82', email: 'cnpj@teste.local', senha: 'senha-de-teste-10', nomeGestor: 'Gestora' });
  assert.equal(cam.status, 400);
});

// ---------- 6. MFA da camara ----------

test('6: Gestor/DPO ligam o MFA obrigatorio da propria camara, com historico', async () => {
  assert.equal((await chamar(tokenDe(await operador()), 'PUT', '/organizacao/mfa-obrigatorio', { mfaObrigatorio: true })).status, 403);
  assert.equal((await chamar(tokenDe(s.auditorA), 'PUT', '/organizacao/mfa-obrigatorio', { mfaObrigatorio: true })).status, 403);
  const r = await json(await chamar(tokenDe(s.dpoA), 'PUT', '/organizacao/mfa-obrigatorio', { mfaObrigatorio: true }));
  assert.equal(r.mfaObrigatorio, true);
  assert.equal(db.__tabelas.organizacao.find(o => o.id === s.orgA.id).mfaObrigatorio, true);
  const h = await json(await chamar(tokenDe(s.gestorA), 'GET', `/historico?entidade=ORGANIZACAO&registroId=${s.orgA.id}`));
  const item = h.itens.find(i => i.diff.mfaObrigatorio);
  assert.deepEqual(item.diff.mfaObrigatorio, { antes: false, depois: true });
  assert.equal(item.usuarioId, s.dpoA.id);
  await chamar(tokenDe(s.gestorA), 'PUT', '/organizacao/mfa-obrigatorio', { mfaObrigatorio: false });
});

// ---------- 8. Indicador do ROPA ----------

test('8: indicador do ROPA mostra os pendentes por falta de setor ou sistema, com o filtro', async () => {
  const g = tokenDe(s.gestorA);
  const r = await json(await chamar(g, 'GET', '/indicadores'));
  const ropa = (r.indicadores || r).find(i => i.chave === 'ROPA');
  const trats = await json(await chamar(g, 'GET', '/ropa/tratamentos'));
  const esperado = trats.filter(t => t.ativo && t.pendenciasMapeamento.some(p => p === 'setor' || p === 'sistemas ou outros meios')).length;
  assert.ok(esperado > 0);
  assert.equal(ropa.pendentesSetorSistema, esperado);
  assert.deepEqual(ropa.linkSetorSistema, { pagina: 'ropa', filtro: 'sem-setor-sistema' });
});

// ---------- 10. Fontes ----------

test('10: frontend sem Google Fonts (fontes hospedadas no proprio site)', (t) => {
  const front = path.join(__dirname, '..', '..', 'frontend');
  if (!fs.existsSync(front)) return t.skip('frontend fora deste checkout');
  for (const f of ['src/index.css', 'public/index.html', 'src/index.js']) {
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(path.join(front, f), 'utf8')), f);
  }
  assert.ok(fs.readFileSync(path.join(front, 'src/index.js'), 'utf8').includes('@fontsource'));
});

test('3: titulo do PDF/A com acento vai em UTF-16BE (o "í" derrubava o Ghostscript)', () => {
  const { pdfaDefPs } = require('../src/services/pdfa');
  const def = pdfaDefPs('/x/srgb.icc', 'Política de Privacidade');
  assert.ok(def.includes('/Title <FEFF0050006F006C00ED'), 'í = 00ED em UTF-16BE');
  assert.ok(!/\/Title \(/.test(def), 'sem texto literal em PDFDocEncoding');
});
