import axios from 'axios';
import { API } from '../config';

// Baixa um arquivo de rota autenticada. O nome vem do Content-Disposition
// quando houver; senao usa nomePadrao. Erros JSON (ex.: 503 do PDF/A)
// viram Error com a mensagem do backend.
export async function baixarArquivo(token, caminho, nomePadrao, params) {
  try {
    const res = await axios.get(`${API}${caminho}`, { params, headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' });
    const disp = res.headers['content-disposition'] || '';
    const nome = (disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1];
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome ? decodeURIComponent(nome) : nomePadrao;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    let msg = 'Erro ao baixar arquivo';
    if (err.response?.data instanceof Blob) {
      try { msg = JSON.parse(await err.response.data.text()).erro || msg; } catch { /* corpo nao-JSON */ }
    }
    throw new Error(msg);
  }
}

// Botoes padrao "CSV / JSON" de um modulo. rotulo: o que se exporta, quando
// a tela tem mais de uma exportacao (ex.: "descartes") — evita botoes iguais.
export function BotoesExportar({ token, caminho, nome, onErro, extra, rotulo }) {
  const baixar = (formato) => baixarArquivo(token, caminho, `${nome}.${formato}`, { formato }).catch(e => onErro && onErro(e.message));
  const texto = f => (rotulo ? `Exportar ${rotulo} (${f})` : `Exportar ${f}`);
  return (
    <>
      <button className="btn-secondary btn-sm" onClick={() => baixar('csv')}>{texto('CSV')}</button>
      <button className="btn-secondary btn-sm" onClick={() => baixar('json')}>{texto('JSON')}</button>
      {extra}
    </>
  );
}

// Botao do relatorio PDF/A de um tipo (ropa | dsar | incidentes | indicadores).
export function BotaoPdfA({ token, tipo, onErro }) {
  const baixar = () => baixarArquivo(token, `/relatorios/${tipo}/pdfa`, `relatorio-${tipo}-pdfa.pdf`).catch(e => onErro && onErro(e.message));
  return <button className="btn-secondary btn-sm" onClick={baixar} title="Relatório em PDF/A-2b (arquivamento)">Relatório PDF/A</button>;
}
