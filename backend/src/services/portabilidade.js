// Pacote de portabilidade (item 4.6.6.2.8.1 do TR): ZIP com todos os
// modulos em CSV e JSON, anexos, documentos do repositorio, dicionario de
// dados, guia de importacao e manifesto com SHA-256 de cada arquivo.
const crypto = require('crypto');
const { ZipWriter } = require('./zip');
const { EXPORTADORES, gerarExport, contexto } = require('./exportadores');

const MIMES_JA_COMPRIMIDOS = /^(image\/(png|jpeg|gif|webp)|application\/(pdf|vnd\.openxmlformats))/;

function nomeArquivoSeguro(s) {
  return String(s || 'arquivo').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150);
}

function dicionarioDeDados(orgNome, geradoEm) {
  const partes = [
    `# Dicionário de dados — pacote de portabilidade`,
    ``,
    `Organização: ${orgNome}  `,
    `Gerado em: ${geradoEm.toISOString()}`,
    ``,
    `Cada módulo vem em dois formatos com o mesmo nome base: \`.csv\` (uma linha por registro, colunas abaixo) e \`.json\` (estrutura completa, com listas aninhadas e ids originais).`,
    ``
  ];
  for (const ex of Object.values(EXPORTADORES)) {
    partes.push(`## ${ex.arquivo}.csv / ${ex.arquivo}.json — ${ex.titulo}`, '', ex.descricao, '', '| Coluna no CSV | Chave no JSON |', '|---|---|');
    for (const [campo, desc] of ex.colunas) partes.push(`| ${desc} | \`${campo}\` |`);
    partes.push('');
  }
  partes.push(
    `## anexos/indice-anexos.csv — Anexos e evidências`, '',
    'Um arquivo por anexo em `anexos/<ENTIDADE>/<registroId>/<id>-<nome>`. ENTIDADE indica a tabela de origem (TRATAMENTO, SOLICITACAO_DSAR, INCIDENTE, CHECKLIST_ITEM, SISTEMA, TERCEIRO, DESCARTE, ...).', '',
    '| Campo | Descrição |', '|---|---|',
    '| `id` | Identificador do anexo |', '| `entidade` | Tipo do registro dono |', '| `registroId` | Id do registro dono (nos CSV/JSON do módulo) |',
    '| `nomeArquivo` | Nome original |', '| `mimeType` | Tipo do arquivo |', '| `tamanho` | Bytes |',
    '| `hashSha256` | SHA-256 calculado no envio (confira com o arquivo) |', '| `enviadoPor` | Quem enviou (nome) |', '| `criadoEm` | Envio (data e hora de Brasília) |',
    '| `caminho` | Caminho do arquivo dentro do ZIP |', '',
    `## documentos/indice-documentos.csv — Repositório de documentos`, '',
    'Políticas, termos, aditivos e modelos do repositório, em `documentos/<id>-<nome>`. Documentos excluídos (exclusão lógica) vêm com a data e o motivo da exclusão.', '',
    `## manifesto.json`, '',
    'Lista de todos os arquivos do pacote com tamanho e SHA-256, para conferência de integridade.', ''
  );
  return partes.join('\n');
}

const GUIA_IMPORTACAO = `# Guia de importação

## Formato dos arquivos

- **CSV**: UTF-8 com BOM, separador ponto e vírgula (\`;\`), quebra de linha CRLF, campos com \`;\`/aspas/quebra de linha entre aspas duplas (aspas internas duplicadas). Cabeçalho com o nome legível da coluna (a chave correspondente do JSON está no dicionário de dados). Abre direto no Excel/LibreOffice em português.
- **Valores no CSV**: rótulos legíveis (ex.: "Em análise", "Alta", "Sim"/"Não") no lugar dos códigos internos.
- **Datas no CSV**: data e hora de Brasília (\`dd/mm/aaaa hh:mm\`); datas sem hora (ocorrência, prazo, descarte) como \`dd/mm/aaaa\`.
- **JSON**: UTF-8, estrutura completa de cada módulo, com ids originais, códigos internos e listas aninhadas (ex.: providências dentro de cada incidente). Datas no JSON em ISO 8601 (UTC).
- **Listas em CSV**: itens separados por \`; \` (ponto e vírgula + espaço), dentro da mesma célula.

## Ordem sugerida de importação

1. \`usuarios\` e \`setores\` (são referenciados pelos demais).
2. \`terceiros-operadores\` e \`inventario-sistemas\`.
3. \`ropa-tratamentos\` (referencia setores, sistemas e terceiros) e \`ropa-descartes\`.
4. \`dsar-solicitacoes\`, \`incidentes\`, \`checklist-conformidade\`, \`treinamento-progresso\`.
5. \`historico-alteracoes\` e \`indicadores-snapshots\` (registros de auditoria).
6. Anexos: use \`anexos/indice-anexos.csv\` para religar cada arquivo ao registro (\`entidade\` + \`registroId\`).

## Relacionamentos

Os ids são os mesmos em todos os arquivos. Nos CSV, nomes de pessoas aparecem já resolvidos; nos JSON, ficam os ids (\`responsavelId\`, \`usuarioId\` etc.) — use \`usuarios.json\` para cruzar.

## Integridade

O \`manifesto.json\` traz o SHA-256 de cada arquivo do pacote. Em Linux/macOS: \`sha256sum arquivo\`; no Windows (PowerShell): \`Get-FileHash arquivo -Algorithm SHA256\`. Os anexos também trazem o hash calculado no momento do envio (\`hashSha256\` no índice).

## Dados pessoais

O pacote contém dados pessoais (titulares de DSAR, servidores, contatos de terceiros). Armazene e transmita com o mesmo cuidado do sistema de origem e elimine cópias que não forem mais necessárias.
`;

