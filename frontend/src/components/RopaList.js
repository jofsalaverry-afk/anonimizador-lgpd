import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

const BASE_LEGAL_LABEL = {
  CONSENTIMENTO: 'Consentimento',
  OBRIGACAO_LEGAL: 'Obrigacao Legal',
  EXECUCAO_CONTRATO: 'Execucao de Contrato',
  INTERESSE_LEGITIMO: 'Interesse Legitimo',
  PROTECAO_VIDA: 'Protecao a Vida',
  TUTELA_SAUDE: 'Tutela da Saude',
  INTERESSE_PUBLICO: 'Interesse Publico',
  EXERCICIO_DIREITOS: 'Exercicio de Direitos'
};

export default function RopaList({ token, onNovo, onVer, onEditar }) {
  const [tratamentos, setTratamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroBase, setFiltroBase] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/ropa/tratamentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTratamentos(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar tratamentos');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const desativar = async (id) => {
    if (!window.confirm('Desativar este tratamento?')) return;
    try {
      await axios.delete(`${API}/ropa/tratamentos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao desativar');
    }
  };

  const exportar = async (formato) => {
    try {
      const res = await axios.get(`${API}/ropa/export?formato=${formato}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: formato === 'csv' ? 'blob' : 'json'
      });
      if (formato === 'csv') {
        const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'ropa-tratamentos.csv'; a.click();
      } else {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'ropa-tratamentos.json'; a.click();
      }
    } catch (err) {
      setErro('Erro ao exportar');
    }
  };

  const filtrados = tratamentos.filter(t => {
    if (filtroBase && t.baseLegal !== filtroBase) return false;
    if (filtroStatus === 'ativo' && !t.ativo) return false;
    if (filtroStatus === 'inativo' && t.ativo) return false;
    return true;
  });

  if (loading) return <p style={{ color: '#64748b', fontSize: 13 }}>Carregando...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Mapeamento ROPA</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => exportar('csv')} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>Exportar CSV</button>
          <button onClick={() => exportar('json')} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>Exportar JSON</button>
          <button onClick={onNovo} className="btn-primary" style={{ fontSize: 12, padding: '6px 16px' }}>+ Novo tratamento</button>
        </div>
      </div>

      {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <option value="">Todas as bases legais</option>
          {Object.entries(BASE_LEGAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <option value="todos">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
          <p style={{ fontSize: 14 }}>Nenhum tratamento registrado.</p>
          <button onClick={onNovo} className="btn-primary" style={{ fontSize: 13, marginTop: 8 }}>Criar primeiro tratamento</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Nome</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Finalidade</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Base Legal</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Titulares</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{t.nome}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.finalidade}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#ede9fe', color: '#7c3aed' }}>{BASE_LEGAL_LABEL[t.baseLegal] || t.baseLegal}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>{(t.categoriasTitulares || []).join(', ') || '-'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: t.ativo ? '#dcfce7' : '#fee2e2', color: t.ativo ? '#16a34a' : '#dc2626' }}>
                      {t.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => onVer(t.id)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>Ver</button>
                      <button onClick={() => onEditar(t.id)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#1d4ed8' }}>Editar</button>
                      {t.ativo && <button onClick={() => desativar(t.id)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid #fee2e2', background: '#fff5f5', cursor: 'pointer', color: '#dc2626' }}>Desativar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
