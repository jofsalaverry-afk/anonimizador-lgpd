// Conversao PDF -> PDF/A-2b com Ghostscript.
//
// Requisitos no servidor: ghostscript (aptPkgs no backend/nixpacks.toml)
// e um perfil ICC sRGB. O perfil e procurado nas pastas do proprio
// Ghostscript (iccprofiles/srgb.icc ou default_rgb.icc); da para forcar
// com PDFA_ICC_PATH. O executavel pode ser forcado com GHOSTSCRIPT_PATH.
//
// Sem Ghostscript/ICC: lanca PdfaIndisponivelError e a rota responde 503
// com mensagem clara — o resto do sistema segue funcionando.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

class PdfaIndisponivelError extends Error {
  constructor(msg) { super(msg); this.name = 'PdfaIndisponivelError'; }
}

let cacheGs;
function localizarGhostscript() {
  if (cacheGs !== undefined) return cacheGs;
  const candidatos = [process.env.GHOSTSCRIPT_PATH, 'gs', 'gswin64c', 'gswin32c'].filter(Boolean);
  cacheGs = null;
  for (const c of candidatos) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0) { cacheGs = { cmd: c, versao: r.stdout.trim() }; break; }
  }
  return cacheGs;
}

let cacheIcc;
function localizarIcc(gs) {
  if (cacheIcc !== undefined) return cacheIcc;
  cacheIcc = null;
  if (process.env.PDFA_ICC_PATH && fs.existsSync(process.env.PDFA_ICC_PATH)) return (cacheIcc = process.env.PDFA_ICC_PATH);
  const pastas = new Set();
  // "gs -h" lista o search path; iccprofiles fica ao lado de Resource/lib
  if (gs) {
    const ajuda = spawnSync(gs.cmd, ['-h'], { encoding: 'utf8', timeout: 5000 }).stdout || '';
    const trecho = ajuda.split(/Search path:/i)[1] || '';
    for (const p of trecho.split(/[\s:;]+/).filter(x => x.startsWith('/') || /^[A-Za-z]:\\/.test(x))) {
      pastas.add(path.join(p, '..', 'iccprofiles'));
      pastas.add(path.join(p, '..', '..', 'iccprofiles'));
      pastas.add(path.join(p, 'iccprofiles'));
    }
  }
  for (const base of ['/usr/share/ghostscript', '/usr/local/share/ghostscript', 'C:\\Program Files\\gs']) {
    try {
      for (const v of fs.readdirSync(base)) {
        pastas.add(path.join(base, v, 'iccprofiles'));
        pastas.add(path.join(base, v, 'Resource', 'ColorSpace'));
      }
      pastas.add(path.join(base, 'iccprofiles'));
    } catch { /* pasta inexistente */ }
  }
  // Debian/Ubuntu (pacote libgs-common) instalam os perfis aqui
  pastas.add('/usr/share/color/icc/ghostscript');
  pastas.add('/usr/share/color/icc');
  for (const p of pastas) {
    for (const nome of ['srgb.icc', 'sRGB.icc', 'default_rgb.icc']) {
      const f = path.join(p, nome);
      if (fs.existsSync(f)) return (cacheIcc = f);
    }
  }
  return cacheIcc;
}

function statusPdfa() {
  const gs = localizarGhostscript();
  const icc = gs ? localizarIcc(gs) : null;
  return { disponivel: !!(gs && icc), ghostscript: gs?.versao || null, icc: icc ? path.basename(icc) : null };
}

// Arquivo PostScript que injeta o OutputIntent sRGB exigido pelo PDF/A.
// Etapa 7b: titulo em UTF-16BE hexadecimal (<FEFF...>). Em texto literal o
// Ghostscript le PDFDocEncoding: acentos viravam lixo e o "í" (byte 0xAD)
// derrubava a conversao.
const textoPdf = s => '<FEFF' + Buffer.from(String(s), 'utf16le').swap16().toString('hex').toUpperCase() + '>';
function pdfaDefPs(iccPath, titulo) {
  const esc = s => String(s).replace(/[\\()]/g, m => '\\' + m);
  return `%!
[ /Title ${textoPdf(titulo)} /DOCINFO pdfmark
/ICCProfile (${esc(iccPath.replace(/\\/g, '/'))}) def
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} ICCProfile (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} <<
  /Type /OutputIntent
  /S /GTS_PDFA1
  /DestOutputProfile {icc_PDFA}
  /OutputConditionIdentifier (sRGB IEC61966-2.1)
>> /PUT pdfmark
[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
`;
}

function argumentosGs({ entrada, saida, defPs, iccPath }) {
  return [
    '-dPDFA=2', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dNOOUTERSAVE',
    '-sDEVICE=pdfwrite', '-dPDFACompatibilityPolicy=1',
    '-sColorConversionStrategy=RGB', '-sProcessColorModel=DeviceRGB',
    `--permit-file-read=${path.dirname(iccPath).replace(/\\/g, '/')}/`,
    `-sOutputFile=${saida}`, defPs, entrada
  ];
}

function executarGs(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let erro = '';
    p.stderr.on('data', d => { erro += d; });
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Ghostscript excedeu 60 s')); }, 60000);
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Ghostscript falhou (código ${code}): ${erro.slice(0, 500)}`));
    });
  });
}

// pdf: Buffer gerado pelo pdfkit. Devolve Buffer PDF/A-2b.
// opcoes.executar permite injetar o executor nos testes.
async function converterParaPdfA(pdf, { titulo = 'Relatório', executar } = {}) {
  const gs = localizarGhostscript();
  if (!gs && !executar) throw new PdfaIndisponivelError('Geração de PDF/A indisponível: Ghostscript não está instalado no servidor.');
  const iccPath = executar ? (process.env.PDFA_ICC_PATH || 'srgb.icc') : localizarIcc(gs);
  if (!iccPath) throw new PdfaIndisponivelError('Geração de PDF/A indisponível: perfil de cor ICC sRGB não encontrado no servidor (defina PDFA_ICC_PATH).');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfa-'));
  try {
    const entrada = path.join(dir, 'entrada.pdf');
    const saida = path.join(dir, 'saida.pdf');
    const defPs = path.join(dir, 'PDFA_def.ps');
    fs.writeFileSync(entrada, pdf);
    fs.writeFileSync(defPs, pdfaDefPs(iccPath, titulo));
    const args = argumentosGs({ entrada, saida, defPs, iccPath });
    await (executar ? executar(args, { entrada, saida, defPs }) : executarGs(gs.cmd, args));
    return fs.readFileSync(saida);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { converterParaPdfA, statusPdfa, PdfaIndisponivelError, argumentosGs, pdfaDefPs };
