import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { API } from '../config';

const ACEITOS = '.pdf,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp';
const LIMITE_MB = 20;

function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Anexos de qualquer registro. entidade: TRATAMENTO | SOLICITACAO_DSAR |
// INCIDENTE | CHECKLIST_ITEM. somenteLeitura esconde o envio (AUDITOR etc.).
export default function Anexos({ token, entidade, registroId, somenteLeitura = false, onEnviado, titulo = 'Anexos e evidências' }) {
  const [anexos, setAnexos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const inputRef = useRef(null);
  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    if (!registroId) return;
    try {
      const res = await axios.get(`${API}/anexos`, {
        params: { entidade, registroId },
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnexos(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar anexos');
    }
    setCarregando(false);
  }, [token, entidade, registroId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (arquivo.size > LIMITE_MB * 1024 * 1024) {
      setErro(`Arquivo maior que ${LIMITE_MB} MB`);
      return;
    }
    setErro('');
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('entidade', entidade);
      fd.append('registroId', registroId);
      fd.append('arquivo', arquivo);
      await axios.post(`${API}/anexos`, fd, { headers });
      await carregar();
      onEnviado && onEnviado();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao enviar arquivo');
    }
    setEnviando(false);
  };

  const baixar = async (a) => {
    try {
      const res = await axios.get(`${API}/anexos/${a.id}/download`, { headers, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.nomeArquivo;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setErro('Erro ao baixar arquivo');
    }
  };

  if (!registroId) return null;

  return (
    <div className="card mb-16">
      <div className="flex-between mb-12">
        <div className="card-header" style={{ marginBottom: 0 }}>{titulo} ({anexos.length})</div>
        {!somenteLeitura && (
          <>
            <input ref={inputRef} type="file" accept={ACEITOS} onChange={enviar} style={{ display: 'none' }} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando} className="btn-secondary btn-sm acao-escrita">
              {enviando ? 'Enviando...' : '+ Anexar arquivo'}
            </button>
          </>
        )}
      </div>
      {erro && <div className="alert-error mb-12">{erro}</div>}
      {carregando ? (
        <p className="text-muted">Carregando...</p>
      ) : anexos.length === 0 ? (
        <p className="text-muted">Nenhum arquivo anexado. Aceita PDF, DOCX e imagens até {LIMITE_MB} MB.</p>
      ) : (
        anexos.map(a => (
          <div key={a.id} className="flex-between" style={{ padding: '8px 0', borderTop: '1px solid #eef0f4' }}>
            <div>
              <button type="button" onClick={() => baixar(a)} className="btn-ghost btn-sm" style={{ padding: 0 }}>
                📎 {a.nomeArquivo}
              </button>
              <div className="text-muted text-xs">
                {tamanhoLegivel(a.tamanho)} · enviado por {a.enviadoPor?.nome || '—'} em {new Date(a.criadoEm).toLocaleString('pt-BR')}
              </div>
              <div className="text-muted text-xs" title={a.hashSha256}>SHA-256: {a.hashSha256.slice(0, 16)}…</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
