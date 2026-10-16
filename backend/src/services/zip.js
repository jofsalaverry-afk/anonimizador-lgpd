// Escritor de ZIP minimo, em streaming, sem dependencia externa.
// Cada arquivo e escrito assim que adicionado (header local + dados);
// o diretorio central vai no final. Suporta nomes UTF-8 (flag 0x0800),
// "store" (0) e "deflate" (8). Limites: < 65535 arquivos e < 4 GB
// (sem ZIP64) — suficiente para o pacote de portabilidade.
const zlib = require('zlib');

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d) {
  const tempo = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { tempo, data };
}

class ZipWriter {
  // destino: qualquer stream gravavel (ex.: res do Express)
  constructor(destino) {
    this.destino = destino;
    this.entradas = [];
    this.offset = 0;
  }

  async _escrever(buf) {
    this.offset += buf.length;
    if (!this.destino.write(buf)) await new Promise(r => this.destino.once('drain', r));
  }

  // comprimir=false para arquivos ja comprimidos (pdf, png, jpg, docx)
  async adicionar(nome, conteudo, { comprimir = true, data = new Date() } = {}) {
    const dados = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8');
    const nomeBuf = Buffer.from(nome.replace(/\\/g, '/'), 'utf8');
    const crc = crc32(dados);
    let metodo = 0;
    let gravado = dados;
    if (comprimir) {
      const comp = zlib.deflateRawSync(dados, { level: 6 });
      if (comp.length < dados.length) { metodo = 8; gravado = comp; }
    }
    const { tempo, data: dia } = dataDos(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(tempo, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(gravado.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const offsetLocal = this.offset;
    await this._escrever(local);
    await this._escrever(nomeBuf);
    await this._escrever(gravado);
    this.entradas.push({ nomeBuf, metodo, tempo, dia, crc, comp: gravado.length, tamanho: dados.length, offsetLocal });
  }

  async finalizar() {
    const inicioCentral = this.offset;
    for (const e of this.entradas) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(20, 6);
      h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(e.metodo, 10);
      h.writeUInt16LE(e.tempo, 12);
      h.writeUInt16LE(e.dia, 14);
      h.writeUInt32LE(e.crc, 16);
      h.writeUInt32LE(e.comp, 20);
      h.writeUInt32LE(e.tamanho, 24);
      h.writeUInt16LE(e.nomeBuf.length, 28);
      h.writeUInt16LE(0, 30);
      h.writeUInt16LE(0, 32);
      h.writeUInt16LE(0, 34);
      h.writeUInt16LE(0, 36);
      h.writeUInt32LE(0, 38);
      h.writeUInt32LE(e.offsetLocal, 42);
      await this._escrever(h);
      await this._escrever(e.nomeBuf);
    }
    const tamCentral = this.offset - inicioCentral;
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(0, 4);
    fim.writeUInt16LE(0, 6);
    fim.writeUInt16LE(this.entradas.length, 8);
    fim.writeUInt16LE(this.entradas.length, 10);
    fim.writeUInt32LE(tamCentral, 12);
    fim.writeUInt32LE(inicioCentral, 16);
    fim.writeUInt16LE(0, 20);
    await this._escrever(fim);
  }
}

module.exports = { ZipWriter, crc32 };
