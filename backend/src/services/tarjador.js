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

// Heuristica: parece NOME PROPRIO de pessoa em ALL CAPS (comum em contratos
// brasileiros: "MARIA DE FATIMA SANTOS"). Nao aplica a nomes de cidades em
// Title Case como "Nova Esperança do Sudoeste". Usado para rejeitar tarjas
// que a IA retornou indevidamente.
function parecerNome(txt) {
  const t = txt.trim().replace(/[,.;:]+$/, '');
  if (!t) return false;
  if (/\d/.test(t)) return false;
  if (/@/.test(t)) return false;
  if (!/^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s.'-]+$/.test(t)) return false; // somente MAIUSCULAS
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return false;
  if (/(RUA|AVENIDA|ALAMEDA|TRAVESSA|BAIRRO|SEDE|CEP|CNPJ|CONTRATANTE|CONTRATADA|CLAUSULA|OBJETO|VALOR)/.test(t)) return false;
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

    // Filtros: rejeita nomes, texto meta, endereco em contexto de sede
    if (parecerNome(t.d)) continue;
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

  // Per-item scan — garantia absoluta quando CPF esta inteiro em um item
  for (const item of itens) {
    for (const re of [new RegExp(CPF_ITEM.source, 'g'), new RegExp(EMAIL_RE.source, 'g'), new RegExp(TEL_RE.source, 'g')]) {
      let m;
      while ((m = re.exec(item.texto)) !== null) {
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

function buildPromptItens(itens, linhas) {
  const linhaDeItem = {};
  linhas.forEach((l, li) => l.itensIdx.forEach(idx => { linhaDeItem[idx] = li; }));
  return itens.map(i => ({
    i: i.indice,
    t: i.texto,
    linha: linhas[linhaDeItem[i.indice]]?.texto || i.texto
  }));
}

const PROMPT_INSTRUCOES = `Voce recebe itens de texto extraidos de um PDF de documento publico brasileiro. Cada item tem "i" (indice), "t" (texto do item) e "linha" (texto reconstruido da linha/frase em que esse item aparece, para contexto). Identifique dados que DEVEM ser anonimizados conforme LGPD e LAI, retornando o TRECHO EXATO (substring) que deve ser coberto por tarja.

TARJAR SOMENTE:
- CPF no formato XXX.XXX.XXX-XX — SEMPRE, de qualquer pessoa, mesmo no meio de frase
- RG (formato XX.XXX.XXX-X, XX.XXX.XXX ou similar, com ou sem orgao emissor tipo SSP/SP)
- Endereco residencial de pessoa fisica: logradouro (rua, avenida, alameda, etc.), numero, complemento, bairro e CEP — APENAS quando for domicilio de pessoa fisica
- Email pessoal (qualquer email de pessoa fisica)
- Telefone/celular pessoal

NUNCA TARJAR:
- Nomes de pessoas — NENHUM nome deve ser tarjado (nem pessoa fisica privada, nem agente publico, nem testemunha, nem representante, nem socio)
- CNPJ
- Nome/razao social de empresa
- Endereco de SEDE de empresa (ainda que contenha rua, numero, CEP)
- Cargo (presidente, vereador, diretor, socio, consultor, fiscal, etc.)
- Valores monetarios, datas
- Numero de contrato, processo, portaria, matricula
- Objeto do contrato, clausulas, texto descritivo
- Rotulos/labels como "CPF:", "RG:", "Email:", "Telefone:"

COMO DECIDIR ENDERECO (residencial vs sede):
- Use o campo "linha". Se contem "com sede", "sediada", "estabelecida", "localizada" e nao contem "residente"/"domiciliado" — e SEDE de empresa, NAO TARJAR.
- Se contem "residente", "domiciliado", "morador", "residencia" — e residencial, TARJAR logradouro, numero, complemento, bairro e CEP.
- Um endereco pode se estender por varias linhas; tarjar todas as partes (continuacao do logradouro, bairro, CEP) mesmo que a palavra "residente" so apareca na primeira linha.

REGRAS DE FORMATO:
1. "d" deve ser substring EXATA encontrada em "t" OU na "linha" (se a frase esta quebrada entre varios itens). Preserve capitalizacao, pontuacao e espacos.
2. Um mesmo item pode gerar varias tarjas com o mesmo "i".
3. Nao inclua rotulos (ex: "CPF:", "RG:", "Email:") na tarja — so o valor.
4. LEMBRETE: jamais retorne nome de pessoa como tarja.

Retorne SOMENTE este JSON, sem comentarios:
{"tarjas": [{"i": 0, "d": "trecho exato"}]}`;

module.exports = {
  extrairItens,
  agruparLinhas,
  construirTarjas,
  aplicarTarjas,
  buildPromptItens,
  PROMPT_INSTRUCOES,
  linhaEhSedeEmpresa,
  linhaEhResidencia,
};
