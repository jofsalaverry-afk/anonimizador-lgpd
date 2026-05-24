import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

export default function PesquisaDetail({ token, pesquisaId, onVoltar }) {
  const [pesquisa, setPesquisa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/pesquisa/${pesquisaId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPesquisa(res.data);
      } catch (err) {
        setErro(err.response?.data?.erro || 'Erro ao carregar pesquisa');
      }
      setLoading(false);
    })();
  }, [token, pesquisaId]);

  if (loading) return <p className="text-muted">Carregando...</p>;
  if (erro) return <div className="alert-error">{erro}</div>;
  if (!pesquisa) return null;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Pesquisa #{pesquisa.id.slice(-8)}</h2>
        <button onClick={onVoltar} className="btn-ghost btn-sm">← Voltar</button>
      </div>

      <div className="card mb-16">
        <div className="detail-label">Avaliação</div>
        <div className="detail-value" style={{ fontSize: 24 }}>
          <span style={{ color: '#f59e0b' }}>{'★'.repeat(pesquisa.avaliacao)}</span>
          <span style={{ color: '#cbd5e1' }}>{'★'.repeat(5 - pesquisa.avaliacao)}</span>
          <span className="text-muted text-sm" style={{ marginLeft: 12 }}>{pesquisa.avaliacao}/5</span>
        </div>

        <div className="detail-label">Setor</div>
        <div className="detail-value">{pesquisa.setor}</div>

        <div className="detail-label">Recebida em</div>
        <div className="detail-value">{new Date(pesquisa.criadoEm).toLocaleString('pt-BR')}</div>

        {pesquisa.anonimizadoEm && (
          <>
            <div className="detail-label">Anonimizada em</div>
            <div className="detail-value text-muted">{new Date(pesquisa.anonimizadoEm).toLocaleString('pt-BR')}</div>
          </>
        )}
      </div>

      <div className="card">
        <div className="detail-label">Comentário</div>
        <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{pesquisa.comentario}</div>
      </div>

      <p className="text-muted text-xs mt-16">
        Pesquisa anônima — não há identificação do respondente (nem nome, email ou IP em claro).
      </p>
    </div>
  );
}
