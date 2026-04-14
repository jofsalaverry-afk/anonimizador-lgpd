import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

const NIVEL_BADGE = {
  Basico: 'badge badge-success',
  Intermediario: 'badge badge-warning',
  Avancado: 'badge badge-danger'
};

export default function Treinamento({ token }) {
  const [trilhas, setTrilhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [trilhaAberta, setTrilhaAberta] = useState(null);
  const [moduloIdx, setModuloIdx] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/treinamento/trilhas`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTrilhas(res.data);
      } catch (err) {
        setErro(err.response?.data?.erro || 'Erro ao carregar trilhas');
      }
      setLoading(false);
    })();
  }, [token]);

  const abrirTrilha = (trilha) => {
    setTrilhaAberta(trilha);
    setModuloIdx(0);
    window.scrollTo(0, 0);
  };

  const voltarParaLista = () => {
    setTrilhaAberta(null);
    setModuloIdx(0);
  };

  if (loading) return <p className="text-muted">Carregando trilhas...</p>;

  // ========== Player de trilha aberta ==========
  if (trilhaAberta) {
    const modulo = trilhaAberta.modulos[moduloIdx];
    const totalModulos = trilhaAberta.modulos.length;
    return (
      <div>
        <div className="flex-center gap-8 mb-20">
          <button onClick={voltarParaLista} className="link-back">← Trilhas</button>
          <h2 className="page-title">{trilhaAberta.titulo}</h2>
          <span className={NIVEL_BADGE[trilhaAberta.nivel] || 'badge badge-muted'}>{trilhaAberta.nivel}</span>
        </div>

        <div className="card mb-16">
          <div className="flex-between mb-16">
            <div>
              <div className="detail-label">Módulo {moduloIdx + 1} de {totalModulos}</div>
              <h3 className="card-header mb-8">{modulo.titulo}</h3>
            </div>
            <span className="badge badge-info">{modulo.duracaoMin} min</span>
          </div>

          <div className="video-wrapper mb-16">
            <iframe
              src={`https://www.youtube.com/embed/${modulo.youtubeId}?rel=0&modestbranding=1`}
              title={modulo.titulo}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          <p className="text-muted">{modulo.descricao}</p>

          <div className="btn-row-spread mt-20">
            <button
              onClick={() => setModuloIdx(i => Math.max(0, i - 1))}
              disabled={moduloIdx === 0}
              className="btn-secondary btn-sm"
            >
              ← Módulo anterior
            </button>
            {moduloIdx < totalModulos - 1 ? (
              <button onClick={() => setModuloIdx(i => i + 1)} className="btn-primary btn-sm">
                Próximo módulo →
              </button>
            ) : (
              <button onClick={voltarParaLista} className="btn-primary btn-sm">
                Concluir trilha ✓
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Módulos desta trilha</div>
          {trilhaAberta.modulos.map((m, i) => (
            <button
              key={i}
              onClick={() => setModuloIdx(i)}
              className={`modulo-row ${i === moduloIdx ? 'modulo-row-ativo' : ''}`}
            >
              <span className="modulo-num">{i + 1}</span>
              <div className="modulo-info">
                <div className="modulo-titulo">{m.titulo}</div>
                <div className="modulo-duracao">{m.duracaoMin} min</div>
              </div>
              {i === moduloIdx && <span className="badge badge-info">Assistindo</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ========== Lista de trilhas ==========
  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Treinamentos LGPD</h2>
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      <div className="alert-info mb-24">
        Conteúdo curado em conformidade com a LGPD Art. 50, I, g —
        capacitação periódica obrigatória de colaboradores que tratam dados pessoais.
      </div>

      {trilhas.length === 0 && !erro && (
        <div className="card empty-state">
          <p>Nenhuma trilha disponível no momento.</p>
        </div>
      )}

      <div className="trilhas-grid">
        {trilhas.map(trilha => {
          const totalMin = trilha.modulos.reduce((sum, m) => sum + (m.duracaoMin || 0), 0);
          return (
            <div key={trilha.id} className="card trilha-card" onClick={() => abrirTrilha(trilha)}>
              <div className="trilha-header">
                <span className="trilha-icon">🎓</span>
                <span className={NIVEL_BADGE[trilha.nivel] || 'badge badge-muted'}>{trilha.nivel}</span>
              </div>
              <h3 className="trilha-titulo">{trilha.titulo}</h3>
              <p className="trilha-desc">{trilha.descricao}</p>
              <div className="trilha-footer">
                <span className="text-muted text-sm">{trilha.modulos.length} módulos · {totalMin} min</span>
                <span className="btn-ghost btn-sm">Iniciar →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
