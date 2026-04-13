import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import IncidenteList from './IncidenteList';
import IncidenteForm from './IncidenteForm';

// Mapa das categorias do repositorio para rotulos legiveis. Mantem os
// valores legados (POLITICA, TERMO, ADITIVO, MODELO) para nao quebrar
// documentos antigos ja cadastrados.
const CATEGORIA_LABEL = {
  POLITICA_PRIVACIDADE: 'Politica de Privacidade',
  POLITICA_SEGURANCA: 'Politica de Seguranca',
  MODELO_DSAR: 'Modelo DSAR',
  CONTRATO: 'Contrato',
  TERMO_USO: 'Termo de Uso',
  OUTRO: 'Outros',
  // legado
  POLITICA: 'Politica (legado)',
  TERMO: 'Termo (legado)',
  ADITIVO: 'Aditivo (legado)',
  MODELO: 'Modelo (legado)'
};

// Ordem de exibicao das categorias nos cards agrupados.
const ORDEM_CATEGORIA = [
  'POLITICA_PRIVACIDADE', 'POLITICA_SEGURANCA', 'MODELO_DSAR',
  'CONTRATO', 'TERMO_USO', 'OUTRO',
  'POLITICA', 'TERMO', 'ADITIVO', 'MODELO'
];

function iconePorMime(mime) {
  if (!mime) return '📄';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('word')) return '📘';
  return '📄';
}

function RepositorioArquivos({ token }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const res = await axios.get(`${API}/repositorio/documentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocs(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar documentos');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const baixar = async (doc) => {
    try {
      const res = await axios.get(`${API}/repositorio/documentos/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nomeArquivo || `${doc.titulo}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao baixar arquivo');
    }
  };

  if (loading) return <p className="text-muted">Carregando...</p>;
  if (erro) return <div className="alert-error">{erro}</div>;
  if (!docs.length) {
    return (
      <div className="card">
        <h2 className="card-header">Repositorio de Documentos</h2>
        <p className="text-muted">Nenhum documento disponivel ainda. Os documentos sao publicados pelo administrador do sistema.</p>
      </div>
    );
  }

  // Agrupa por categoria (tipo)
  const grupos = {};
  for (const d of docs) {
    (grupos[d.tipo] = grupos[d.tipo] || []).push(d);
  }
  const categoriasComDocs = ORDEM_CATEGORIA.filter(c => grupos[c] && grupos[c].length);

  return (
    <div>
      <div className="card mb-16">
        <h2 className="card-header">Repositorio de Documentos</h2>
        <p className="text-sm" style={{ color: '#64748b' }}>
          Documentos institucionais e modelos disponibilizados pela sua organizacao. Clique em qualquer card para baixar.
        </p>
      </div>

      {categoriasComDocs.map(cat => (
        <div key={cat} className="card mb-16">
          <h3 className="card-header">{CATEGORIA_LABEL[cat] || cat}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {grupos[cat].map(d => (
              <div
                key={d.id}
                style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{iconePorMime(d.mimetype)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.titulo}</div>
                    <div className="text-muted text-xs">
                      {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
                      {d.tamanhoBytes ? ` · ${(d.tamanhoBytes / 1024).toFixed(0)} KB` : ''}
                    </div>
                  </div>
                </div>
                {d.descricao && (
                  <div className="text-sm" style={{ color: '#475569' }}>{d.descricao}</div>
                )}
                {d.mimetype ? (
                  <button
                    type="button"
                    onClick={() => baixar(d)}
                    className="btn-primary btn-sm"
                    style={{ marginTop: 'auto' }}
                  >
                    ⬇ Baixar
                  </button>
                ) : (
                  <span className="text-muted text-xs" style={{ marginTop: 'auto' }}>Documento de texto (sem arquivo)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Repositorio({ token, subpagina }) {
  const [tela, setTela] = useState('list');
  const [itemId, setItemId] = useState(null);

  useEffect(() => {
    setTela('list');
    setItemId(null);
  }, [subpagina]);

  if (subpagina === 'documentos') {
    return <RepositorioArquivos token={token} />;
  }

  if (subpagina === 'incidentes') {
    if (tela === 'novo') {
      return <IncidenteForm token={token} onVoltar={() => setTela('list')} />;
    }
    if (tela === 'ver') {
      return (
        <IncidenteForm
          token={token}
          incidenteId={itemId}
          onVoltar={() => setTela('list')}
        />
      );
    }
    return (
      <IncidenteList
        token={token}
        onNovo={() => setTela('novo')}
        onVer={(id) => { setItemId(id); setTela('ver'); }}
      />
    );
  }

  return <p className="text-muted">Selecione uma subpagina do repositorio.</p>;
}
