// Etapa 6d: MFA — troca de autenticador exige codigo, desativar com codigo
// ou senha, zerar MFA de outro usuario (Gestor/DPO e Admin), historico e
// encerramento de sessoes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { db, subir, semear, tokenDe } = require('./helpers/app');

let srv, s;
before(async () => { srv = await subir(); s = await semear(); });
after(async () => { await srv.fechar(); });

const chamar = (token, metodo, caminho, body) => fetch(`${srv.base}${caminho}`, {
  method: metodo,
  headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json' },
  ...(body !== undefined && { body: JSON.stringify(body) })
});
const totp = secret => speakeasy.totp({ secret, encoding: 'base32' });
const codigoErrado = secret => { const c = totp(secret); return c === '000000' ? '111111' : '000000'; };
const usuario = id => db.__tabelas.usuario.find(u => u.id === id);
const historicoDe = id => db.__tabelas.historicoRegistro.filter(h => h.entidade === 'USUARIO' && h.registroId === id);
const admin = () => jwt.sign({ id: 'adm', email: 'admin@teste.local', isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '5m' });

// Ativa o MFA de um usuario pelo fluxo normal; devolve o segredo
async function ativarMfa(u) {
  const t = tokenDe(u, { sv: usuario(u.id)?.sessaoVersao || 0 }); // sessao atual do usuario
  const cfg = await (await chamar(t, 'POST', '/auth/mfa/configurar', {})).json();
  assert.equal((await chamar(t, 'POST', '/auth/mfa/ativar', { codigo: totp(cfg.secret) })).status, 200);
  return cfg.secret;
}