// Escreve o ZIP no stream de destino. Le os anexos um a um para nao
// carregar tudo na memoria.
async function gerarPacote(db, organizacaoId, destino) {
  const zip = new ZipWriter(destino);
  const geradoEm = new Date();
  const manifesto = [];
  const org = await db.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } });
  const add = async (caminho, conteudo, opts) => {
    const buf = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8');
    manifesto.push({ caminho, tamanho: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    await zip.adicionar(caminho, buf, opts);
  };

  const ctx = await contexto(db, organizacaoId);
  const contagem = {};
  for (const nome of Object.keys(EXPORTADORES)) {
    const { ex, json, csv, linhas } = await gerarExport(db, nome, organizacaoId, ctx);
    contagem[ex.arquivo] = linhas.length;
    await add(`${ex.arquivo}.csv`, csv);
    await add(`${ex.arquivo}.json`, JSON.stringify(json, null, 2));
  }

  // Anexos (evidencias)
  const metas = await db.anexo.findMany({
    where: { organizacaoId },
    select: { id: true, entidade: true, registroId: true, nomeArquivo: true, mimeType: true, tamanho: true, hashSha256: true, enviadoPorId: true, criadoEm: true },
    orderBy: { criadoEm: 'asc' }
  });
  const indiceAnexos = [];
  for (const m of metas) {
    const a = await db.anexo.findFirst({ where: { id: m.id, organizacaoId }, select: { conteudo: true } });
    const caminho = `anexos/${m.entidade}/${m.registroId}/${m.id}-${nomeArquivoSeguro(m.nomeArquivo)}`;
    await add(caminho, Buffer.from(a.conteudo), { comprimir: !MIMES_JA_COMPRIMIDOS.test(m.mimeType), data: new Date(m.criadoEm) });
    indiceAnexos.push({ ...m, enviadoPor: ctx.nome(m.enviadoPorId), criadoEm: new Date(m.criadoEm).toISOString(), caminho });
  }
  const { paraCsv } = require('./exportadores');
  const R = require('./rotulos');
  await add('anexos/indice-anexos.csv', paraCsv(
    [['id'], ['entidade', null, R.ENTIDADE], ['registroId'], ['nomeArquivo'], ['mimeType'], ['tamanho'], ['hashSha256'], ['enviadoPor'], ['criadoEm', null, 'datahora'], ['caminho']],
    indiceAnexos
  ));

  // Documentos do repositorio
  const docs = await db.documentoRepositorio.findMany({
    where: { organizacaoId },
    select: { id: true, tipo: true, titulo: true, descricao: true, status: true, nomeArquivo: true, mimetype: true, tamanhoBytes: true, criadoEm: true, excluidoEm: true, motivoExclusao: true }
  });
  const indiceDocs = [];
  for (const d of docs) {
    let caminho = '';
    if (d.mimetype) {
      const c = await db.documentoRepositorio.findFirst({ where: { id: d.id, organizacaoId }, select: { arquivo: true } });
      if (c?.arquivo) {
        caminho = `documentos/${d.id}-${nomeArquivoSeguro(d.nomeArquivo || d.titulo)}`;
        await add(caminho, Buffer.from(c.arquivo), { comprimir: !MIMES_JA_COMPRIMIDOS.test(d.mimetype) });
      }
    }
    indiceDocs.push({ ...d, criadoEm: new Date(d.criadoEm).toISOString(), excluidoEm: d.excluidoEm ? new Date(d.excluidoEm).toISOString() : '', caminho });
  }
  await add('documentos/indice-documentos.csv', paraCsv(
    [['id'], ['tipo', null, R.CATEGORIA_DOCUMENTO], ['titulo'], ['descricao'], ['status', null, R.STATUS], ['nomeArquivo'], ['mimetype'], ['tamanhoBytes'], ['criadoEm', null, 'datahora'], ['excluidoEm', null, 'datahora'], ['motivoExclusao'], ['caminho']],
    indiceDocs
  ));

  await add('dicionario-de-dados.md', dicionarioDeDados(org?.nome || '', geradoEm));
  await add('guia-de-importacao.md', GUIA_IMPORTACAO);
  // manifesto por ultimo (lista os anteriores)
  await zip.adicionar('manifesto.json', JSON.stringify({
    organizacao: org?.nome || '', geradoEm: geradoEm.toISOString(), registrosPorArquivo: contagem,
    anexos: indiceAnexos.length, documentos: indiceDocs.length, arquivos: manifesto
  }, null, 2));
  await zip.finalizar();
  return { arquivos: manifesto.length + 1, anexos: indiceAnexos.length };
}

module.exports = { gerarPacote, GUIA_IMPORTACAO, dicionarioDeDados };
