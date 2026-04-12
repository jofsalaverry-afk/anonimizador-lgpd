import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

const TIPO_LABEL = { POLITICA: 'Politica', TERMO: 'Termo', ADITIVO: 'Aditivo', CONTRATO: 'Contrato', MODELO: 'Modelo', OUTRO: 'Outro' };
const STATUS_LABEL = { RASCUNHO: 'Rascunho', APROVADO: 'Aprovado', PUBLICADO: 'Publicado' };
const STATUS_BADGE = { RASCUNHO: 'badge badge-warning', APROVADO: 'badge badge-info', PUBLICADO: 'badge badge-success' };

export default function RepositorioList({ token, onNovo, onVer, onEditar }) {
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/repositorio/documentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocumentos(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar documentos');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const excluir = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      await axios.delete(`${API}/repositorio/documentos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocumentos(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao excluir documento');
    }
  };

  const filtrados = documentos.filter(d => {
    if (filtroTipo && d.tipo !== filtroTipo) return false;
    if (filtroStatus && d.status !== filtroStatus) return false;
    return true;
  });

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Repositorio de Documentos</h2>
        <div className="btn-row">
          <button onClick={onNovo} className="btn-primary btn-sm">+ Novo documento</button>
        </div>
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      <div className="filters">
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum documento registrado.</p>
          <button onClick={onNovo} className="btn-primary btn-sm">Criar primeiro documento</button>
        </div>
      ) : (
        <div className="card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Titulo</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Versao</th>
                <th>Tags</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(d => (
                <tr key={d.id}>
                  <td className="table-cell-truncate"><strong>{d.titulo}</strong></td>
                  <td><span className="badge badge-purple">{TIPO_LABEL[d.tipo] || d.tipo}</span></td>
                  <td><span className={STATUS_BADGE[d.status] || 'badge badge-muted'}>{STATUS_LABEL[d.status] || d.status}</span></td>
                  <td>{d.versao || '1'}</td>
                  <td>
                    <div className="badge-row">
                      {(d.tags || []).map(t => <span key={t} className="badge badge-muted">{t}</span>)}
                    </div>
                  </td>
                  <td>
                    <div className="btn-row">
                      <button onClick={() => onVer(d.id)} className="btn-ghost btn-sm">Ver</button>
                      <button onClick={() => onEditar(d.id)} className="btn-ghost btn-sm">Editar</button>
                      <button onClick={() => excluir(d.id)} className="btn-danger btn-sm">Excluir</button>
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
