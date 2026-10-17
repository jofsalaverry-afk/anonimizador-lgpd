const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const { lerZip } = require('./helpers/lerZip');
const { converterParaPdfA, statusPdfa, PdfaIndisponivelError } = require('../src/services/pdfa');
const { gerarRelatorioPdf } = require('../src/services/relatoriosPdf');

let srv, s, anexoPdf;
const MARCA_B = 'Fornecedor Exclusivo da Câmara B';

before(async () => {
  srv = await subir();
  s = await semear();
  const A = s.orgA.id;
  // Dados da A em todos os modulos
  await db.solicitacaoTitular.create({ data: { organizacaoId: A, protocolo: 'A-1', titularNome: 'Titular Fictício', titularEmail: 'tit@teste.local', tipoDireito: 'ACESSO', descricao: 'x', status: 'RECEBIDA' } });
  await db.providenciaIncidente.create({ data: { organizacaoId: A, incidenteId: s.incidenteA.id, descricao: 'Senha trocada', data: new Date('2026-10-02'), responsavelId: s.dpoA.id } });
  const terc = await db.terceiro.create({ data: { organizacaoId: A, razaoSocial: 'Hospedagem da A', contratoCritico: true } });
  await db.respostaQuestionarioTerceiro.create({ data: { organizacaoId: A, terceiroId: terc.id, perguntaId: 'SEG1', resposta: 'SIM', respondidoPorId: s.dpoA.id } });
  await db.acaoTerceiro.create({ data: { organizacaoId: A, terceiroId: terc.id, descricao: 'Assinar aditivo', situacao: 'PENDENTE' } });
  await db.sistemaInventario.create({ data: { organizacaoId: A, nome: 'Sistema da A', tipo: 'APLICACAO' } });
  await db.registroDescarte.create({ data: { organizacaoId: A, tratamentoId: s.tratamentoA.id, dataDescarte: new Date('2026-10-01'), descricao: 'Fichas', metodo: 'Trituração' } });
  await db.itemChecklist.create({ data: { codigo: 'ORG-A-1', categoria: 'Atividades próprias', titulo: 'Atividade da A', descricao: '', fundamentoLegal: '', criticidade: 'MEDIA', evidenciaRequerida: 'DOCUMENTO', organizacaoId: A } });
  anexoPdf = Buffer.from('%PDF-1.4 termo de descarte da A');
  await db.anexo.create({ data: {
    organizacaoId: A, entidade: 'TRATAMENTO', registroId: s.tratamentoA.id, nomeArquivo: 'evidência.pdf', mimeType: 'application/pdf',
    tamanho: anexoPdf.length, conteudo: anexoPdf, hashSha256: crypto.createHash('sha256').update(anexoPdf).digest('hex'), enviadoPorId: s.gestorA.id
  } });
  // Dado da B que nunca pode aparecer na exportacao da A
  await db.terceiro.create({ data: { organizacaoId: s.orgB.id, razaoSocial: MARCA_B } });
  await db.anexo.create({ data: {
    organizacaoId: s.orgB.id, entidade: 'TERCEIRO', registroId: 'x', nomeArquivo: 'segredo-b.pdf', mimeType: 'application/pdf',
    tamanho: 4, conteudo: Buffer.from('%PDF'), hashSha256: 'x', enviadoPorId: s.gestorB.id
  } });
});
after(async () => { await srv.fechar(); });

