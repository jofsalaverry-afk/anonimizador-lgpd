const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, subir, semear, tokenDe } = require('./helpers/app');
const { lerZip } = require('./helpers/lerZip');
const { MODELOS } = require('../src/modelos-documentos');

let srv, s, terceiroA, terceiroB;
before(async () => {
  srv = await subir();
  s = await semear();
  await db.organizacao.update({ where: { id: s.orgA.id }, data: {
    nome: 'Câmara Municipal de Teste', cnpj: '11.222.333/0001-44', slug: 'camara-teste', municipio: 'Cidade Fictícia', uf: 'RS',
    enderecoSede: 'Rua das Flores, 100 — Centro', encarregadoNome: 'Encarregada Fictícia', encarregadoEmail: 'lgpd@teste.local', encarregadoTelefone: '(51) 0000-0000'
  } });
  await db.tratamento.update({ where: { id: s.tratamentoA.id }, data: { categoriasDados: ['Nome', 'CPF'], retencaoDias: 1825, formaDescarte: 'Trituração' } });
  await db.compartilhamentoTratamento.create({ data: { tratamentoId: s.tratamentoA.id, terceiroNome: 'Nuvem Estrangeira Inc.', finalidadeCompartilhamento: 'Hospedagem', paisDestino: 'Estados Unidos' } });
  terceiroA = await db.terceiro.create({ data: { organizacaoId: s.orgA.id, razaoSocial: 'Sistemas Fictícios Ltda', cnpj: '55.666.777/0001-88', descricaoServico: 'locação do sistema de folha de pagamento' } });
  terceiroB = await db.terceiro.create({ data: { organizacaoId: s.orgB.id, razaoSocial: 'Terceiro da B', cnpj: '1', descricaoServico: 'x' } });
});
after(async () => { await srv.fechar(); });

