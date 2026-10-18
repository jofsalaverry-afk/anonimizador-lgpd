// Leitor de ZIP minimo para os testes: devolve { nome: Buffer }.
const zlib = require('zlib');
const { crc32 } = require('../../src/services/zip');

function lerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('fim do diretorio central nao encontrado');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const arquivos = {};
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('entrada central invalida');
    const metodo = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const comp = buf.readUInt32LE(p + 20);
    const nomeLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const comLen = buf.readUInt16LE(p + 32);
    const offLocal = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + nomeLen).toString('utf8');
    const ini = offLocal + 30 + buf.readUInt16LE(offLocal + 26) + buf.readUInt16LE(offLocal + 28);
    const dados = buf.subarray(ini, ini + comp);
    const conteudo = metodo === 8 ? zlib.inflateRawSync(dados) : Buffer.from(dados);
    if (crc32(conteudo) !== crc) throw new Error(`CRC invalido em ${nome}`);
    arquivos[nome] = conteudo;
    p += 46 + nomeLen + extraLen + comLen;
  }
  return arquivos;
}

module.exports = { lerZip };
