import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

const BASE_LEGAL_LABEL = {
  CONSENTIMENTO: 'Consentimento',
  OBRIGACAO_LEGAL: 'Obrigação Legal',
  EXECUCAO_CONTRATO: 'Execução de Contrato',
  INTERESSE_LEGITIMO: 'Interesse Legítimo',
  PROTECAO_VIDA: 'Proteção à Vida',
  TUTELA_SAUDE: 'Tutela da Saúde',
  INTERESSE_PUBLICO: 'Interesse Público',
  EXERCICIO_DIREITOS: 'Exercício de Direitos'
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

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Mapeamento ROPA</h2>
        <div className="btn-row">
          <button onClick={() => exportar('csv')} className="btn-secondary btn-sm">Exportar CSV</button>
          <button onClick={() => exportar('json')} className="btn-secondary btn-sm">Exportar JSON</button>
          <button onClick={onNovo} className="btn-primary btn-sm">+ Novo tratamento</button>
        </div>
      </div>

      {erro && <p className="alert-error mb-12">{erro}</p>}

      <div className="filters mb-16">
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)}>
          <option value="">Todas as bases legais</option>
          {Object.entries(BASE_LEGAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum tratamento registrado.</p>
          <button onClick={onNovo} className="btn-primary btn-sm mt-16">Criar primeiro tratamento</button>
        </div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Finalidade</th>
                <th>Base Legal</th>
                <th>Titulares</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(t => (
                <tr key={t.id}>
                  <td>{t.nome}</td>
                  <td className="table-cell-truncate">{t.finalidade}</td>
                  <td>
                    <span className="badge badge-purple">{BASE_LEGAL_LABEL[t.baseLegal] || t.baseLegal}</span>
                  </td>
                  <td className="text-muted">{(t.categoriasTitulares || []).join(', ') || '-'}</td>
                  <td>
                    <span className={t.ativo ? 'badge badge-success' : 'badge badge-danger'}>
                      {t.ativo ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row">
                      <button onClick={() => onVer(t.id)} className="btn-secondary btn-sm">Ver</button>
                      <button onClick={() => onEditar(t.id)} className="btn-ghost btn-sm">Editar</button>
                      {t.ativo && <button onClick={() => desativar(t.id)} className="btn-danger btn-sm">Desativar</button>}
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
