const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function extrairItens(pdfBuffer) {
  const pdfjsLib = require('pdfjs-dist');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdfjsDoc = await loadingTask.promise;
  const itens = [];
  for (let p = 1; p <= pdfjsDoc.numPages; p++) {
    const page = await pdfjsDoc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      itens.push({
        indice: itens.length,
        texto: item.str,
        x: item.transform[4],
        baseline: item.transform[5],
        width: item.width,
        height: item.height || 10,
        pageIndex: p - 1
      });
    }
  }
  return itens;
}

// Agrupa itens em linhas por pagina, tolerando variacao de y, e
// separa por colunas detectando espacos horizontais grandes.
function agruparLinhas(itens) {
  const porPagina = {};
  for (const it of itens) {
    (porPagina[it.pageIndex] = porPagina[it.pageIndex] || []).push(it);
  }
  const linhas = [];
  const tolY = 4;
  for (const p of Object.keys(porPagina).map(Number).sort((a, b) => a - b)) {
    const arr = porPagina[p].slice().sort((a, b) => b.baseline - a.baseline);
    const grupos = [];
    for (const it of arr) {
      let g = grupos.find(g => Math.abs(g.baseline - it.baseline) <= tolY);
      if (!g) { g = { baseline: it.baseline, itens: [] }; grupos.push(g); }
      g.itens.push(it);
    }
    // Dentro de cada grupo de y, ordena por x e quebra em colunas quando ha gap grande
    for (const g of grupos) {
      g.itens.sort((a, b) => a.x - b.x);
      let atual = [];
      const pushLinha = () => {
        if (!atual.length) return;
        linhas.push({
          pageIndex: p,
          itensIdx: atual.map(i => i.indice),
          texto: atual.map(i => i.texto).join(' ').replace(/\s+/g, ' ').trim()
        });
        atual = [];
      };
      for (let k = 0; k < g.itens.length; k++) {
        const it = g.itens[k];
        if (atual.length) {
          const prev = atual[atual.length - 1];
          const gap = it.x - (prev.x + prev.width);
          // gap maior que ~30pt considera coluna separada
          if (gap > 30) pushLinha();
        }
        atual.push(it);
      }
      pushLinha();
    }
  }
  return linhas;
}

// Para cada item da linha, tenta localizar a substring alvo e gera tarjas
// cobrindo os chars correspondentes em cada item que interseccione.
function tarjasPorSubstringEmLinha(linha, itens, alvo) {
  // Reconstroi mapping char -> item+offset
  let charMap = [];
  linha.itensIdx.forEach((idx, k) => {
    const texto = itens[idx].texto;
    for (let c = 0; c < texto.length; c++) charMap.push({ idx, pos: c });
    if (k < linha.itensIdx.length - 1) charMap.push({ idx: null, pos: -1 }); // separador (espaco)
  });
  const linhaTxt = linha.itensIdx.map(idx => itens[idx].texto).join(' ');
  const res = [];
  let from = 0;
  while (true) {
    const pos = linhaTxt.indexOf(alvo, from);
    if (pos === -1) break;
    // Agrupar por item
    const porItem = {};
    for (let k = 0; k < alvo.length; k++) {
      const cm = charMap[pos + k];
      if (!cm || cm.idx == null) continue;
      (porItem[cm.idx] = porItem[cm.idx] || []).push(cm.pos);
    }
    for (const idx of Object.keys(porItem).map(Number)) {
      const positions = porItem[idx];
      const p0 = Math.min(...positions);
      const p1 = Math.max(...positions) + 1;
      res.push({ i: idx, start: p0, end: p1 });
    }
    from = pos + alvo.length;
  }
  return res;
}

const RE_RESID = /\b(residente|domiciliad[ao]|morador(?:a)?|residencia)\b/i;
const RE_SEDE = /\b(com\s+sede|sediad[ao]|estabelecid[ao]|localizad[ao])\b/i;
function linhaEhSedeEmpresa(texto) {
  return RE_SEDE.test(texto) && !RE_RESID.test(texto);
}
function linhaEhResidencia(texto) {
  return RE_RESID.test(texto);
}

function parecerEndereco(txt) {
  const t = txt.toLowerCase();
  return /(rua|avenida|av\.|alameda|travessa|praca|rodovia|estrada|bairro|cep\s?\d|\bn[ºo°]\s?\d)/.test(t);
}

