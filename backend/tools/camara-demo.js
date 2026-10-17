// Cria a CAMARA DE DEMONSTRACAO da prova de conceito (edital 6.5.1.1:
// "ambiente previamente populado com massa de dados ficticios em volume
// suficiente para a geracao e visualizacao dos relatorios e indicadores").
//
// Usa SO a API da plataforma (login do Admin e, depois, dos usuarios da
// camara). Nao toca no banco diretamente. Idempotente: se a camara ja
// existir, para e avisa, sem duplicar nada.
//
// Uso (na pasta backend):
//   node tools/camara-demo.js
// O script pergunta o endereco da API, o e-mail e a senha do Admin (a senha
// nao aparece na tela). Tambem aceita DEMO_API, DEMO_ADMIN_EMAIL e
// DEMO_ADMIN_SENHA no ambiente.
//
// As senhas dos 5 usuarios sao geradas na hora e gravadas SO no arquivo
// DEMO_CREDENCIAIS (padrao: Downloads\complidata-poc\demo-credenciais.txt),
// nunca impressas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const PDFDocument = require('pdfkit');
const TRILHAS = require('../src/data/trilhasTreinamento');

const NOME_CAMARA = 'Câmara Municipal de Demonstração';
const ARQ_CRED = process.env.DEMO_CREDENCIAIS || path.join(os.homedir(), 'Downloads', 'complidata-poc', 'demo-credenciais.txt');
const TODOS_MODULOS = ['anonimizador', 'ropa', 'dsar', 'repositorio', 'treinamento', 'checklist', 'pesquisa', 'inventario', 'terceiros'];

// ---------- utilitarios ----------

let API = '';
const log = (...a) => console.log(...a);
class FalhaDemo extends Error {}

