// Etapa 7a: protecoes de texto vindo de usuario.

// CSV: celula que comeca com = + - @ (ou tab/CR) vira formula ao abrir no
// Excel/LibreOffice ("CSV injection"). Prefixa com apostrofo e aplica as
// aspas do CSV quando precisa.
function celulaCsv(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

// Link de evidencia: aceita referencia em texto (ex.: "Processo SEI 123") ou
// endereco http/https. Recusa esquemas perigosos (javascript:, data:...) e
// qualquer outro endereco com "://".
const ESQUEMAS_PERIGOSOS = ['javascript', 'data', 'vbscript', 'file', 'blob', 'about'];
function erroLinkEvidencia(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const m = s.match(/^([a-z][a-z0-9+.-]*):/i);
  const esquema = m ? m[1].toLowerCase().replace(/\s/g, '') : '';
  if (ESQUEMAS_PERIGOSOS.includes(esquema)) return 'Link de evidência inválido: use um endereço http:// ou https:// ou uma referência em texto';
  if (/:\/\//.test(s) && !['http', 'https'].includes(esquema)) return 'Link de evidência inválido: use um endereço http:// ou https://';
  if (s.length > 2000) return 'Link de evidência muito longo';
  return null;
}
const ehLinkHttp = v => /^https?:\/\//i.test(String(v || '').trim());

// Nome de arquivo: tira separadores de caminho, caracteres de controle
// (C0/C1) e de direcao de texto (ex.: U+202E, que disfarca a extensao).
function limparNomeArquivo(nome) {
  const limpo = String(nome || 'arquivo')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f-\x9f]/g, '_')
    .trim();
  return (limpo || 'arquivo').slice(0, 200);
}

module.exports = { celulaCsv, erroLinkEvidencia, ehLinkHttp, limparNomeArquivo };