// Regex para detectar cargos publicos e funcoes em documentos de camaras
// municipais. Usado para decidir se um nome e de agente publico (LAI: dado
// publico, NAO tarjar) ou de pessoa privada (LGPD: dado pessoal, tarjar).
const RE_CARGO_PUBLICO = /\b(president[ea]|vice[- ]?president[ea]|vereador(?:a)?|prefeit[oa]|secret[aá]ri[oa]|diretor(?:a)?|servidor(?:a)?|fiscal|gestor(?:a)?|procurador(?:a)?|assessor(?:a)?|coordenador(?:a)?|superintendente|ouvidor(?:a)?|controlador(?:a)?|tesoureir[oa]|contador(?:a)?|chefe\s+de\s+gabinete|pregoeiro|licitante|contratante|contratad[oa]|representante\s+legal|s[oó]ci[oa][\s-]*(administrador|gerente|diretor)?|respons[aá]vel\s+(t[eé]cnic|legal)|encarregad[oa]|administrador(?:a)?|gerente|consultor(?:a)?|perit[oa]|auditor(?:a)?|analista|t[eé]cnic[oa]|oficial|escriv[aã](?:o|ã)|delegad[oa]|juiz|ju[ií]za|promotor(?:a)?|defensor(?:a)?|ministro|governador(?:a)?|deputad[oa]|senador(?:a)?|comiss[aá]ri[oa]|inspetor(?:a)?|regulador(?:a)?|mediador(?:a)?|[aá]rbitr[oa]|relator(?:a)?|subsecret[aá]ri[oa]|testemunha)\b/i;

// Verifica se um texto-linha contem indicador de cargo publico ou funcao
// que protegeria o nome sob a LAI (dado publico, transparencia ativa).
function linhaTemCargoPublico(textoLinha) {
  return RE_CARGO_PUBLICO.test(textoLinha);
}

// Heuristica: parece NOME PROPRIO de pessoa (ALL CAPS com 2+ palavras,
// comum em contratos brasileiros: "MARIA DE FATIMA SANTOS").
function parecerNome(txt) {
  const t = txt.trim().replace(/[,.;:]+$/, '');
  if (!t) return false;
  if (/\d/.test(t)) return false;
  if (/@/.test(t)) return false;
  if (!/^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s.'-]+$/.test(t)) return false;
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return false;
  if (/(RUA|AVENIDA|ALAMEDA|TRAVESSA|BAIRRO|SEDE|CEP|CNPJ|CLAUSULA|OBJETO|VALOR)/.test(t)) return false;
  return true;
}

function parecerMetaTexto(txt) {
  return /(residente|domiciliad|neste ato|inscrit[oa]|portador|brasileir|casad|solteir)/i.test(txt);
}

async function aplicarTarjas(pdfBuffer, itens, tarjasSub) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const padding = 0.5;
  // Mede proporcao de larguras usando Helvetica como calibracao e reescala
  // para a largura real do item extraido pelo pdfjs. Isso funciona bem para
  // fontes sem serifa e produz tarjas muito mais proximas do visual real.
  const fracOf = (texto, end, sizeRef) => {
    if (end <= 0) return 0;
    const full = helvetica.widthOfTextAtSize(texto, sizeRef) || 1;
    const part = helvetica.widthOfTextAtSize(texto.slice(0, end), sizeRef);
    return part / full;
  };
  for (const t of tarjasSub) {
    const item = itens[t.i];
    if (!item) continue;
    const page = pages[item.pageIndex];
    if (!page) continue;
    const texto = item.texto;
    if (!texto.length) continue;
    const start = Math.max(0, t.start ?? 0);
    const end = Math.min(texto.length, t.end ?? texto.length);
    const sizeRef = Math.max(6, item.height);
    const fStart = fracOf(texto, start, sizeRef);
    const fEnd = fracOf(texto, end, sizeRef);
    const xSub = item.x + fStart * item.width;
    const wSub = Math.max(2, (fEnd - fStart) * item.width);
    const descenderPad = Math.max(1, item.height * 0.18);
    page.drawRectangle({
      x: xSub - padding,
      y: item.baseline - descenderPad,
      width: wSub + padding * 2,
      height: item.height + descenderPad + padding,
      color: rgb(0, 0, 0)
    });
  }
  return Buffer.from(await pdfDoc.save());
}