async function api(metodo, rota, { token, body, form } = {}, esperado = [200, 201]) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${rota}`, { method: metodo, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { /* nao JSON */ }
  if (![].concat(esperado).includes(r.status)) {
    throw new FalhaDemo(`${metodo} ${rota.replace(/[a-z0-9]{20,}/g, ':id')} respondeu ${r.status}: ${(json && (json.erro || json.message)) || 'sem mensagem'}`);
  }
  return json;
}

// Data (AAAA-MM-DD) em Sao Paulo, n dias a partir de hoje
const dia = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + n * 86400000));
const senhaNova = () => 'Demo-' + crypto.randomBytes(12).toString('base64url');

// CNPJ ficticio com digito verificador (raiz 12.345.678, a do exemplo classico)
function cnpjFicticio(filial) {
  const d = `12345678${String(filial).padStart(4, '0')}`.split('').map(Number);
  const dv = n => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = p.reduce((s, x, i) => s + x * d[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  d.push(dv(12)); d.push(dv(13));
  const s = d.join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

// PDF simples com aparencia de documento (evidencias e anexos)
const pdf = (titulo, linhas) => new Promise(res => {
  const d = new PDFDocument({ margin: 60 }); const p = [];
  d.on('data', b => p.push(b)); d.on('end', () => res(Buffer.concat(p)));
  d.fontSize(9).fillColor('#555').text(NOME_CAMARA + ' — Cidade Demo/RS').moveDown(1.5);
  d.fontSize(15).fillColor('#000').text(titulo).moveDown();
  d.fontSize(11); for (const l of linhas) d.text(l).moveDown(0.6);
  d.moveDown(2).fontSize(9).fillColor('#555').text(`Documento de demonstração gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`);
  d.end();
});
async function anexar(token, entidade, registroId, nomeArquivo, titulo, linhas) {
  const fd = new FormData();
  fd.append('entidade', entidade); fd.append('registroId', registroId);
  fd.append('arquivo', new Blob([await pdf(titulo, linhas)], { type: 'application/pdf' }), nomeArquivo);
  return api('POST', '/anexos', { token, form: fd }, 201);
}

function perguntar(texto, { oculto = false } = {}) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) rl._writeToOutput = s => { if (s.includes(texto)) process.stdout.write(texto); };
    rl.question(texto, v => { rl.close(); if (oculto) process.stdout.write('\n'); res(v.trim()); });
  });
}

// ---------- dados ficticios ----------

const USUARIOS = [
  { chave: 'GESTOR', perfil: 'GESTOR', nome: 'Helena Martins Prado', email: 'jofsalaverry+demo-gestor@gmail.com' },
  { chave: 'DPO', perfil: 'ENCARREGADO_LGPD', nome: 'Ricardo Almeida Fontes', email: 'jofsalaverry+demo-dpo@gmail.com' },
  { chave: 'OPERADOR', perfil: 'OPERADOR', nome: 'Juliana Costa Ribeiro', email: 'jofsalaverry+demo-operador@gmail.com' },
  { chave: 'AUDITOR', perfil: 'AUDITOR', nome: 'Marcos Vinícius Teles', email: 'jofsalaverry+demo-auditor@gmail.com' },
  { chave: 'TREINANDO', perfil: 'TREINANDO', nome: 'Patrícia Nogueira Lins', email: 'jofsalaverry+demo-treinando@gmail.com' }
];

const SETORES = ['Gabinete da Presidência', 'Recursos Humanos', 'Secretaria Legislativa', 'Protocolo e Arquivo', 'Comunicação Social', 'Ouvidoria', 'Licitações e Contratos', 'Tecnologia da Informação'];

const TERCEIROS = [
  { razaoSocial: 'Nuvem Sul Tecnologia Ltda', papel: 'OPERADOR', descricaoServico: 'Hospedagem em nuvem do sistema de protocolo e do portal', contratoVigente: true, contratoCritico: true, aditivoLgpdAssinado: true, dataAditivo: -120, contatoNome: 'Fernanda Lopes', perfil: 'SIM' },
  { razaoSocial: 'Folha Certa Serviços de Gestão de Pessoas Ltda', papel: 'OPERADOR', descricaoServico: 'Processamento da folha de pagamento e do eSocial', contratoVigente: true, contratoCritico: true, aditivoLgpdAssinado: true, dataAditivo: -200, contatoNome: 'André Queiroz', perfil: 'SIM' },
  { razaoSocial: 'Protocolo Digital Sistemas S.A.', papel: 'OPERADOR', descricaoServico: 'Licença e suporte do sistema de processo legislativo', contratoVigente: true, contratoCritico: true, aditivoLgpdAssinado: false, contatoNome: 'Camila Duarte', perfil: 'PARCIAL' },
  { razaoSocial: 'Arquivo Seguro Guarda de Documentos Ltda', papel: 'OPERADOR', descricaoServico: 'Guarda e digitalização do arquivo físico', contratoVigente: true, contratoCritico: false, aditivoLgpdAssinado: false, contatoNome: 'Rogério Pires', perfil: 'NAO' },
  { razaoSocial: 'Correio Expresso Logística Ltda', papel: 'OPERADOR', descricaoServico: 'Envio de correspondências e notificações', contratoVigente: true, contratoCritico: false, aditivoLgpdAssinado: true, dataAditivo: -60, contatoNome: 'Luciana Matos', perfil: 'SIM' },
  { razaoSocial: 'Saúde Ocupacional Integrada Ltda', papel: 'OPERADOR', descricaoServico: 'Exames admissionais e periódicos dos servidores', contratoVigente: true, contratoCritico: true, aditivoLgpdAssinado: false, contatoNome: 'Dr. Eduardo Brandão', perfil: 'PARCIAL' }
];

// terceiro: indice em TERCEIROS; integra: indices de sistemas anteriores
const SISTEMAS = [
  { nome: 'Sistema de Processo Legislativo', tipo: 'APLICACAO', finalidade: 'Tramitação de proposições, pautas e atas das sessões', terceiro: 2, hosp: ['NUVEM', 'Brasil', 'São Paulo (SP)'], dados: ['Nome', 'CPF', 'E-mail'], comp: 'Publicação no portal da transparência', integra: [] },
  { nome: 'Protocolo Eletrônico', tipo: 'APLICACAO', finalidade: 'Registro e acompanhamento de requerimentos dos cidadãos', terceiro: 0, hosp: ['NUVEM', 'Brasil', 'São Paulo (SP)'], dados: ['Nome', 'CPF', 'Endereço', 'Telefone', 'E-mail'], comp: 'Encaminhamento interno aos setores', integra: [0] },
  { nome: 'Folha de Pagamento', tipo: 'APLICACAO', finalidade: 'Cálculo da remuneração e envio ao eSocial', terceiro: 1, hosp: ['NUVEM', 'Brasil', 'Porto Alegre (RS)'], dados: ['Nome', 'CPF', 'RG', 'Dados bancários', 'Endereço'], comp: 'Envio ao eSocial e à instituição bancária', integra: [] },
  { nome: 'Banco de Dados de Recursos Humanos', tipo: 'BANCO_DADOS', finalidade: 'Cadastro funcional dos servidores', terceiro: null, hosp: ['ON_PREMISE', 'Brasil', 'Sala de servidores da Câmara'], dados: ['Nome', 'CPF', 'RG', 'Endereço', 'Telefone', 'Saúde'], comp: 'Consulta pelo sistema de folha', integra: [2] },
  { nome: 'Portal Institucional', tipo: 'NUVEM', finalidade: 'Divulgação de notícias, agenda e transparência', terceiro: 0, hosp: ['NUVEM', 'Brasil', 'São Paulo (SP)'], dados: ['Nome', 'E-mail'], comp: 'Publicação aberta (dados públicos)', integra: [0] },
  { nome: 'Correio Eletrônico Institucional', tipo: 'NUVEM', finalidade: 'Comunicação oficial por e-mail', terceiro: 0, hosp: ['NUVEM', 'Estados Unidos', 'Região leste'], dados: ['Nome', 'E-mail', 'Telefone'], comp: 'Troca de mensagens com cidadãos e órgãos', integra: [1] },
  { nome: 'Controle de Acesso e Videomonitoramento', tipo: 'APLICACAO', finalidade: 'Registro de visitantes e segurança do prédio', terceiro: null, hosp: ['ON_PREMISE', 'Brasil', 'Portaria da Câmara'], dados: ['Nome', 'RG', 'Dado biométrico'], comp: 'Não há compartilhamento', integra: [] },
  { nome: 'Arquivo Físico Central', tipo: 'FISICO', finalidade: 'Guarda dos processos e documentos em papel', terceiro: 3, hosp: ['ON_PREMISE', 'Brasil', 'Arquivo do térreo e galpão do fornecedor'], dados: ['Nome', 'CPF', 'Endereço'], comp: 'Retirada para digitalização pelo fornecedor', integra: [] }
];

// setor/sistemas: indices; sens: base do art. 11; comp: [terceiro, finalidade, pais, art33]
const TRATAMENTOS = [
  { nome: 'Folha de pagamento dos servidores', finalidade: 'Calcular e pagar a remuneração dos servidores e cumprir obrigações trabalhistas e previdenciárias', base: 'OBRIGACAO_LEGAL', dados: ['Nome', 'CPF', 'RG', 'Dados bancários', 'Endereço'], tit: ['Servidores', 'Vereadores'], ret: 7300, setor: 1, sis: [2, 3], comp: [[1, 'Processamento da folha e do eSocial', 'Brasil']], descarte: 'Eliminação segura após o prazo da tabela de temporalidade', medidas: 'Acesso por perfil, registro de acessos e cópias de segurança diárias' },
  { nome: 'Exames médicos ocupacionais', finalidade: 'Realizar exames admissionais e periódicos exigidos pela legislação de saúde do trabalho', base: 'OBRIGACAO_LEGAL', sens: 'SENSIVEL_TUTELA_SAUDE', dados: ['Nome', 'CPF', 'Saúde'], tit: ['Servidores'], ret: 7300, setor: 1, sis: [3], comp: [[5, 'Realização dos exames ocupacionais', 'Brasil']], descarte: 'Devolução ao serviço médico e eliminação dos laudos digitalizados', medidas: 'Prontuários em armário com chave e acesso restrito ao médico do trabalho' },
  { nome: 'Cadastro funcional dos servidores', finalidade: 'Manter os dados funcionais e o histórico da vida funcional dos servidores', base: 'EXECUCAO_CONTRATO', dados: ['Nome', 'CPF', 'RG', 'Endereço', 'Telefone', 'E-mail'], tit: ['Servidores'], ret: 36500, setor: 1, sis: [3], comp: [], descarte: 'Guarda permanente (documento de valor histórico)', medidas: 'Banco de dados interno com acesso por perfil' },
  { nome: 'Protocolo de requerimentos dos cidadãos', finalidade: 'Registrar, encaminhar e responder os requerimentos apresentados à Câmara', base: 'INTERESSE_PUBLICO', dados: ['Nome', 'CPF', 'Endereço', 'Telefone', 'E-mail'], tit: ['Cidadãos'], ret: 1825, setor: 3, sis: [1], comp: [[0, 'Hospedagem do sistema de protocolo', 'Brasil']], descarte: 'Exclusão definitiva do sistema e trituração das vias em papel', medidas: 'Sistema com autenticação e trilha de auditoria' },
  { nome: 'Ouvidoria parlamentar', finalidade: 'Receber e tratar manifestações, reclamações e sugestões da população', base: 'INTERESSE_PUBLICO', dados: ['Nome', 'E-mail', 'Telefone'], tit: ['Cidadãos'], ret: 1825, setor: 5, sis: [1, 5], comp: [], descarte: 'Anonimização dos registros após o prazo', medidas: 'Acesso restrito à equipe da Ouvidoria' },
  { nome: 'Atendimento a pedidos de acesso à informação (LAI)', finalidade: 'Responder pedidos com base na Lei de Acesso à Informação', base: 'OBRIGACAO_LEGAL', dados: ['Nome', 'E-mail', 'CPF'], tit: ['Cidadãos'], ret: 1825, setor: 5, sis: [1], comp: [], descarte: 'Exclusão definitiva do sistema', medidas: 'Sistema com autenticação e trilha de auditoria' },
  { nome: 'Processo legislativo e publicação de atos', finalidade: 'Tramitar proposições e publicar atos oficiais com a identificação dos autores', base: 'OBRIGACAO_LEGAL', dados: ['Nome', 'CPF'], tit: ['Vereadores', 'Cidadãos'], ret: 36500, setor: 2, sis: [0, 4], comp: [[2, 'Suporte ao sistema de processo legislativo', 'Brasil']], descarte: 'Guarda permanente (documento de valor histórico)', medidas: 'Publicação apenas dos dados exigidos por lei' },
  { nome: 'Licitações e contratos com fornecedores', finalidade: 'Conduzir licitações e gerir contratos administrativos', base: 'OBRIGACAO_LEGAL', dados: ['Nome', 'CPF', 'E-mail', 'Telefone'], tit: ['Fornecedores'], ret: 3650, setor: 6, sis: [1, 7], comp: [], descarte: 'Eliminação conforme tabela de temporalidade', medidas: 'Processos digitais com acesso por perfil' },
  { nome: 'Controle de acesso de visitantes', finalidade: 'Garantir a segurança do prédio e das pessoas que circulam na Câmara', base: 'INTERESSE_LEGITIMO', sens: 'SENSIVEL_PREVENCAO_FRAUDE', dados: ['Nome', 'RG', 'Dado biométrico'], tit: ['Cidadãos', 'Fornecedores'], ret: 180, setor: 7, sis: [6], comp: [], descarte: 'Exclusão automática dos registros após 180 dias', medidas: 'Equipamento em rede isolada e acesso restrito à segurança' },
  { nome: 'Videomonitoramento das dependências', finalidade: 'Proteger o patrimônio público e a integridade das pessoas', base: 'INTERESSE_LEGITIMO', dados: ['Outros'], tit: ['Cidadãos', 'Servidores'], ret: 30, setor: 7, sis: [6], comp: [], descarte: 'Sobrescrita automática das gravações após 30 dias', medidas: 'Gravações acessíveis só à segurança, mediante registro' },
  { nome: 'Comunicação institucional e cadastro de imprensa', finalidade: 'Divulgar a atividade parlamentar e manter contato com veículos de imprensa', base: 'CONSENTIMENTO', dados: ['Nome', 'E-mail', 'Telefone'], tit: ['Outros'], ret: 730, setor: 4, sis: [4, 5], comp: [[0, 'Hospedagem do portal e do e-mail', 'Brasil']], descarte: 'Exclusão do cadastro a pedido ou após o prazo', medidas: 'Cadastro separado, com registro do consentimento' },
  { nome: 'Envio de correspondências oficiais', finalidade: 'Enviar notificações e comunicados oficiais aos destinatários', base: 'INTERESSE_PUBLICO', dados: ['Nome', 'Endereço'], tit: ['Cidadãos', 'Fornecedores'], ret: 365, setor: 3, sis: [1], comp: [[4, 'Postagem e entrega das correspondências', 'Brasil']], descarte: 'Exclusão das listas de envio após o prazo', medidas: 'Listas geradas sob demanda e eliminadas após o envio' },
  { nome: 'Correio eletrônico institucional', finalidade: 'Comunicação oficial com cidadãos, órgãos e fornecedores', base: 'INTERESSE_PUBLICO', dados: ['Nome', 'E-mail'], tit: ['Cidadãos', 'Servidores', 'Fornecedores'], ret: 1825, setor: 7, sis: [5], comp: [[0, 'Hospedagem das caixas de e-mail', 'Estados Unidos', 'ART33_II']], descarte: 'Exclusão das caixas de servidores desligados após 1 ano', medidas: 'Autenticação em 2 etapas e cláusulas contratuais padrão com o provedor' },
  { nome: 'Guarda e digitalização do arquivo físico', finalidade: 'Preservar os documentos em papel e digitalizar os de uso frequente', base: 'OBRIGACAO_LEGAL', dados: ['Nome', 'CPF', 'Endereço'], tit: ['Cidadãos', 'Servidores'], ret: 3650, setor: 3, sis: [7], comp: [[3, 'Guarda e digitalização dos documentos', 'Brasil']], descarte: 'Fragmentação com certificado de destruição', medidas: 'Galpão com controle de acesso e registro de retirada' },
  { nome: 'Pesquisa de satisfação do atendimento', finalidade: 'Medir a satisfação com o atendimento ao público e orientar melhorias', base: 'CONSENTIMENTO', dados: ['Nome', 'E-mail'], tit: ['Cidadãos'], ret: 365, setor: 5, sis: [4], comp: [], descarte: 'Anonimização das respostas após a consolidação', medidas: 'Respostas consolidadas sem identificação' }
];

const DSAR = [
  { titular: 'Laura Mendes Carvalho', tipo: 'ACESSO', descricao: 'Solicito cópia dos meus dados pessoais registrados no protocolo da Câmara.', estado: 'AGUARDANDO' },
  { titular: 'Gustavo Henrique Barros', tipo: 'CONFIRMACAO', descricao: 'Gostaria de saber se a Câmara trata dados pessoais meus.', estado: 'EM_ANALISE' },
  { titular: 'Beatriz Oliveira Santos', tipo: 'CORRECAO', descricao: 'Meu endereço está desatualizado no cadastro de correspondências; peço a correção.', estado: 'EM_ANALISE_ANEXO' },
  { titular: 'Rafael Augusto Pereira', tipo: 'ACESSO', descricao: 'Peço informações sobre os dados pessoais que constam no meu requerimento de 2025.', estado: 'RESPONDIDO' },
  { titular: 'Sandra Regina Figueiredo', tipo: 'ELIMINACAO', descricao: 'Peço a exclusão do meu cadastro de imprensa, para o qual dei consentimento.', estado: 'RESPONDIDO' },
  { titular: 'Thiago Moreira Dias', tipo: 'OPOSICAO', descricao: 'Me oponho ao uso dos meus dados na pesquisa de satisfação.', estado: 'AGUARDANDO' }
];

// ---------- principal ----------

async function principal() {
  API = (process.env.DEMO_API || await perguntar('Endereço da API (ex.: https://...up.railway.app): ')).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(API)) throw new FalhaDemo('Endereço da API inválido');
  const emailAdmin = process.env.DEMO_ADMIN_EMAIL || await perguntar('E-mail do Admin: ');
  const senhaAdmin = process.env.DEMO_ADMIN_SENHA || await perguntar('Senha do Admin (não aparece): ', { oculto: true });

  const adm = (await api('POST', '/admin/login', { body: { email: emailAdmin, senha: senhaAdmin } }, 200)).token;
  log('Admin: login ok');

  // Idempotencia
  const camaras = await api('GET', '/admin/camaras', { token: adm }, 200);
  const ja = camaras.find(c => c.nome === NOME_CAMARA);
  if (ja) { log(`PAROU: a "${NOME_CAMARA}" já existe (endereço público: ${ja.slug}). Nada foi criado nem alterado.`); return; }

  // Camara + Gestor
  const cred = Object.fromEntries(USUARIOS.map(u => [u.chave, { ...u, inicial: senhaNova(), senha: senhaNova() }]));
  const org = await api('POST', '/admin/camaras', { token: adm, body: {
    nome: NOME_CAMARA, cnpj: cnpjFicticio(1), email: cred.GESTOR.email, senha: cred.GESTOR.inicial, nomeGestor: cred.GESTOR.nome, plano: 'avancado'
  } }, 201);
  log(`Câmara criada (endereço público: ${org.slug})`);
  await api('PATCH', `/admin/camaras/${org.id}/modulos`, { token: adm, body: { modulosAtivos: TODOS_MODULOS } });
  await api('PATCH', `/admin/camaras/${org.id}/mfa-obrigatorio`, { token: adm, body: { mfaObrigatorio: false } });
  for (const u of USUARIOS.filter(x => x.chave !== 'GESTOR')) {
    await api('POST', `/admin/camaras/${org.id}/usuarios`, { token: adm, body: { email: u.email, nome: u.nome, senha: cred[u.chave].inicial, perfil: u.perfil } }, 201);
  }

  // Primeiro acesso de cada um: troca a senha inicial pela definitiva
  const t = {};
  const ids = {};
  for (const u of USUARIOS) {
    const c = cred[u.chave];
    const l1 = await api('POST', '/auth/login', { body: { email: c.email, senha: c.inicial } }, 200);
    if (l1.trocaSenhaObrigatoria) await api('POST', '/auth/senha/primeiro-acesso', { body: { trocaToken: l1.trocaToken, novaSenha: c.senha } }, 200);
    const l2 = await api('POST', '/auth/login', { body: { email: c.email, senha: c.senha } }, 200);
    t[u.chave] = l2.token;
    ids[u.chave] = (await api('GET', '/auth/me', { token: l2.token }, 200)).id;
  }
  fs.mkdirSync(path.dirname(ARQ_CRED), { recursive: true });
  fs.writeFileSync(ARQ_CRED, [
    `${NOME_CAMARA} — credenciais de demonstração`, `API: ${API}`, `Endereço público (slug): ${org.slug}`, `Criado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, '',
    ...USUARIOS.map(u => `${u.perfil.padEnd(17)} ${u.nome.padEnd(26)} ${cred[u.chave].email}  senha: ${cred[u.chave].senha}`), ''
  ].join('\n'), { mode: 0o600 });
  log(`5 usuários criados; senhas gravadas em ${ARQ_CRED} (não exibidas)`);
  const G = t.GESTOR, D = t.DPO;

  // Dados da camara e encarregado
  await api('PUT', '/organizacao/dados', { token: G, body: {
    encarregadoNome: cred.DPO.nome, encarregadoEmail: 'encarregado.lgpd@cidadedemo.example', encarregadoTelefone: '(51) 3555-0100',
    enderecoSede: 'Praça da Independência, 100 — Centro', municipio: 'Cidade Demo', uf: 'RS'
  } });

  // Setores
  const setores = [];
  for (const nome of SETORES) setores.push((await api('POST', '/setores', { token: G, body: { nome } }, 201)).id);

  // Terceiros: questionario, risco e plano de acao
  const q = await api('GET', '/terceiros/questionario', { token: G }, 200);
  const perguntas = q.blocos.flatMap(b => b.perguntas);
  const terceiros = [];
  for (const [i, x] of TERCEIROS.entries()) {
    const ter = await api('POST', '/terceiros', { token: G, body: {
      razaoSocial: x.razaoSocial, cnpj: cnpjFicticio(i + 2), papel: x.papel, descricaoServico: x.descricaoServico,
      contatoNome: x.contatoNome, contatoEmail: `contato${i + 1}@fornecedor-demo.example`,
      contratoVigente: x.contratoVigente, contratoCritico: x.contratoCritico, aditivoLgpdAssinado: x.aditivoLgpdAssinado,
      ...(x.dataAditivo && { dataAditivo: dia(x.dataAditivo) })
    } }, 201);
    terceiros.push(ter.id);
    // perfil de respostas: SIM (baixo risco), PARCIAL (medio) ou NAO (alto)
    const respostas = perguntas.map((p, k) => ({ perguntaId: p.id, resposta: x.perfil === 'SIM' ? 'SIM' : x.perfil === 'PARCIAL' ? (k % 3 === 0 ? 'PARCIAL' : 'SIM') : (k % 2 === 0 ? 'NAO' : 'PARCIAL') }));
    await api('PUT', `/terceiros/${ter.id}/questionario`, { token: G, body: { respostas } });
    if (x.perfil !== 'SIM' || !x.aditivoLgpdAssinado) {
      await api('POST', `/terceiros/${ter.id}/acoes`, { token: G, body: { descricao: 'Assinar o termo aditivo de proteção de dados (LGPD)', prazo: dia(30), responsavelId: ids.DPO, situacao: 'EM_ANDAMENTO' } }, 201);
      await api('POST', `/terceiros/${ter.id}/acoes`, { token: G, body: { descricao: 'Apresentar política de segurança e plano de resposta a incidentes', prazo: dia(45), responsavelId: ids.GESTOR, situacao: 'PENDENTE' } }, 201);
    } else {
      await api('POST', `/terceiros/${ter.id}/acoes`, { token: G, body: { descricao: 'Reavaliação anual do questionário de conformidade', prazo: dia(180), responsavelId: ids.DPO, situacao: 'CONCLUIDA' } }, 201);
    }
  }
  log(`${terceiros.length} terceiros com questionário, risco e plano de ação`);

  // Inventario de sistemas
  const sistemas = [];
  for (const x of SISTEMAS) {
    const s = await api('POST', '/inventario/sistemas', { token: G, body: {
      nome: x.nome, tipo: x.tipo, finalidade: x.finalidade, responsavelId: ids.DPO, terceiroId: x.terceiro === null ? null : terceiros[x.terceiro],
      categoriasDados: x.dados, formasCompartilhamento: x.comp, tipoHospedagem: x.hosp[0], paisHospedagem: x.hosp[1], regiaoHospedagem: x.hosp[2],
      integracaoIds: x.integra.map(k => sistemas[k]), ativo: true
    } }, 201);
    sistemas.push(s.id);
  }
  log(`${sistemas.length} sistemas no inventário`);

  // ROPA
  const trats = [];
  for (const x of TRATAMENTOS) {
    const tr = await api('POST', '/ropa/tratamentos', { token: G, body: {
      nome: x.nome, finalidade: x.finalidade, baseLegal: x.base, ...(x.sens && { baseLegalSensivel: x.sens }),
      categoriasDados: x.dados, categoriasTitulares: x.tit, retencaoDias: x.ret, formaDescarte: x.descarte, medidasSeguranca: x.medidas,
      responsavelId: ids.DPO, setorId: setores[x.setor], sistemaIds: x.sis.map(k => sistemas[k]),
      outrosMeios: x.setor === 1 ? 'Pastas funcionais em papel no arquivo do RH' : 'Não há',
      compartilhamentos: x.comp.map(([k, fin, pais, art33]) => ({ terceiroId: terceiros[k], terceiroNome: '', finalidadeCompartilhamento: fin, paisDestino: pais, ...(art33 && { baseLegalTransferencia: art33 }) }))
    } }, 201);
    trats.push(tr.id);
  }
  // um registro ainda em mapeamento (mostra o indicador de pendencias por setor/sistema)
  await api('POST', '/ropa/tratamentos', { token: G, body: {
    nome: 'Cadastro de estagiários (em mapeamento)', finalidade: 'Gerir o programa de estágio da Câmara', baseLegal: 'EXECUCAO_CONTRATO',
    categoriasDados: ['Nome', 'CPF', 'E-mail'], categoriasTitulares: ['Outros'], retencaoDias: 1825, responsavelId: ids.OPERADOR
  } }, 201);
  await anexar(G, 'TRATAMENTO', trats[0], 'parecer-juridico-folha.pdf', 'Parecer jurídico — base legal da folha de pagamento', [
    'Assunto: tratamento de dados pessoais na folha de pagamento.', 'Conclusão: o tratamento se apoia no cumprimento de obrigação legal (LGPD, art. 7º, II) e na legislação trabalhista e previdenciária.']);
  // descarte com evidencia
  const desc = await api('POST', `/ropa/tratamentos/${trats[9]}/descartes`, { token: G, body: {
    dataDescarte: dia(-10), descricao: 'Sobrescrita das gravações com mais de 30 dias, conforme política de retenção', metodo: 'Sobrescrita automática verificada', quantidade: 720, responsavelId: ids.OPERADOR
  } }, 201);
  await anexar(G, 'DESCARTE', desc.id, 'termo-de-descarte.pdf', 'Termo de descarte de gravações', [
    `Data do descarte: ${dia(-10).split('-').reverse().join('/')}.`, 'Objeto: gravações de videomonitoramento com mais de 30 dias.', 'Método: sobrescrita automática, conferida pela equipe de segurança.', 'Responsável: Juliana Costa Ribeiro.']);
  log(`${trats.length + 1} tratamentos no ROPA (1 em mapeamento), 1 descarte com evidência`);

  // DSAR
  const textoResposta = nome => `Prezado(a) ${nome},\n\nEm atenção ao seu pedido, informamos que ele foi analisado pelo Encarregado pelo Tratamento de Dados Pessoais da ${NOME_CAMARA} e atendido nos termos da Lei nº 13.709/2018 (LGPD). As informações solicitadas seguem em anexo a esta resposta.\n\nPermanecemos à disposição pelo canal do titular.\n\nAtenciosamente,\n${cred.DPO.nome}\nEncarregado pelo Tratamento de Dados Pessoais`;
  for (const [i, x] of DSAR.entries()) {
    const sol = await api('POST', '/dsar/solicitacoes', { token: D, body: {
      titularNome: x.titular, titularEmail: `jofsalaverry+demo-titular${i + 1}@gmail.com`, tipoDireito: x.tipo, descricao: x.descricao
    } }, 201);
    if (x.estado === 'AGUARDANDO') continue;
    await api('PATCH', `/dsar/solicitacoes/${sol.id}/verificar-identidade`, { token: D, body: { metodo: 'DOCUMENTO', observacao: 'Documento de identidade conferido no protocolo' } });
    await api('POST', `/dsar/solicitacoes/${sol.id}/evidencias`, { token: D, body: { tipo: 'Consulta aos sistemas', descricao: 'Levantamento dos dados nos sistemas de protocolo e de comunicação' } }, 201);
    if (x.estado === 'EM_ANALISE_ANEXO') {
      await anexar(D, 'SOLICITACAO_DSAR', sol.id, 'comprovante-de-endereco.pdf', 'Comprovante de endereço apresentado pela titular', ['Documento apresentado para fundamentar o pedido de correção do endereço.']);
    }
    if (x.estado === 'RESPONDIDO') {
      await api('POST', `/dsar/solicitacoes/${sol.id}/responder`, { token: D, body: { respostaTexto: textoResposta(x.titular) } });
      const s2 = await api('GET', `/dsar/solicitacoes/${sol.id}`, { token: D }, 200);
      if (!s2.respostaEnviadaEmailEm) await api('POST', `/dsar/solicitacoes/${sol.id}/envio`, { token: D, body: { meio: 'EMAIL_INSTITUCIONAL', data: dia(0), observacao: 'Resposta enviada pelo e-mail institucional do encarregado' } });
    }
  }
  log(`${DSAR.length} pedidos DSAR (2 aguardando verificação, 2 em análise, 2 respondidos no prazo)`);

  // Incidentes
  const incReal = await api('POST', '/repositorio/incidentes', { token: G, body: {
    titulo: 'Envio de planilha de servidores a destinatário errado', tipoRegistro: 'REAL', tipoIncidente: 'VAZAMENTO', severidade: 'ALTA',
    dataOcorrencia: dia(-2), dataCiencia: dia(-1), riscoRelevante: 'SIM', qtdTitulares: 48,
    dadosAfetados: ['Nome', 'CPF', 'Dados bancários'], responsavelId: ids.DPO,
    descricao: 'Planilha com dados funcionais de 48 servidores foi enviada por e-mail a um endereço externo por erro de digitação.',
    planoAcao: 'Conferência obrigatória do destinatário e envio de planilhas somente com senha.'
  } }, 201);
  await api('PUT', `/repositorio/incidentes/${incReal.id}`, { token: G, body: { status: 'EM_INVESTIGACAO' } });
  await api('POST', `/repositorio/incidentes/${incReal.id}/providencias`, { token: G, body: { descricao: 'Solicitada ao destinatário a exclusão da mensagem, com confirmação por escrito', data: dia(-1), responsavelId: ids.DPO } }, 201);
  await api('POST', `/repositorio/incidentes/${incReal.id}/providencias`, { token: G, body: { descricao: 'Bloqueio preventivo das contas bancárias informadas junto ao banco pagador', data: dia(0), responsavelId: ids.GESTOR } }, 201);
  await anexar(G, 'INCIDENTE', incReal.id, 'confirmacao-de-exclusao.pdf', 'Confirmação de exclusão da mensagem', ['O destinatário confirmou por escrito a exclusão da mensagem e de seus anexos, sem cópias.']);

  const incEnc = await api('POST', '/repositorio/incidentes', { token: G, body: {
    titulo: 'Acesso indevido a pasta compartilhada do protocolo', tipoRegistro: 'REAL', tipoIncidente: 'ACESSO_INDEVIDO', severidade: 'MEDIA',
    dataOcorrencia: dia(-45), dataCiencia: dia(-44), riscoRelevante: 'NAO', qtdTitulares: 12, dadosAfetados: ['Nome', 'Endereço'], responsavelId: ids.DPO,
    descricao: 'Permissão de leitura mal configurada permitiu que estagiários vissem requerimentos de cidadãos.',
    planoAcao: 'Revisão trimestral das permissões das pastas compartilhadas.'
  } }, 201);
  await api('POST', `/repositorio/incidentes/${incEnc.id}/providencias`, { token: G, body: { descricao: 'Permissões corrigidas e registro de acessos revisado', data: dia(-44), responsavelId: ids.OPERADOR } }, 201);
  await api('PUT', `/repositorio/incidentes/${incEnc.id}`, { token: G, body: { status: 'ENCERRADO' } });
  await anexar(G, 'INCIDENTE', incEnc.id, 'relatorio-de-permissoes.pdf', 'Relatório de revisão de permissões', ['Pastas revisadas: 14.', 'Permissões corrigidas: 3.', 'Nenhum acesso externo identificado.']);

  const incSim = await api('POST', '/repositorio/incidentes', { token: G, body: {
    titulo: 'Simulado anual de resposta a incidente (ransomware)', tipoRegistro: 'SIMULADO', tipoIncidente: 'PERDA', severidade: 'ALTA',
    dataOcorrencia: dia(-20), qtdTitulares: 0, dadosAfetados: [], responsavelId: ids.DPO,
    descricao: 'Exercício de mesa simulando a criptografia dos servidores de arquivos por ransomware.',
    planoAcao: 'Atualizar a lista de contatos de emergência e testar a restauração das cópias de segurança a cada semestre.'
  } }, 201);
  await api('POST', `/repositorio/incidentes/${incSim.id}/providencias`, { token: G, body: { descricao: 'Restauração das cópias de segurança testada com sucesso em 2 horas', data: dia(-20), responsavelId: ids.OPERADOR } }, 201);
  await api('PUT', `/repositorio/incidentes/${incSim.id}`, { token: G, body: { status: 'RESOLVIDO' } });
  log('3 incidentes (real em investigação com prazo da ANPD, real encerrado, simulado)');

  // Checklist: respostas, evidencias e atividades proprias
  const itens = await api('GET', '/conformidade/checklist', { token: G }, 200);
  const globais = itens.filter(i => !i.organizacaoId).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const STATUS = ['CONFORME', 'CONFORME', 'PARCIAL', 'CONFORME', 'NAO_CONFORME', 'CONFORME', 'PARCIAL', 'CONFORME', 'CONFORME', 'NAO_APLICAVEL', 'CONFORME', 'PARCIAL'];
  for (const [k, it] of globais.slice(0, STATUS.length).entries()) {
    await api('POST', `/conformidade/checklist/${it.id}/responder`, { token: D, body: {
      status: STATUS[k], observacao: STATUS[k] === 'CONFORME' ? 'Atendido e documentado' : STATUS[k] === 'PARCIAL' ? 'Em implantação; conclusão prevista no plano de adequação' : STATUS[k] === 'NAO_APLICAVEL' ? 'Não se aplica à Câmara' : 'Pendente; incluído no plano de ação',
      evidenciaUrl: STATUS[k] === 'CONFORME' ? `https://cidadedemo.example/lgpd/evidencias/${it.codigo.toLowerCase()}` : '',
      proximaRevisao: dia(STATUS[k] === 'CONFORME' ? 180 : 30), responsavelId: ids.DPO
    } });
    if (k < 3) await anexar(D, 'CHECKLIST_ITEM', it.id, `evidencia-${it.codigo.toLowerCase()}.pdf`, `Evidência — ${it.codigo}`, [it.titulo, 'Documento comprobatório arquivado pelo Encarregado.']);
  }
  const ATIVIDADES = [
    ['Revisar os contratos com cláusulas de proteção de dados', 'Conferir todos os contratos vigentes e incluir o aditivo LGPD onde faltar', 30, 'ALTA'],
    ['Treinar os servidores recém-nomeados', 'Aplicar a trilha "Introdução à LGPD" aos servidores nomeados no semestre', 15, 'MEDIA'],
    ['Atualizar a página de transparência LGPD', 'Revisar as perguntas frequentes e os dados do encarregado no portal', -5, 'BAIXA']
  ];
  for (const [i, [titulo, descricao, prazo, criticidade]] of ATIVIDADES.entries()) {
    const at = await api('POST', '/conformidade/atividades', { token: D, body: { titulo, descricao, prazo: dia(prazo), responsavelId: i === 1 ? ids.GESTOR : ids.DPO, criticidade } }, 201);
    if (i === 0) await api('POST', `/conformidade/checklist/${at.id}/responder`, { token: D, body: { status: 'PARCIAL', observacao: '4 de 6 contratos já revisados', proximaRevisao: dia(30), responsavelId: ids.DPO } });
  }
  log(`checklist: ${STATUS.length} de ${globais.length} itens respondidos, 3 com anexo, 3 atividades próprias`);

  // Treinamento: 5 servidores em estagios diferentes, 2 certificados
  const trilha = TRILHAS.find(x => x.nivel === 'Básico');
  const gab = m => trilha.modulos.find(x => x.moduloId === m).quiz.map(x => x.correta);
  const certs = [];
  for (const quem of ['GESTOR', 'DPO']) {
    for (const m of trilha.modulos) {
      const r = await api('POST', '/treinamento/progresso', { token: t[quem], body: { trilhaId: trilha.id, moduloId: m.moduloId, respostas: gab(m.moduloId) } });
      if (r.certificadoCodigo) certs.push(r.certificadoCodigo);
    }
  }
  const m0 = trilha.modulos[0].moduloId;
  await api('POST', '/treinamento/progresso', { token: t.OPERADOR, body: { trilhaId: trilha.id, moduloId: m0, respostas: gab(m0) } });
  await api('POST', '/treinamento/progresso', { token: t.AUDITOR, body: { trilhaId: trilha.id, moduloId: m0, respostas: gab(m0).map((c, i) => (i === 0 ? c : (c + 1) % 3)) } });
  log(`treinamento: 2 concluíram (${new Set(certs).size} certificados), 1 em andamento, 1 reprovado no questionário, 1 não iniciou`);

  // Repositorio: documentos e minutas
  const DOCS = [
    ['Portaria de designação do Encarregado', 'POLITICA', 'portaria-designacao-encarregado.pdf', ['Designa o servidor Ricardo Almeida Fontes como Encarregado pelo Tratamento de Dados Pessoais da Câmara.']],
    ['Política de Segurança da Informação (aprovada)', 'POLITICA_SEGURANCA', 'politica-seguranca-aprovada.pdf', ['Estabelece as diretrizes de segurança da informação da Câmara.', 'Aprovada pela Mesa Diretora.']],
    ['Contrato de hospedagem em nuvem', 'CONTRATO', 'contrato-hospedagem-nuvem.pdf', ['Contrato administrativo com Nuvem Sul Tecnologia Ltda.', 'Inclui cláusulas de proteção de dados pessoais.']]
  ];
  for (const [titulo, categoria, arquivo, linhas] of DOCS) {
    const fd = new FormData();
    fd.append('titulo', titulo); fd.append('categoria', categoria); fd.append('descricao', 'Documento institucional da Câmara');
    fd.append('arquivo', new Blob([await pdf(titulo, linhas)], { type: 'application/pdf' }), arquivo);
    await api('POST', '/repositorio/upload', { token: D, form: fd }, 201);
  }
  let pdfa = null;
  for (const [modelo, corpo] of [['politica-privacidade', {}], ['aditivo-lgpd', { terceiroId: terceiros[2] }], ['formulario-registro-incidente', {}], ['termo-confidencialidade', {}]]) {
    const g = await api('POST', `/gerador/modelos/${modelo}/gerar`, { token: D, body: corpo }, 201);
    pdfa = pdfa === null ? g.pdfa : pdfa && g.pdfa;
  }
  log(`repositório: ${DOCS.length} documentos enviados e 4 minutas geradas (${pdfa ? 'DOCX + PDF/A' : 'DOCX + PDF comum: conversor PDF/A indisponível'})`);

  // Metas dos indicadores e foto do mes
  await api('PUT', '/indicadores/metas', { token: G, body: { metas: { ROPA: 100, CONTRATOS: 100, TREINAMENTOS: 80, DSAR: 100 } } });
  await api('POST', '/indicadores/snapshots', { token: G }, 201);
  const ind = await api('GET', '/indicadores', { token: G }, 200);
  log('indicadores: ' + ind.indicadores.map(i => `${i.chave} ${i.n ?? '-'}/${i.total ?? '-'} ${i.status}`).join(' · '));
  log(`PRONTO: "${NOME_CAMARA}" populada. Credenciais em ${ARQ_CRED}.`);
}

principal().catch(e => {
  console.log('FALHOU:', e instanceof FalhaDemo ? e.message : (e.message || String(e)).split('\n')[0]);
  console.log('A câmara pode ter sido criada pela metade. Antes de rodar de novo, desative-a no painel do Admin e me chame.');
  process.exitCode = 1;
});
