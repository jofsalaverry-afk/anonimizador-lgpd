import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

function Estrelas({ n }) {
  return (
    <span style={{ color: '#f59e0b', letterSpacing: 1 }}>
      {'★'.repeat(n)}<span style={{ color: '#cbd5e1' }}>{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export default function PesquisaList({ token, onVer, onMetricas, onConfig }) {
  const [pesquisas, setPesquisas] = useState([]);
  const [setores, setSetores] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroAvaliacao, setFiltroAvaliacao] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('');
  const [desde, setDesde] = useState('');
  const [ate, setAte] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (filtroAvaliacao) params.avaliacao = filtroAvaliacao;
      if (filtroSetor) params.setor = filtroSetor;
      if (desde) params.desde = desde;
      if (ate) params.ate = ate;
      const res = await axios.get(`${API}/pesquisa`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setPesquisas(res.data.pesquisas || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar pesquisas');
    }
    setLoading(false);
  }, [token, filtroAvaliacao, filtroSetor, desde, ate, offset]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/pesquisa/setores`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSetores(res.data.setores || []);
      } catch (err) { /* falha silenciosa — filtro fica vazio */ }
    })();
  }, [token]);

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Pesquisas recebidas</h2>
        <div className="btn-row">
          <button onClick={onMetricas} className="btn-ghost btn-sm">📊 Métricas</button>
          <button onClick={onConfig} className="btn-ghost btn-sm">⚙️ Setores</button>
        </div>
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      <div className="filters">
        <select value={filtroAvaliacao} onChange={e => { setFiltroAvaliacao(e.target.value); setOffset(0); }}>
          <option value="">Todas as notas</option>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} estrela{n > 1 ? 's' : ''}</option>)}
        </select>
        <select value={filtroSetor} onChange={e => { setFiltroSetor(e.target.value); setOffset(0); }}>
          <option value="">Todos os setores</option>
          {setores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setOffset(0); }} title="Desde" />
        <input type="date" value={ate} onChange={e => { setAte(e.target.value); setOffset(0); }} title="Até" />
      </div>

      {loading ? <p className="text-muted">Carregando...</p> : pesquisas.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhuma pesquisa encontrada.</p>
        </div>
      ) : (
        <>
          <div className="card-flush">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Avaliação</th>
                  <th>Setor</th>
                  <th>Comentário</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pesquisas.map(p => (
                  <tr key={p.id}>
                    <td className="text-xs text-muted">{new Date(p.criadoEm).toLocaleDateString('pt-BR')}</td>
                    <td><Estrelas n={p.avaliacao} /></td>
                    <td><span className="badge badge-muted">{p.setor}</span></td>
                    <td style={{ maxWidth: 400 }}>
                      <span className="text-sm">{p.comentario.length > 120 ? p.comentario.slice(0, 120) + '…' : p.comentario}</span>
                    </td>
                    <td><button onClick={() => onVer(p.id)} className="btn-ghost btn-sm">Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > limit && (
            <div className="btn-row mt-16" style={{ justifyContent: 'space-between' }}>
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="btn-ghost btn-sm"
              >← Anterior</button>
              <span className="text-muted text-sm">
                Mostrando {offset + 1}–{Math.min(offset + limit, total)} de {total}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="btn-ghost btn-sm"
              >Próxima →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