// Propaga contexto SEDE/RESID atraves de linhas adjacentes. Um endereco de
// sede frequentemente quebra em multiplas linhas: a palavra "com sede" aparece
// so na primeira linha, mas as seguintes ("Rua X, 123, Bairro, CEP 12345-678")
// precisam herdar o mesmo contexto para nao serem tarjadas.
function propagarContexto(linhas) {
  const n = linhas.length;
  const ctx = new Array(n).fill(null); // 'sede' | 'resid' | null
  for (let i = 0; i < n; i++) {
    if (linhaEhSedeEmpresa(linhas[i].texto)) ctx[i] = 'sede';
    else if (linhaEhResidencia(linhas[i].texto)) ctx[i] = 'resid';
  }
  // Propaga pra frente ate encontrar um marcador de reset (nova "CONTRATANTE",
  // "CONTRATADA", ponto final seguido de paragrafo longo, nome em caps, etc).
  for (let i = 0; i < n; i++) {
    if (!ctx[i]) continue;
    for (let j = i + 1; j < Math.min(n, i + 6); j++) {
      if (ctx[j]) break;
      if (linhas[j].pageIndex !== linhas[i].pageIndex) break;
      const txt = linhas[j].texto;
      // Reset ao encontrar palavras-chave que indicam nova secao
      if (/\b(CONTRATANTE|CONTRATADA|CLAUSULA|CLAUSULA|OBJETO|VALOR|PRAZO|PARTES|testemunha|CPF|CNPJ|cl[aá]usula)\b/i.test(txt)) break;
      ctx[j] = ctx[i];
    }
  }
  return ctx;
}

// Constroi lista de tarjas finais a partir da resposta da IA + linhas + regex CPF
function construirTarjas(itens, linhas, respostaIA) {
  const tarjasOut = [];
  const linhaDeItem = {};
  linhas.forEach((l, li) => l.itensIdx.forEach(idx => { linhaDeItem[idx] = li; }));
  const ctxLinha = propagarContexto(linhas);

  const addTarja = (i, start, end, origem) => {
    // Deduplica: se ja ha tarja sobreposta pro mesmo item, expande ao inves de duplicar
    const existente = tarjasOut.find(tt => tt.i === i && !(end <= tt.start || start >= tt.end));
    if (existente) {
      existente.start = Math.min(existente.start, start);
      existente.end = Math.max(existente.end, end);
      return;
    }
    tarjasOut.push({ i, start, end, origem });
  };

  // 1) Aplica respostas da IA via substring-em-linha (ou direto no item)
  const tarjasIA = Array.isArray(respostaIA?.tarjas) ? respostaIA.tarjas : [];
  for (const t of tarjasIA) {
    if (typeof t.i !== 'number' || !t.d) continue;
    const item = itens[t.i];
    if (!item) continue;
    const linhaIdx = linhaDeItem[t.i];
    const linha = linhas[linhaIdx];
    const ctx = ctxLinha[linhaIdx];

    // LAI/LGPD: nome de agente publico com cargo identificado na mesma
    // linha e DADO PUBLICO — nao tarjar. Nome sem cargo e dado pessoal.
    if (parecerNome(t.d)) {
      const textoCtx = linha ? linha.texto : item.texto;
      if (linhaTemCargoPublico(textoCtx)) continue; // agente publico, preservar
      // Verifica tambem linhas adjacentes (cargo pode estar na linha anterior/seguinte)
      const vizinhas = [linhaIdx - 1, linhaIdx + 1]
        .filter(li => li >= 0 && li < linhas.length && linhas[li].pageIndex === (linha || item).pageIndex)
        .map(li => linhas[li].texto);
      if (vizinhas.some(txt => linhaTemCargoPublico(txt))) continue;
      // Sem cargo: pessoa privada — manter tarja (nao pular)
    }
    if (parecerMetaTexto(t.d)) continue;
    if (parecerEndereco(t.d)) {
      if (ctx === 'sede') continue;
      if (linha && linhaEhSedeEmpresa(linha.texto)) continue;
    }

    // Match direto no item
    const pos = item.texto.indexOf(t.d);
    if (pos !== -1) {
      addTarja(t.i, pos, pos + t.d.length, 'ia');
      continue;
    }
    // Tenta na linha
    if (linha) {
      const subs = tarjasPorSubstringEmLinha(linha, itens, t.d);
      for (const s of subs) addTarja(s.i, s.start, s.end, 'ia-linha');
    }
  }

  // 2) FALLBACK OBRIGATORIO: regex CPF/RG/email/telefone em CADA ITEM.
  // Independente da IA, qualquer match e tarjado. Aplica tambem a
  // linha inteira (joined) para pegar casos quebrados entre itens.
  const CPF_ITEM = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;
  const CPF_TOLERANTE = /\d{3}\.?\d{3}\.?\d{3}\s*[-–—]\s*\d{2}/g;
  const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
  const TEL_RE = /\(?\d{2}\)?\s?9?\d{4}[-\s]\d{4}/g;

  // Emails institucionais (@camara.gov.br, @prefeitura.gov.br, etc.) sao
  // dados publicos pela LAI — nao tarjar. Somente emails pessoais.
  const RE_EMAIL_INSTITUCIONAL = /@[a-z0-9.-]*\.(gov|leg|jus|mp|def|org)\.[a-z]{2,}$/i;

  // Per-item scan — garantia absoluta quando CPF esta inteiro em um item
  for (const item of itens) {
    for (const re of [new RegExp(CPF_ITEM.source, 'g'), new RegExp(EMAIL_RE.source, 'g'), new RegExp(TEL_RE.source, 'g')]) {
      let m;
      while ((m = re.exec(item.texto)) !== null) {
        // Pula emails institucionais
        if (re.source === EMAIL_RE.source && RE_EMAIL_INSTITUCIONAL.test(m[0])) continue;
        addTarja(item.indice, m.index, m.index + m[0].length, 'regex-item');
      }
    }
  }

  // Per-linha scan (tolerante) — pega CPF quebrado entre itens adjacentes
  for (const linha of linhas) {
    const re = new RegExp(CPF_TOLERANTE.source, 'g');
    let m;
    while ((m = re.exec(linha.texto)) !== null) {
      const subs = tarjasPorSubstringEmLinha(linha, itens, m[0]);
      for (const s of subs) addTarja(s.i, s.start, s.end, 'regex-linha');
    }
  }

  return tarjasOut;
}

