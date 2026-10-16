import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { baixarArquivo } from './download';

// "Gerar documento": escolhe o modelo (e o terceiro, se for aditivo),
// mostra a previa com pendencias e gera DOCX + PDF no repositorio.
export default function GeradorDocumentos({ token, onGerado }) {
  const [aberto, setAberto] = useState(false);
  const [modelos, setModelos] = useState([]);
  const [terceiros, setTerceiros] = useState(null);
  const [modeloId, setModeloId] = useState('');
  const [terceiroId, setTerceiroId] = useState('');
  const [previa, setPrevia] = useState(null);
  const [gerado, setGerado] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const headers = { Authorization: `Bearer ${token}` };
  const modelo = modelos.find(m => m.id === modeloId);

  useEffect(() => {
    if (!aberto) return;
    const h = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/gerador/modelos`, { headers: h }).then(r => { setModelos(r.data); setModeloId(r.data[0]?.id || ''); }).catch(() => setErro('Erro ao carregar modelos'));
    axios.get(`${API}/terceiros`, { headers: h }).then(r => setTerceiros(r.data.filter(t => t.ativo))).catch(() => setTerceiros(null));
  }, [aberto, token]);

  const corpo = () => (modelo?.precisaTerceiro ? { terceiroId } : {});

  const verPrevia = async () => {
    setErro(''); setGerado(null); setOcupado(true);
    try {
      const r = await axios.post(`${API}/gerador/modelos/${modeloId}/previa`, corpo(), { headers });
      setPrevia(r.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao montar prévia');
    }
    setOcupado(false);
  };

  const gerar = async () => {
    setErro(''); setOcupado(true);
    try {
      const r = await axios.post(`${API}/gerador/modelos/${modeloId}/gerar`, corpo(), { headers });
      setGerado(r.data);
      onGerado && onGerado();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao gerar documento');
    }
    setOcupado(false);
  };

  if (!aberto) return <button className="btn-primary btn-sm mb-16" onClick={() => setAberto(true)} style={{ marginLeft: 8 }}>Gerar documento</button>;

  return (
    <div className="card mb-16">
      <div className="flex-between mb-8">
        <div className="card-header" style={{ marginBottom: 0 }}>Gerar documento a partir de modelo</div>
        <button className="btn-ghost btn-sm" onClick={() => { setAberto(false); setPrevia(null); setGerado(null); }}>Fechar</button>
      </div>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      <div className="form-grid mb-8">
        <div className="form-group">
          <label>Modelo</label>
          <select value={modeloId} onChange={e => { setModeloId(e.target.value); setPrevia(null); setGerado(null); }}>
            {modelos.map(m => <option key={m.id} value={m.id}>{m.titulo}</option>)}
          </select>
          {modelo && <div className="text-xs text-muted">{modelo.descricao}</div>}
        </div>
        {modelo?.precisaTerceiro && (
          <div className="form-group">
            <label>Terceiro (operador)</label>
            {terceiros ? (
              <select value={terceiroId} onChange={e => { setTerceiroId(e.target.value); setPrevia(null); }}>
                <option value="">Selecione...</option>
                {terceiros.map(t => <option key={t.id} value={t.id}>{t.razaoSocial}</option>)}
              </select>
            ) : <p className="text-muted text-sm">Ative o módulo Terceiros para gerar aditivos.</p>}
          </div>
        )}
      </div>
      <div className="btn-row mb-12">
        <button className="btn-secondary btn-sm" onClick={verPrevia} disabled={ocupado || !modeloId}>Pré-visualizar</button>
        <button className="btn-primary btn-sm" onClick={gerar} disabled={ocupado || !previa}>{ocupado ? 'Gerando...' : 'Gerar DOCX e PDF'}</button>
      </div>

      {previa && previa.pendencias.length > 0 && (
        <div className="alert-error mb-8">
          Campos sem valor (sairão como [PREENCHER] no documento): {previa.pendencias.join('; ')}.
          Complete em Configurações → Encarregado, no ROPA ou no cadastro do terceiro.
        </div>
      )}
      {gerado && (
        <div className="alert-success mb-8">
          Versão {gerado.versao} salva no repositório como rascunho.{' '}
          {gerado.documentos.map(d => (
            <button key={d.id} className="btn-ghost btn-sm" onClick={() => baixarArquivo(token, `/repositorio/documentos/${d.id}/download`, d.nomeArquivo).catch(e => setErro(e.message))}>
              Baixar {d.formato}
            </button>
          ))}
        </div>
      )}
      {previa && (
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: 'var(--bg-sunken)', padding: 12, borderRadius: 8, maxHeight: 480, overflow: 'auto' }}>
          {previa.texto}
        </pre>
      )}
    </div>
  );
}
