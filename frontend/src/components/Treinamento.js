import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import TreinamentoRelatorio from './TreinamentoRelatorio';
import { baixarCertificado } from './certificadoDownload';

const NIVEL_BADGE = {
  Basico: 'badge badge-success',
  Intermediario: 'badge badge-warning',
  Avancado: 'badge badge-danger'
};

const SITUACAO_BADGE = {
  NAO_INICIADA: ['badge badge-muted', 'Não iniciada'],
  EM_ANDAMENTO: ['badge badge-warning', 'Em andamento'],
  CONCLUIDA: ['badge badge-success', 'Concluída']
};

export default function Treinamento({ token, usuario }) {
  const [trilhas, setTrilhas] = useState([]);
  const [progresso, setProgresso] = useState({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [trilhaAberta, setTrilhaAberta] = useState(null);
  const [moduloIdx, setModuloIdx] = useState(0);
  const [aba, setAba] = useState('trilhas');
  const [marcando, setMarcando] = useState(false);
  const podeVerRelatorio = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);

  const carregarProgresso = useCallback(async () => {
    const res = await axios.get(`${API}/treinamento/progresso`, { headers: { Authorization: `Bearer ${token}` } });
    setProgresso(Object.fromEntries(res.data.map(p => [p.trilhaId, p])));
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/treinamento/trilhas`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTrilhas(res.data);
        await carregarProgresso();
      } catch (err) {
        setErro(err.response?.data?.erro || 'Erro ao carregar trilhas');
      }
      setLoading(false);
    })();
  }, [token, carregarProgresso]);

  const abrirTrilha = (trilha) => {
    setTrilhaAberta(trilha);
    setModuloIdx(0);
    window.scrollTo(0, 0);
  };

  const voltarParaLista = () => {
    setTrilhaAberta(null);
    setModuloIdx(0);
  };

  const marcarConcluido = async (trilhaId, moduloId) => {
    setMarcando(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/treinamento/progresso`, { trilhaId, moduloId }, { headers: { Authorization: `Bearer ${token}` } });
      setProgresso(p => ({ ...p, [trilhaId]: res.data }));
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao registrar conclusão');
    }
    setMarcando(false);
  };

  const certificado = async (codigo) => {
    try { await baixarCertificado(token, codigo); } catch { setErro('Erro ao baixar certificado'); }
  };

  if (loading) return <p className="text-muted">Carregando trilhas...</p>;

  // ========== Player de trilha aberta ==========
  if (trilhaAberta) {
    const modulo = trilhaAberta.modulos[moduloIdx];
    const totalModulos = trilhaAberta.modulos.length;
    const prog = progresso[trilhaAberta.id] || { modulosConcluidos: [], situacao: 'NAO_INICIADA' };
    const feito = prog.modulosConcluidos.includes(modulo.moduloId);
    return (
      <div>
        <div className="flex-center gap-8 mb-20">
          <button onClick={voltarParaLista} className="link-back">← Trilhas</button>
          <h2 className="page-title">{trilhaAberta.titulo}</h2>
          <span className={NIVEL_BADGE[trilhaAberta.nivel] || 'badge badge-muted'}>{trilhaAberta.nivel}</span>
          <span className={SITUACAO_BADGE[prog.situacao][0]}>{SITUACAO_BADGE[prog.situacao][1]}</span>
        </div>
        {erro && <div className="alert-error mb-12">{erro}</div>}

        {prog.situacao === 'CONCLUIDA' && prog.certificadoCodigo && (
          <div className="alert-success mb-16 flex-between">
            <span>Trilha concluída em {new Date(prog.concluidoEm).toLocaleDateString('pt-BR')}. Código do certificado: <strong>{prog.certificadoCodigo}</strong></span>
            <button className="btn-primary btn-sm" onClick={() => certificado(prog.certificadoCodigo)}>Baixar certificado (PDF)</button>
          </div>
        )}

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

          <div className="mt-16">
            {feito ? (
              <span className="badge badge-success">✓ Módulo concluído</span>
            ) : (
              <button onClick={() => marcarConcluido(trilhaAberta.id, modulo.moduloId)} disabled={marcando} className="btn-primary btn-sm">
                {marcando ? 'Registrando...' : '✓ Marcar módulo como concluído'}
              </button>
            )}
          </div>

          <div className="btn-row-spread mt-20">
            <button
              onClick={() => setModuloIdx(i => Math.max(0, i - 1))}
              disabled={moduloIdx === 0}
              className="btn-secondary btn-sm"
            >
              ← Módulo anterior
            </button>
            {moduloIdx < totalModulos - 1 ? (
              <button onClick={() => setModuloIdx(i => i + 1)} className="btn-secondary btn-sm">
                Próximo módulo →
              </button>
            ) : (
              <button onClick={voltarParaLista} className="btn-secondary btn-sm">
                Voltar às trilhas
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Módulos desta trilha ({prog.modulosConcluidos.length}/{totalModulos} concluídos)</div>
          {trilhaAberta.modulos.map((m, i) => (
            <button
              key={i}
              onClick={() => setModuloIdx(i)}
              className={`modulo-row ${i === moduloIdx ? 'modulo-row-ativo' : ''}`}
            >
              <span className="modulo-num">{prog.modulosConcluidos.includes(m.moduloId) ? '✓' : i + 1}</span>
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

  // ========== Lista de trilhas / relatorio ==========
  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Treinamentos LGPD</h2>
        {podeVerRelatorio && (
          <div className="btn-row">
            <button className={aba === 'trilhas' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setAba('trilhas')}>Minhas trilhas</button>
            <button className={aba === 'relatorio' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setAba('relatorio')}>Relatório da equipe</button>
          </div>
        )}
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      {aba === 'relatorio' && podeVerRelatorio ? (
        <TreinamentoRelatorio token={token} trilhas={trilhas} />
      ) : (
        <>
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
              const prog = progresso[trilha.id];
              const [cls, rotulo] = SITUACAO_BADGE[prog?.situacao || 'NAO_INICIADA'];
              return (
                <div key={trilha.id} className="card trilha-card" onClick={() => abrirTrilha(trilha)}>
                  <div className="trilha-header">
                    <span className="trilha-icon">🎓</span>
                    <span className={NIVEL_BADGE[trilha.nivel] || 'badge badge-muted'}>{trilha.nivel}</span>
                    <span className={cls}>{rotulo}</span>
                  </div>
                  <h3 className="trilha-titulo">{trilha.titulo}</h3>
                  <p className="trilha-desc">{trilha.descricao}</p>
                  <div className="trilha-footer">
                    <span className="text-muted text-sm">
                      {prog ? `${prog.modulosConcluidos.length}/${trilha.modulos.length}` : trilha.modulos.length} módulos · {totalMin} min
                    </span>
                    {prog?.certificadoCodigo ? (
                      <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); certificado(prog.certificadoCodigo); }}>
                        Certificado ⬇
                      </button>
                    ) : (
                      <span className="btn-ghost btn-sm">{prog?.situacao === 'EM_ANDAMENTO' ? 'Continuar →' : 'Iniciar →'}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