// Regex usados para categorizar trechos tarjados no relatorio simplificado.
// Ordem importa: CPF antes de RG (11 digitos colide), email antes de telefone.
const RE_CPF_CAT = /\d{3}\.?\d{3}\.?\d{3}[-–—.\s]*\d{2}/;
const RE_RG_CAT = /\d{1,2}\.\d{3}\.\d{3}[-]?[\dXx]/;
const RE_EMAIL_CAT = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const RE_TEL_CAT = /\(?\d{2}\)?\s?9?\d{4}[-\s]\d{4}/;
const RE_CNPJ_CAT = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
const RE_EMAIL_INST_CAT = /@[a-z0-9.-]*\.(gov|leg|jus|mp|def|org)\.[a-z]{2,}\b/i;

const LABELS_CATEGORIA = {
  cpf: 'CPF',
  rg: 'RG',
  email: 'Email pessoal',
  telefone: 'Telefone',
  endereco: 'Endereco residencial',
  nome: 'Nome de pessoa'
};

const MOTIVOS_TARJA = {
  cpf: 'CPF identifica unicamente uma pessoa. A LGPD (Art. 5, I) trata CPF como dado pessoal e ele e sempre tarjado — mesmo de agente publico.',
  rg: 'RG e documento de identidade pessoal. A LGPD (Art. 5, I) protege como dado pessoal.',
  email: 'Email pessoal (Gmail, Hotmail, etc.) identifica a pessoa e e protegido pela LGPD (Art. 5, I).',
  telefone: 'Telefone/celular pessoal e um dado que identifica a pessoa. Protegido pela LGPD (Art. 5, I).',
  endereco: 'Endereco residencial mostra onde a pessoa mora. E dado pessoal protegido pela LGPD (Art. 5, I).',
  nome: 'Nome de pessoa sem cargo ou funcao publica identificada no documento. Tratado como dado pessoal pela LGPD (Art. 5, I).',
  outro: 'Dado pessoal identificado no documento. Protegido pela LGPD (Art. 5, I).'
};

function categorizarTrecho(trecho) {
  if (RE_CPF_CAT.test(trecho)) return 'cpf';
  if (RE_EMAIL_CAT.test(trecho)) return 'email';
  if (RE_TEL_CAT.test(trecho)) return 'telefone';
  if (RE_RG_CAT.test(trecho)) return 'rg';
  if (parecerEndereco(trecho)) return 'endereco';
  if (parecerNome(trecho)) return 'nome';
  return 'outro';
}

