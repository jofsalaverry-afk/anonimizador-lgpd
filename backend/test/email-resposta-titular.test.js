const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tplRespostaTitular } = require('../src/services/emailService');
const { preencherModelo } = require('../src/services/modeloResposta');
const MODELOS = require('../src/data/modelosDsar');

const ENC = { nome: 'Ricardo Almeida Fontes', email: 'encarregado@camara.example', telefone: '(51) 3555-0100' };

// Texto de um modelo real, preenchido e sem a linha MINUTA (como sai da tela)
function respostaDoModelo() {
  const texto = preencherModelo(MODELOS[0].conteudo, {
    nome_titular: 'Laura', protocolo: 'CMD-2026-0001', nome_organizacao: 'Câmara Demo',
    encarregado_nome: ENC.nome, encarregado_email: ENC.email, encarregado_telefone: ENC.telefone
  });
  return texto.split('\n').filter(l => !/MINUTA/.test(l)).join('\n');
}

const conta = (s, re) => (s.match(re) || []).length;

test('e-mail de resposta: rodape do encarregado chega sem a linha "—" que o Gmail esconde como assinatura', () => {
  const resposta = respostaDoModelo();
  assert.match(resposta, /^—$/m, 'o modelo tem a linha separadora');
  const { text, html } = tplRespostaTitular({ titularNome: 'Laura', protocolo: 'CMD-2026-0001', respostaTexto: resposta, orgNome: 'Câmara Demo', encarregado: ENC });
  for (const corpo of [text, html]) {
    assert.ok(corpo.includes(`Encarregado pelo tratamento de dados pessoais: ${ENC.nome}`));
    assert.ok(corpo.includes(ENC.email) && corpo.includes(ENC.telefone));
    assert.doesNotMatch(corpo, /^[ \t]*(—|–|-{2,})[ \t]*$/m, 'nenhuma linha so com traco');
  }
});

test('e-mail de resposta: aviso da ANPD aparece uma vez so', () => {
  const resposta = respostaDoModelo();
  const r1 = tplRespostaTitular({ titularNome: 'Laura', protocolo: 'P', respostaTexto: resposta, orgNome: 'Câmara Demo', encarregado: ENC });
  assert.equal(conta(r1.text, /ANPD/g), 1, 'modelo ja tem o aviso: o automatico nao entra');
  assert.equal(conta(r1.html, /ANPD/g), 1);
  const r2 = tplRespostaTitular({ titularNome: 'Laura', protocolo: 'P', respostaTexto: 'Seus dados seguem em anexo.', orgNome: 'Câmara Demo', encarregado: ENC });
  assert.equal(conta(r2.text, /ANPD/g), 1, 'texto livre: entra o aviso automatico');
  assert.equal(conta(r2.html, /ANPD/g), 1);
  assert.ok(r2.text.includes(`Encarregado pelo tratamento de dados pessoais: ${ENC.nome}`), 'texto livre ganha a identificacao do encarregado');
});
