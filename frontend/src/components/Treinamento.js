import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import TreinamentoRelatorio from './TreinamentoRelatorio';
import { baixarCertificado } from './certificadoDownload';
import { fmtDiaSP } from '../datas';

const NIVEL_BADGE = {
  'Básico': 'badge badge-success',
  'Intermediário': 'badge badge-warning',
  'Avançado': 'badge badge-danger'
};

// Texto do modulo: paragrafos, listas e dicas (src/data/trilhasTreinamento.js)
function ConteudoModulo({ conteudo }) {
  return (conteudo || []).map((b, i) => {
    if (b.tipo === 'lista') {
      return (
        <div key={i} className="mb-12">
          {b.titulo && <div className="detail-label mb-4">{b.titulo}</div>}
          <ul style={{ paddingLeft: 20, lineHeight: 1.6 }}>{b.itens.map((it, j) => <li key={j}>{it}</li>)}</ul>
        </div>
      );
    }
    if (b.tipo === 'dica') return <div key={i} className="alert-info mb-12">💡 {b.texto}</div>;
    return <p key={i} className="mb-12" style={{ lineHeight: 1.6 }}>{b.texto}</p>;
  });
}

// Questionario de 3 perguntas; conclui com minAcertos ou mais
function Questionario({ modulo, enviando, resultado, onEnviar }) {
  const [resp, setResp] = useState({});
  useEffect(() => { setResp({}); }, [modulo.moduloId]);
  const completo = modulo.quiz.every((_, i) => resp[i] !== undefined);
  return (
    <div className="card-flush mt-16" style={{ borderTop: '1px solid #eef0f4', paddingTop: 16 }}>
      <div className="card-header mb-8">Questionário</div>
      <p className="text-sm text-muted mb-12">Acerte pelo menos {modulo.minAcertos} de {modulo.quiz.length} perguntas para concluir o módulo. Você pode tentar quantas vezes quiser.</p>
      {modulo.quiz.map((q, i) => (
        <div key={i} className="mb-12">
          <div className="mb-4"><strong>{i + 1}.</strong> {q.pergunta}
            {resultado && <span className={resultado.corretas[i] ? 'badge badge-success' : 'badge badge-danger'} style={{ marginLeft: 6 }}>{resultado.corretas[i] ? 'acertou' : 'errou'}</span>}
          </div>
          {q.alternativas.map((alt, j) => (
            <label key={j} className="text-sm" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '4px 0', cursor: 'pointer', fontWeight: 400 }}>
              <input type="radio" name={`q${modulo.moduloId}-${i}`} checked={resp[i] === j} onChange={() => setResp({ ...resp, [i]: j })} style={{ width: 'auto', marginTop: 3 }} />
              <span>{alt}</span>
            </label>
          ))}
        </div>
      ))}
      {resultado && (
        <div className={resultado.aprovado ? 'alert-success mb-8' : 'alert-error mb-8'}>
          {resultado.acertos} de {resultado.total} acertos — {resultado.aprovado ? 'módulo concluído.' : `faltou pouco: são necessários ${resultado.minAcertos} acertos. Revise o texto e tente de novo.`}
        </div>
      )}
      <button className="btn-primary btn-sm" disabled={!completo || enviando} onClick={() => onEnviar(modulo.quiz.map((_, i) => resp[i]))}>
        {enviando ? 'Corrigindo...' : 'Enviar respostas'}
      </button>
    </div>
  );
}

const SITUACAO_BADGE = {
  NAO_INICIADA: ['badge badge-muted', 'Não iniciada'],
  EM_ANDAMENTO: ['badge badge-warning', 'Em andamento'],
  CONCLUIDA: ['badge badge-success', 'Concluída']
};

export default function Treinamento({ token, usuario, filtroInicial }) {
  const [trilhas, setTrilhas] = useState([]);
  const [progresso, setProgresso] = useState({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [trilhaAberta, setTrilhaAberta] = useState(null);
  const [moduloIdx, setModuloIdx] = useState(0);
  const veioDoPainel = filtroInicial?.filtro === 'obrigatoria-pendente';
  const [aba, setAba] = useState(veioDoPainel && ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil) ? 'relatorio' : 'trilhas');
  const [marcando, setMarcando] = useState(false);
  const [resultado, setResultado] = useState(null); // ultima tentativa do modulo aberto
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

  // Envia o questionario; o backend corrige e grava a tentativa
  const enviarQuiz = async (trilhaId, moduloId, respostas) => {
    setMarcando(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/treinamento/progresso`, { trilhaId, moduloId, respostas }, { headers: { Authorization: `Bearer ${token}` } });
      const { tentativa, ...status } = res.data;
      setProgresso(p => ({ ...p, [trilhaId]: status }));
      setResultado({ ...tentativa, moduloId });
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao enviar respostas');
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
            <span>Trilha concluída em {fmtDiaSP(prog.concluidoEm)}. Código do certificado: <strong>{prog.certificadoCodigo}</strong></span>
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

          {modulo.minuta && <div className="alert-info mb-12 text-sm">MINUTA — conteúdo para revisão pela Câmara antes do uso oficial.</div>}
          <p className="text-muted mb-12">{modulo.descricao}</p>
          <ConteudoModulo conteudo={modulo.conteudo} />
          {modulo.linkComplementar && (
            <p className="text-sm mb-12">
              Material complementar: <a href={modulo.linkComplementar} target="_blank" rel="noopener noreferrer">{modulo.linkComplementar}</a>
            </p>
          )}

          {feito && <span className="badge badge-success">✓ Módulo concluído</span>}
          {!feito && (
            <Questionario modulo={modulo} enviando={marcando}
              resultado={resultado?.moduloId === modulo.moduloId ? resultado : null}
              onEnviar={respostas => enviarQuiz(trilhaAberta.id, modulo.moduloId, respostas)} />
          )}

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
        {podeVerRelatorio && (
          <div className="btn-row">
            <button className={aba === 'trilhas' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setAba('trilhas')}>Minhas trilhas</button>
            <button className={aba === 'relatorio' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setAba('relatorio')}>Relatório da equipe</button>
          </div>
        )}
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      {aba === 'relatorio' && podeVerRelatorio ? (
        <TreinamentoRelatorio token={token} trilhas={trilhas}
          trilhaInicial={veioDoPainel ? filtroInicial.trilhaId : ''} situacaoInicial={veioDoPainel ? 'NAO_CONCLUIDA' : ''} />
      ) : (
        <>
          <div className="alert-info mb-24">
            Capacitação de servidores e colaboradores que tratam dados pessoais, em apoio às atribuições do encarregado (art. 41, § 2º, III, da LGPD) e às medidas de segurança do art. 46.
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