// Gera um relatorio simplificado, em linguagem para leigo, sobre o que foi
// (e o que nao foi) tarjado no documento. A ideia e dar transparencia ao
// usuario final do sistema: total por categoria, exemplos do que foi tarjado
// com o motivo (LGPD), e exemplos do que foi PRESERVADO com o motivo (LAI,
// CNPJ nao e dado pessoal, etc.).
function gerarRelatorio(itens, linhas, tarjas) {
  const categorias = { cpf: 0, rg: 0, email: 0, telefone: 0, endereco: 0, nome: 0 };

  const tarjadosVistos = new Set();
  const tarjados = [];
  for (const t of tarjas) {
    const item = itens[t.i];
    if (!item) continue;
    const trecho = item.texto.slice(t.start, t.end).trim();
    if (!trecho) continue;
    const cat = categorizarTrecho(trecho);
    if (categorias[cat] !== undefined) categorias[cat]++;
    const chave = `${cat}:${trecho}`;
    if (tarjadosVistos.has(chave)) continue;
    tarjadosVistos.add(chave);
    tarjados.push({
      trecho,
      categoria: LABELS_CATEGORIA[cat] || 'Outro',
      motivo: MOTIVOS_TARJA[cat] || MOTIVOS_TARJA.outro
    });
  }

  const naoTarjados = [];
  const naoTarjadosVistos = new Set();
  const addNaoTarjado = (trecho, categoria, motivo) => {
    const chave = `${categoria}:${trecho}`;
    if (naoTarjadosVistos.has(chave)) return;
    naoTarjadosVistos.add(chave);
    naoTarjados.push({ trecho, categoria, motivo });
  };

  // CNPJ — identifica pessoa juridica, nao e dado pessoal pela LGPD.
  // Email institucional — dado publico pela LAI (transparencia ativa).
  for (const item of itens) {
    let m;
    const cnpjRe = new RegExp(RE_CNPJ_CAT.source, 'g');
    while ((m = cnpjRe.exec(item.texto)) !== null) {
      addNaoTarjado(
        m[0],
        'CNPJ',
        'CNPJ identifica uma empresa ou orgao (pessoa juridica), nao uma pessoa fisica. Por isso nao e considerado dado pessoal pela LGPD e deve permanecer publico.'
      );
    }
    const emails = item.texto.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [];
    for (const email of emails) {
      if (RE_EMAIL_INST_CAT.test(email)) {
        addNaoTarjado(
          email,
          'Email institucional',
          'Email institucional (dominio .gov, .leg, .jus, etc.) e um canal oficial de comunicacao do orgao publico. A LAI (Lei 12.527/2011) exige que seja publico — transparencia ativa.'
        );
      }
    }
  }

  // Nomes de agente publico: linhas que contem cargo/funcao publica.
  // Extrai nomes proprios em CAPS dessas linhas para sinalizar ao usuario
  // que foram intencionalmente preservados pela LAI.
  const nomeRegex = /\b[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]{3,}\b/g;
  const stopWords = /(RUA|AVENIDA|ALAMEDA|TRAVESSA|BAIRRO|SEDE|CEP|CNPJ|CPF|CLAUSULA|OBJETO|VALOR|PRAZO|PREGAO|CONTRATO|CAMARA|MUNICIPIO|PREFEITURA|ESTADO|GOVERNO|REPUBLICA|PROCESSO|PORTARIA|LICITACAO|CONTRATANTE|CONTRATADA|PARTES|TERMO)/i;
  for (const linha of linhas) {
    if (!linhaTemCargoPublico(linha.texto)) continue;
    const nomes = linha.texto.match(nomeRegex) || [];
    for (const nomeRaw of nomes) {
      const nome = nomeRaw.trim().replace(/\s+/g, ' ');
      const palavras = nome.split(/\s+/).filter(Boolean);
      if (palavras.length < 2) continue;
      if (stopWords.test(nome)) continue;
      addNaoTarjado(
        nome,
        'Agente publico',
        'Nome aparece junto a um cargo ou funcao publica (prefeito, vereador, servidor, fiscal, representante legal, etc.). Pela LAI (Lei 12.527/2011), atos de agentes publicos sao dados publicos — transparencia ativa.'
      );
    }
  }

  const totalCategorias = Object.values(categorias).reduce((a, b) => a + b, 0);
  return {
    resumo: {
      total: totalCategorias,
      categorias,
      categoriasLegiveis: Object.fromEntries(
        Object.entries(categorias).map(([k, v]) => [LABELS_CATEGORIA[k], v])
      )
    },
    tarjados,
    naoTarjados
  };
}