test('1: com MFA ativo, configurar sem codigo valido e recusado e nada muda', async () => {
  const segredo = await ativarMfa(s.dpoA);
  const antes = { ...usuario(s.dpoA.id) };
  const t = tokenDe(s.dpoA);
  for (const corpo of [{}, { codigo: codigoErrado(segredo) }, { codigo: 'abc' }]) {
    const r = await chamar(t, 'POST', '/auth/mfa/configurar', corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.ok(!(await r.json()).secret, 'não devolve segredo');
  }
  const depois = usuario(s.dpoA.id);
  assert.equal(depois.mfaSecret, antes.mfaSecret, 'segredo não mudou');
  assert.equal(depois.mfaAtivo, true, 'MFA continua ativo');
  assert.ok(!depois.mfaSecretPendente);

  // com o codigo atual: segredo novo fica pendente; o atual segue valendo
  const r = await (await chamar(t, 'POST', '/auth/mfa/configurar', { codigo: totp(segredo) })).json();
  assert.ok(r.secret && r.secret !== segredo);
  assert.equal(usuario(s.dpoA.id).mfaSecret, segredo);
  assert.equal(usuario(s.dpoA.id).mfaAtivo, true);
  // confirma o novo aparelho: troca
  assert.equal((await chamar(t, 'POST', '/auth/mfa/ativar', { codigo: totp(r.secret) })).status, 200);
  assert.equal(usuario(s.dpoA.id).mfaSecret, r.secret);
  assert.equal(usuario(s.dpoA.id).mfaSecretPendente, null);
  const h = historicoDe(s.dpoA.id).map(x => x.diff.mfa?.depois);
  assert.deepEqual(h, ['ativo', 'ativo (autenticador trocado)']);
});

test('2: desativar exige codigo ou senha e sempre responde com mensagem', async () => {
  const u = await db.usuario.create({ data: { email: 'des@teste.local', senhaHash: await bcrypt.hash('senha-certa-123', 4), nome: 'Des', perfil: 'OPERADOR', ativo: true, mfaAtivo: false, organizacaoId: s.orgA.id } });
  const segredo = await ativarMfa(u);
  const t = tokenDe(u);
  const casos = [[{}, /código do autenticador ou a sua senha/], [{ codigo: '12' }, /6 dígitos/], [{ codigo: codigoErrado(segredo) }, /Código inválido/], [{ senha: 'errada' }, /Senha incorreta/]];
  for (const [corpo, msg] of casos) {
    const r = await chamar(t, 'PUT', '/auth/mfa/desativar', corpo);
    assert.equal(r.status, 400);
    assert.match((await r.json()).erro, msg);
  }
  assert.equal(usuario(u.id).mfaAtivo, true, 'nada mudou');
  const ok = await chamar(t, 'PUT', '/auth/mfa/desativar', { senha: 'senha-certa-123' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).mensagem, 'MFA desativado.');
  assert.equal(usuario(u.id).mfaAtivo, false);
  assert.equal(usuario(u.id).mfaSecret, null);
  const ult = historicoDe(u.id).pop();
  assert.deepEqual(ult.diff.mfa, { antes: 'ativo', depois: 'inativo' });
  assert.equal(ult.diff.confirmadoCom.depois, 'senha');
  assert.equal(ult.usuarioId, u.id);

  // com codigo tambem desativa
  const seg2 = await ativarMfa(u);
  assert.equal((await chamar(t, 'PUT', '/auth/mfa/desativar', { codigo: totp(seg2) })).status, 200);
  assert.equal(historicoDe(u.id).pop().diff.confirmadoCom.depois, 'código do autenticador');
});

test('3: Gestor/DPO zeram MFA de outro usuario da propria camara, com motivo, e encerram as sessoes', async () => {
  const alvo = await db.usuario.create({ data: { email: 'alvo@teste.local', senhaHash: 'x', nome: 'Alvo', perfil: 'OPERADOR', ativo: true, mfaAtivo: false, organizacaoId: s.orgA.id } });
  await ativarMfa(alvo);
  // sessao aberta do alvo, emitida pelo login (com versao)
  const sessaoAlvo = tokenDe(alvo, { sv: 0 });
  assert.equal((await chamar(sessaoAlvo, 'GET', '/usuarios')).status, 200);

  const g = tokenDe(s.gestorA);
  assert.equal((await chamar(g, 'POST', `/usuarios/${s.gestorA.id}/mfa/zerar`, { motivo: 'perdi o celular' })).status, 400, 'nunca a si mesmo');
  assert.equal((await chamar(tokenDe(s.gestorB), 'POST', `/usuarios/${alvo.id}/mfa/zerar`, { motivo: 'outra câmara' })).status, 404, 'outra câmara');
  assert.equal((await chamar(tokenDe(s.auditorA), 'POST', `/usuarios/${alvo.id}/mfa/zerar`, { motivo: 'sem permissão' })).status, 403, 'auditor não zera');
  assert.equal((await chamar(g, 'POST', `/usuarios/${alvo.id}/mfa/zerar`, {})).status, 400, 'motivo obrigatório');
  assert.equal((await chamar(g, 'POST', `/usuarios/${alvo.id}/mfa/zerar`, { motivo: ' ' })).status, 400);
  assert.equal(usuario(alvo.id).mfaAtivo, true, 'nada mudou ainda');

  const r = await chamar(g, 'POST', `/usuarios/${alvo.id}/mfa/zerar`, { motivo: 'Perdeu o celular' });
  assert.equal(r.status, 200);
  assert.match((await r.json()).mensagem, /sessões abertas/);
  const u = usuario(alvo.id);
  assert.equal(u.mfaAtivo, false);
  assert.equal(u.mfaSecret, null);
  assert.equal(u.sessaoVersao, 1);
  // sessao antiga encerrada (rotas de modulo e /auth/me)
  assert.equal((await chamar(sessaoAlvo, 'GET', '/usuarios')).status, 401);
  assert.equal((await chamar(sessaoAlvo, 'GET', '/auth/me')).status, 401);
  assert.equal((await chamar(tokenDe(alvo, { sv: 1 }), 'GET', '/usuarios')).status, 200, 'sessão nova vale');
  // historico: quem zerou, de quem e o motivo
  const h = historicoDe(alvo.id).pop();
  assert.equal(h.usuarioId, s.gestorA.id);
  assert.equal(h.registroId, alvo.id);
  assert.equal(h.diff.motivo.depois, 'Perdeu o celular');
  assert.equal(h.diff.mfa.depois, 'zerado (sessões encerradas)');
  // sem MFA: nada a zerar
  assert.equal((await chamar(g, 'POST', `/usuarios/${alvo.id}/mfa/zerar`, { motivo: 'de novo' })).status, 400);
  // DPO tambem pode
  await ativarMfa(alvo);
  assert.equal((await chamar(tokenDe(s.dpoA), 'POST', `/usuarios/${alvo.id}/mfa/zerar`, { motivo: 'teste DPO' })).status, 200);
});

test('3: Admin zera MFA de usuario de qualquer camara, com motivo no historico', async () => {
  const alvoB = await db.usuario.create({ data: { email: 'alvob@teste.local', senhaHash: 'x', nome: 'Alvo B', perfil: 'OPERADOR', ativo: true, mfaAtivo: false, organizacaoId: s.orgB.id } });
  await ativarMfa(alvoB);
  assert.equal((await chamar(admin(), 'POST', `/admin/usuarios/${alvoB.id}/mfa/zerar`, {})).status, 400, 'motivo obrigatório');
  assert.equal((await chamar(null, 'POST', `/admin/usuarios/${alvoB.id}/mfa/zerar`, { motivo: 'x y z' })).status, 401);
  const r = await chamar(admin(), 'POST', `/admin/usuarios/${alvoB.id}/mfa/zerar`, { motivo: 'Pedido da câmara B' });
  assert.equal(r.status, 200);
  assert.equal(usuario(alvoB.id).mfaAtivo, false);
  const h = historicoDe(alvoB.id).pop();
  assert.equal(h.usuarioId, null);
  assert.equal(h.organizacaoId, s.orgB.id);
  assert.equal(h.diff.alteradoPorAdmin.depois, 'admin@teste.local');
  assert.equal(h.diff.motivo.depois, 'Pedido da câmara B');
});

test('4: Admin liga/desliga "MFA obrigatório": fica no historico da camara', async () => {
  for (const v of [true, false]) {
    assert.equal((await chamar(admin(), 'PATCH', `/admin/camaras/${s.orgA.id}/mfa-obrigatorio`, { mfaObrigatorio: v })).status, 200);
  }
  const h = db.__tabelas.historicoRegistro.filter(x => x.entidade === 'ORGANIZACAO' && x.registroId === s.orgA.id && x.diff.mfaObrigatorio);
  assert.deepEqual(h.map(x => x.diff.mfaObrigatorio), [{ antes: false, depois: true }, { antes: true, depois: false }]);
  assert.ok(h.every(x => x.diff.alteradoPorAdmin.depois === 'admin@teste.local'));
  // sem mudanca real: nao registra
  await chamar(admin(), 'PATCH', `/admin/camaras/${s.orgA.id}/mfa-obrigatorio`, { mfaObrigatorio: false });
  assert.equal(db.__tabelas.historicoRegistro.filter(x => x.entidade === 'ORGANIZACAO' && x.diff.mfaObrigatorio).length, 2);
});

test('4: nenhum segredo TOTP no historico', () => {
  const segredos = db.__tabelas.usuario.flatMap(u => [u.mfaSecret, u.mfaSecretPendente]).filter(Boolean);
  const tudo = JSON.stringify(db.__tabelas.historicoRegistro);
  assert.ok(!/mfaSecret/.test(tudo));
  for (const sg of segredos) assert.ok(!tudo.includes(sg));
});
