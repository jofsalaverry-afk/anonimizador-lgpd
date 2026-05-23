import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

// Gráfico de série temporal mensal — SVG inline (sem dependência externa).
// Fallback para tabela se houver menos de 3 meses de dados.
function GraficoSerieTemporal({ serie }) {
  if (!serie || serie.length === 0) {
    return <div className="text-muted">Sem dados no período.</div>;
  }
  if (serie.length < 3) {
    return (
      <table className="table">
        <thead><tr><th>Mês</th><th>Respostas</th><th>Média</th></tr></thead>
        <tbody>
          {serie.map(s => (
            <tr key={s.mes}>
              <td>{s.mes}</td>
              <td>{s.total}</td>
              <td>{s.media.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const W = 600, H = 220, P = 40;
  const n = serie.length;
  const xStep = (W - 2 * P) / (n - 1);
  const yFor = (v) => P + (5 - v) / 4 * (H - 2 * P);
  const pontos = serie.map((s, i) => ({ x: P + i * xStep, y: yFor(s.media), s }));
  const path = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: W, display: 'block' }} role="img" aria-label="Série temporal de avaliação média mensal">
      {[1, 2, 3, 4, 5].map(v => (
        <g key={v}>
          <line x1={P} y1={yFor(v)} x2={W - P} y2={yFor(v)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={P - 6} y={yFor(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{v}</text>
        </g>
      ))}
      <path d={path} stroke="#7c3aed" strokeWidth="2" fill="none" />
      {pontos.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#7c3aed" />
          <text x={p.x} y={H - 12} textAnchor="middle" fontSize="10" fill="#475569">{p.s.mes}</text>
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1e293b">{p.s.media.toFixed(2)}</text>
        </g>
      ))}
    </svg>
  );
}

function BarrasDistribuicao({ distribuicao, total }) {
  if (!total) return null;
  const cores = { 1: '#dc2626', 2: '#ea580c', 3: '#ca8a04', 4: '#65a30d', 5: '#16a34a' };
  return (
    <div>
      {[5, 4, 3, 2, 1].map(n => {
        const qtd = distribuicao[n] || 0;
        const pct = total ? (qtd / total) * 100 : 0;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 60, fontSize: 13 }}>
              <span style={{ color: '#f59e0b' }}>{'★'.repeat(n)}</span>
            </div>
            <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 18, position: 'relative' }}>
              <div style={{ width: `${pct}%`, background: cores[n], height: '100%', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <div style={{ width: 90, textAlign: 'right', fontSize: 13, color: '#475569' }}>
              {qtd} ({pct.toFixed(0)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PesquisaMetricas({ token, slug, publico = false, onLista, onConfig, hideHeader = false, usuario }) {
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [desde, setDesde] = useState('');
  const [ate, setAte] = useState('');
  const [urlCopiada, setUrlCopiada] = useState(false);

  const copiarUrlPublica = async () => {
    if (!usuario?.orgSlug) return;
    const url = `${window.location.origin}/#pesquisa-resultados/${usuario.orgSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopiada(true);
      setTimeout(() => setUrlCopiada(false), 2000);
    } catch (err) {
      // Fallback raro (sem permissão de clipboard) — mostra a URL pro user copiar
      window.prompt('Copie a URL abaixo:', url);
    }
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (desde) params.desde = desde;
      if (ate) params.ate = ate;
      const url = publico
        ? `${API}/pesquisa/publico/metricas/${encodeURIComponent(slug)}`
        : `${API}/pesquisa/metricas`;
      const config = publico ? { params } : { headers: { Authorization: `Bearer ${token}` }, params };
      const res = await axios.get(url, config);
      setMetricas(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar métricas');
    }
    setLoading(false);
  }, [token, slug, publico, desde, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <p className="text-muted">Carregando métricas...</p>;
  if (erro) return <div className="alert-error">{erro}</div>;
  if (!metricas) return null;

  // Gate público: dados insuficientes para divulgação.
  if (metricas.insuficiente) {
    return (
      <div className="card">
        <h3>Dados insuficientes para divulgação pública</h3>
        <p className="text-muted">
          {metricas.mensagem || `Mínimo de ${metricas.minimoRequerido} respostas necessárias.`}
        </p>
        <p className="text-muted text-sm">
          Total atual: {metricas.totalAtual ?? 0} de {metricas.minimoRequerido} requeridas.
        </p>
      </div>
    );
  }

  return (
    <div>
      {!hideHeader && (
        <div className="page-header">
          <h2 className="page-title">Métricas de Satisfação</h2>
          {!publico && (
            <div className="btn-row" style={{ alignItems: 'center', gap: 8 }}>
              {usuario?.orgSlug && (
                <button
                  onClick={copiarUrlPublica}
                  className="btn-ghost btn-sm"
                  title="Copia a URL da página pública de resultados (para divulgar no portal da câmara)"
                >
                  {urlCopiada ? '✓ URL copiada' : '🔗 Copiar URL pública'}
                </button>
              )}
              <button onClick={onLista} className="btn-ghost btn-sm">📋 Lista de pesquisas</button>
              <button onClick={onConfig} className="btn-ghost btn-sm">⚙️ Setores</button>
            </div>
          )}
        </div>
      )}

      {!publico && (
        <div className="filters">
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="text-sm">Desde:</span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="text-sm">Até:</span>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)} />
          </label>
        </div>
      )}

      {metricas.total === 0 ? (
        <div className="card empty-state">
          <p>Nenhuma pesquisa no período.</p>
        </div>
      ) : (
        <>
          <div className="card mb-16" style={{ textAlign: 'center' }}>
            <div className="detail-label">Avaliação média</div>
            <div style={{ fontSize: 56, fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
              {metricas.media != null ? metricas.media.toFixed(2) : '—'}
            </div>
            <div style={{ fontSize: 28, color: '#f59e0b', letterSpacing: 2, marginTop: 8 }}>
              {'★'.repeat(Math.round(metricas.media || 0))}
              <span style={{ color: '#cbd5e1' }}>{'★'.repeat(5 - Math.round(metricas.media || 0))}</span>
            </div>
            <div className="text-muted text-sm" style={{ marginTop: 8 }}>
              {metricas.total} resposta{metricas.total !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="card mb-16">
            <h3 style={{ marginTop: 0 }}>Distribuição</h3>
            <BarrasDistribuicao distribuicao={metricas.distribuicao} total={metricas.total} />
          </div>

          <div className="card mb-16">
            <h3 style={{ marginTop: 0 }}>Por setor</h3>
            {Object.keys(metricas.porSetor || {}).length === 0 ? (
              <p className="text-muted">Sem dados.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Setor</th><th>Respostas</th><th>Média</th></tr></thead>
                <tbody>
                  {Object.entries(metricas.porSetor)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([setor, v]) => (
                      <tr key={setor}>
                        <td>{setor}</td>
                        <td>{v.total}</td>
                        <td>{v.media.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Série temporal</h3>
            <GraficoSerieTemporal serie={metricas.serieTemporal} />
          </div>
        </>
      )}
    </div>
  );
}