function buildPromptItens(itens, linhas) {
  const linhaDeItem = {};
  linhas.forEach((l, li) => l.itensIdx.forEach(idx => { linhaDeItem[idx] = li; }));
  return itens.map(i => ({
    i: i.indice,
    t: i.texto,
    linha: linhas[linhaDeItem[i.indice]]?.texto || i.texto
  }));
}

const PROMPT_INSTRUCOES = `Voce recebe itens de texto extraidos de um PDF de documento publico de camara municipal brasileira. Cada item tem "i" (indice), "t" (texto do item) e "linha" (texto reconstruido da linha/frase para contexto).

MARCO JURIDICO (LAI + LGPD):
A LAI (Lei 12.527/2011) determina transparencia ativa: atos de agentes publicos sao dados publicos. A LGPD (Lei 13.709/2018) protege dados pessoais de pessoas fisicas. Na interseccao: nome + cargo publico em documento oficial = dado publico (LAI prevalece). CPF, RG, endereco residencial = dado pessoal (LGPD protege, mesmo de servidor).

=== TARJAR (dado pessoal protegido pela LGPD) ===
- CPF (XXX.XXX.XXX-XX) — SEMPRE, de qualquer pessoa, inclusive agente publico
- RG (XX.XXX.XXX-X ou similar, com ou sem orgao emissor)
- Endereco RESIDENCIAL de pessoa fisica (logradouro, numero, complemento, bairro, CEP) — quando contexto indica "residente", "domiciliado", "morador"
- Email PESSOAL (@gmail, @hotmail, @yahoo, @outlook, etc.)
- Telefone/celular pessoal
- Dados bancarios pessoais (agencia, conta, banco de pessoa fisica)
- Nome de pessoa fisica SEM cargo publico ou funcao identificavel no documento — pessoa privada citada sem contexto funcional

=== NAO TARJAR (dado publico protegido pela LAI) ===
- Nome de agente publico acompanhado de cargo (Presidente, Vereador, Prefeito, Secretario, Diretor, Servidor, Fiscal, Gestor, Procurador, Assessor, Coordenador, Ouvidor, Tesoureiro, Contador, Pregoeiro, etc.)
- Nome de representante legal de empresa em contrato publico (socio, diretor, representante legal, gerente, procurador da empresa)
- Nome de signatario/testemunha de ato administrativo publico
- CNPJ
- Nome/razao social de empresa
- Endereco de SEDE de empresa ou orgao publico ("com sede", "sediada", "estabelecida", "localizada")
- Email INSTITUCIONAL (@camara.gov.br, @prefeitura.gov.br, @jus.br, @leg.br, etc.)
- Cargo, funcao, matricula funcional
- Valores monetarios, datas, prazos
- Numero de contrato, processo, portaria, licitacao
- Clausulas, objeto, texto descritivo

=== COMO DECIDIR NOMES ===
Leia o campo "linha" para contexto:
1. Se a linha contem um cargo/funcao publica (presidente, vereador, secretario, diretor, fiscal, representante legal, socio-administrador, etc.) → o nome NAO deve ser tarjado
2. Se a pessoa aparece apenas como parte civil sem cargo, sem funcao publica, e sem vinculo contratual identificavel → o nome DEVE ser tarjado
3. Na duvida entre tarjar ou nao, NAO tarje — a LAI prioriza transparencia

=== COMO DECIDIR ENDERECO ===
- "com sede", "sediada", "estabelecida", "localizada" SEM "residente"/"domiciliado" → SEDE, NAO tarjar
- "residente", "domiciliado", "morador", "residencia" → RESIDENCIAL, tarjar logradouro+numero+bairro+CEP
- Endereco pode continuar em linhas seguintes; tarjar todas as partes

=== FORMATO DE RESPOSTA ===
1. "d" deve ser substring EXATA de "t" ou "linha". Preserve capitalizacao, pontuacao e espacos.
2. Um item pode gerar varias tarjas (mesmo "i").
3. NAO inclua rotulos ("CPF:", "RG:", "Email:") na tarja — so o valor.
4. Para nomes de pessoas privadas: inclua o nome completo como "d".

Retorne SOMENTE este JSON:
{"tarjas": [{"i": 0, "d": "trecho exato"}]}`;

module.exports = {
  extrairItens,
  agruparLinhas,
  construirTarjas,
  aplicarTarjas,
  buildPromptItens,
  gerarRelatorio,
  PROMPT_INSTRUCOES,
  linhaEhSedeEmpresa,
  linhaEhResidencia,
  linhaTemCargoPublico,
};