const get = (token, caminho) => fetch(`${srv.base}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });

const ROTAS = [
  ['/dsar/export', 'A-1'],
  ['/repositorio/incidentes/export', 'Senha trocada'],
  ['/conformidade/checklist/export', 'Atividade da A'],
  ['/inventario/sistemas/export', 'Sistema da A'],
  ['/terceiros/export', 'Assinar aditivo'],
  ['/ropa/descartes/export', 'Trituração']
];

test('exportacoes CSV e JSON de cada modulo, isoladas por organizacao', async () => {
  const tA = tokenDe(s.gestorA);
  const tB = tokenDe(s.gestorB);
  for (const [rota, marca] of ROTAS) {
    const csv = await get(tA, `${rota}?formato=csv`);
    assert.equal(csv.status, 200, rota);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const bytes = Buffer.from(await csv.arrayBuffer());
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf', `${rota}: CSV com BOM (Excel)`);
    const txt = bytes.toString('utf8');
    assert.ok(txt.includes(marca), `${rota}: CSV traz dados da A`);
    const json = await get(tA, `${rota}?formato=json`);
    assert.equal(json.status, 200);
    assert.ok(JSON.stringify(await json.json()).includes(marca), `${rota}: JSON traz dados da A`);

    const daB = await (await get(tB, `${rota}?formato=json`)).text();
    assert.ok(!daB.includes(marca), `${rota}: B nao ve dados da A`);
  }
  // indicadores: isolamento pelos numeros (os nomes dos indicadores sao iguais)
  const indA = await (await get(tA, '/indicadores/export?formato=json')).json();
  const indB = await (await get(tB, '/indicadores/export?formato=json')).json();
  const contratos = r => r.indicadores.find(i => i.chave === 'CONTRATOS');
  assert.equal(contratos(indA).total, 1);
  assert.equal(contratos(indB).total, 0);
  const indCsv = await (await get(tA, '/indicadores/export?formato=csv')).text();
  assert.ok(indCsv.includes(';Contratos críticos com aditivo;0;1;0;100;Pendente;'), 'rotulos no CSV');
  assert.ok(indCsv.split('\r\n')[0].includes(';'), 'separador ponto e virgula');

  const tercCsv = await (await get(tA, '/terceiros/export?formato=csv')).text();
  assert.ok(tercCsv.includes('SEG1 — Sim'), 'respostas do questionario no CSV, com rotulo');
  const incCsv = await (await get(tA, '/repositorio/incidentes/export?formato=csv')).text();
  assert.ok(incCsv.includes('02/10/2026 — Senha trocada (DPO A)'), 'providencias no CSV');
});

test('exportacao de DSAR restrita (dados de titulares)', async () => {
  const treinando = await db.usuario.create({ data: { email: 'tr@teste.local', senhaHash: 'x', nome: 'Treinando', perfil: 'TREINANDO', ativo: true, organizacaoId: s.orgA.id } });
  assert.equal((await get(tokenDe(treinando), '/dsar/export?formato=csv')).status, 403);
  assert.equal((await get(tokenDe(s.auditorA), '/dsar/export?formato=csv')).status, 200, 'auditor exporta');
});

test('pacote de portabilidade: modulos, anexos, dicionario, guia e manifesto', async () => {
  assert.equal((await get(tokenDe(s.auditorA), '/portabilidade/pacote')).status, 403);
  const r = await get(tokenDe(s.gestorA), '/portabilidade/pacote');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  const zip = lerZip(Buffer.from(await r.arrayBuffer()));
  const nomes = Object.keys(zip);

  for (const base of ['ropa-tratamentos', 'ropa-descartes', 'dsar-solicitacoes', 'incidentes', 'checklist-conformidade', 'inventario-sistemas',
    'terceiros-operadores', 'setores', 'treinamento-progresso', 'usuarios', 'historico-alteracoes', 'indicadores-snapshots']) {
    assert.ok(nomes.includes(`${base}.csv`), `${base}.csv`);
    assert.ok(nomes.includes(`${base}.json`), `${base}.json`);
    JSON.parse(zip[`${base}.json`].toString('utf8'));
  }
  for (const f of ['dicionario-de-dados.md', 'guia-de-importacao.md', 'manifesto.json', 'anexos/indice-anexos.csv', 'documentos/indice-documentos.csv']) {
    assert.ok(nomes.includes(f), f);
  }

  // anexo com nome UTF-8 e bytes identicos
  const caminhoAnexo = nomes.find(n => n.startsWith(`anexos/TRATAMENTO/${s.tratamentoA.id}/`) && n.endsWith('evidência.pdf'));
  assert.ok(caminhoAnexo);
  assert.deepEqual(zip[caminhoAnexo], anexoPdf);

  // dicionario descreve os campos; manifesto confere com o conteudo
  const dic = zip['dicionario-de-dados.md'].toString('utf8');
  assert.ok(dic.includes('## dsar-solicitacoes.csv') && dic.includes('| Prazo legal (data e hora de Brasília) | `dataLimite` |'));
  const manifesto = JSON.parse(zip['manifesto.json'].toString('utf8'));
  for (const a of manifesto.arquivos) {
    assert.equal(crypto.createHash('sha256').update(zip[a.caminho]).digest('hex'), a.sha256, `hash de ${a.caminho}`);
  }
  assert.equal(manifesto.anexos, 1);

  // nada da organizacao B
  const tudo = Object.values(zip).map(b => b.toString('utf8')).join('\n');
  assert.ok(!tudo.includes(MARCA_B));
  assert.ok(!nomes.some(n => n.includes('segredo-b')));
  // sem segredos de login
  assert.ok(!tudo.includes('senhaHash') && !tudo.includes('mfaSecret'));
});

test('PDF/A: relatorio gerado, conversao com argumentos de PDF/A-2b e OutputIntent sRGB', async () => {
  const { pdf, titulo } = await gerarRelatorioPdf(db, 'ropa', s.orgA.id);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');

  let visto;
  const saida = await converterParaPdfA(pdf, {
    titulo,
    executar: async (args, arquivos) => {
      visto = { args, def: require('fs').readFileSync(arquivos.defPs, 'utf8') };
      require('fs').writeFileSync(arquivos.saida, Buffer.from('%PDF-1.7 convertido'));
    }
  });
  assert.equal(saida.toString(), '%PDF-1.7 convertido');
  for (const a of ['-dPDFA=2', '-dPDFACompatibilityPolicy=1', '-sDEVICE=pdfwrite', '-sColorConversionStrategy=RGB']) {
    assert.ok(visto.args.includes(a), a);
  }
  assert.match(visto.def, /\/S \/GTS_PDFA1/);
  assert.match(visto.def, /\/OutputConditionIdentifier \(sRGB IEC61966-2\.1\)/);
  assert.match(visto.def, /\/Title \(Registro das Operações de Tratamento \\\(ROPA\\\)\)/);
});

test('PDF/A sem Ghostscript: erro claro (503) e o resto segue funcionando', async (t) => {
  if (statusPdfa().disponivel) return t.skip('Ghostscript instalado nesta máquina');
  await assert.rejects(converterParaPdfA(Buffer.from('%PDF')), PdfaIndisponivelError);
  const r = await get(tokenDe(s.gestorA), '/relatorios/ropa/pdfa');
  assert.equal(r.status, 503);
  assert.match((await r.json()).erro, /Ghostscript não está instalado/);
  assert.equal((await get(tokenDe(s.gestorA), '/indicadores')).status, 200);
  assert.equal((await get(tokenDe(s.gestorA), '/relatorios/xpto/pdfa')).status, 404);
});