function chamar(token, metodo, caminho, body) {
  return fetch(`${srv.base}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) })
  });
}
const SOBRAS = [/\[PREENCHER/, /\{/, /\}/, /undefined/, /\bnull\b/, /NaN/, /\[object/];

test('cada minuta com dados completos: sem variavel sobrando e com marca de minuta', async () => {
  const t = tokenDe(s.dpoA);
  for (const m of MODELOS) {
    const r = await chamar(t, 'POST', `/gerador/modelos/${m.id}/previa`, m.precisaTerceiro ? { terceiroId: terceiroA.id } : {});
    assert.equal(r.status, 200, m.id);
    const { texto, pendencias } = await r.json();
    assert.deepEqual(pendencias, [], `${m.id}: sem pendências`);
    for (const re of SOBRAS) assert.ok(!re.test(texto), `${m.id}: sobrou ${re}`);
    assert.ok(texto.startsWith('MINUTA — sujeita à revisão jurídica'), `${m.id}: marca de minuta`);
    assert.ok(texto.includes('Câmara Municipal de Teste') || texto.includes('Cidade Fictícia'), `${m.id}: dados da organização`);
  }
});

test('conteudo puxado do ROPA, do encarregado e do terceiro', async () => {
  const t = tokenDe(s.dpoA);
  const priv = await (await chamar(t, 'POST', '/gerador/modelos/politica-privacidade/previa', {})).json();
  assert.ok(priv.texto.includes('Folha de pagamento | Pagar servidores | Art. 7º, II — Cumprimento de obrigação legal ou regulatória pelo controlador | Nome, CPF'));
  assert.ok(priv.texto.includes('Nuvem Estrangeira Inc. | Hospedagem | Estados Unidos'));
  assert.ok(priv.texto.includes('art. 33 da LGPD'), 'aviso de transferência internacional');
  assert.ok(priv.texto.includes('Encarregada Fictícia — e-mail lgpd@teste.local'));
  assert.ok(priv.texto.includes('https://anonimizadorldpd.com/#solicitar/camara-teste'));

  const ret = await (await chamar(t, 'POST', '/gerador/modelos/politica-retencao-descarte/previa', {})).json();
  assert.ok(ret.texto.includes('Folha de pagamento | 5 ano(s) | Trituração'));

  const adit = await (await chamar(t, 'POST', '/gerador/modelos/aditivo-lgpd/previa', { terceiroId: terceiroA.id })).json();
  assert.ok(adit.texto.includes('Sistemas Fictícios Ltda, inscrita no CNPJ sob o nº 55.666.777/0001-88'));
  assert.ok(adit.texto.includes('locação do sistema de folha de pagamento'));
  assert.equal(adit.titulo, 'Termo Aditivo de Proteção de Dados (LGPD) — Sistemas Fictícios Ltda');
});

test('dados faltando viram pendencia visivel (nao texto vazio)', async () => {
  const t = tokenDe(s.gestorB);
  const r = await (await chamar(t, 'POST', '/gerador/modelos/politica-privacidade/previa', {})).json();
  for (const p of ['nome do encarregado', 'e-mail do encarregado', 'endereço da sede', 'município/UF']) {
    assert.ok(r.pendencias.includes(p), p);
    assert.ok(r.texto.includes(`[PREENCHER: ${p}]`), p);
  }
  assert.ok(r.pendencias.some(p => p.startsWith('tratamentos do ROPA')));
});

test('aditivo exige terceiro da propria organizacao; permissao', async () => {
  const t = tokenDe(s.dpoA);
  assert.equal((await chamar(t, 'POST', '/gerador/modelos/aditivo-lgpd/previa', {})).status, 400);
  assert.equal((await chamar(t, 'POST', '/gerador/modelos/aditivo-lgpd/previa', { terceiroId: terceiroB.id })).status, 400);
  assert.equal((await chamar(t, 'POST', '/gerador/modelos/nao-existe/previa', {})).status, 404);
  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', '/gerador/modelos/politica-privacidade/gerar', {})).status, 403);
});

test('gerar salva DOCX e PDF no repositorio, com versao, categoria e historico', async () => {
  const t = tokenDe(s.dpoA);
  const r1 = await chamar(t, 'POST', '/gerador/modelos/politica-privacidade/gerar', {});
  assert.equal(r1.status, 201);
  const g1 = await r1.json();
  assert.equal(g1.versao, 1);
  assert.deepEqual(g1.documentos.map(d => d.formato), ['DOCX', 'PDF']);

  const docs = db.__tabelas.documentoRepositorio.filter(d => g1.documentos.some(x => x.id === d.id));
  assert.ok(docs.every(d => d.tipo === 'POLITICA_PRIVACIDADE' && d.status === 'RASCUNHO' && d.organizacaoId === s.orgA.id && d.autorId === s.dpoA.id));
  const docx = docs.find(d => d.nomeArquivo.endsWith('.docx'));
  const pdf = docs.find(d => d.nomeArquivo.endsWith('.pdf'));
  assert.equal(Buffer.from(pdf.arquivo).subarray(0, 5).toString(), '%PDF-');
  const partes = lerZip(Buffer.from(docx.arquivo));
  const header = Object.entries(partes).find(([n]) => /word\/header\d*\.xml$/.test(n));
  assert.ok(header && header[1].toString('utf8').includes('MINUTA — sujeita à revisão jurídica'), 'marca no cabeçalho do DOCX');
  assert.ok(partes['word/document.xml'].toString('utf8').includes('Pagar servidores'));

  const g2 = await (await chamar(t, 'POST', '/gerador/modelos/politica-privacidade/gerar', {})).json();
  assert.equal(g2.versao, 2, 'nova geração = nova versão');
  const adit = await (await chamar(t, 'POST', '/gerador/modelos/aditivo-lgpd/gerar', { terceiroId: terceiroA.id })).json();
  assert.equal(adit.versao, 1, 'versão conta por modelo e terceiro');
  assert.ok(db.__tabelas.documentoRepositorio.find(d => d.id === adit.documentos[0].id).tipo === 'ADITIVO');

  const h = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'DOCUMENTO' && x.registroId === docx.id);
  assert.equal(h.length, 1);
  assert.equal(h[0].usuarioId, s.dpoA.id, 'histórico registra quem gerou');
  assert.deepEqual(h[0].diff.modelo, { antes: null, depois: 'Política de Privacidade' });

  // download pelo repositorio: so a propria organizacao
  assert.equal((await chamar(tokenDe(s.gestorA), 'GET', `/repositorio/documentos/${docx.id}/download`)).status, 200);
  assert.equal((await chamar(tokenDe(s.gestorB), 'GET', `/repositorio/documentos/${docx.id}/download`)).status, 404);
});
