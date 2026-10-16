import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import Anexos from './Anexos';
import Historico from './Historico';
import SeletorResponsavel from './SeletorResponsavel';
import {
  PAPEL_TERCEIRO_LABEL, RISCO_LABEL, RESPOSTA_LABEL, SITUACAO_ACAO_LABEL, SITUACAO_ACAO_BADGE,
  TIPO_SISTEMA_LABEL, BadgeRisco
} from './rotulos';

function Campo({ label, children }) {
  return (
    <div className="mb-8">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children || '—'}</div>
    </div>
  );
}

const ACAO_VAZIA = { descricao: '', responsavelId: '', prazo: '' };

// "Segurança da informação · 4/4 Sim · 1 crítica" (+ Não/Parcial/sem resposta, quando houver)
function resumoBloco(b, respostas) {
  const total = b.perguntas.length;
  const conta = r => b.perguntas.filter(p => respostas[p.id]?.resposta === r).length;
  const criticas = b.perguntas.filter(p => p.critica).length;
  const semResposta = b.perguntas.filter(p => !respostas[p.id]?.resposta).length;
  const partes = [b.titulo, `${conta('SIM')}/${total} Sim`];
  if (conta('NAO')) partes.push(`${conta('NAO')} Não`);
  if (conta('PARCIAL')) partes.push(`${conta('PARCIAL')} Parcial`);
  if (semResposta) partes.push(`${semResposta} sem resposta`);
  if (criticas) partes.push(`${criticas} crítica${criticas > 1 ? 's' : ''}`);
  return partes.join(' · ');
}

export default function TerceiroDetail({ token, usuario, terceiroId, onVoltar, onEditar }) {
  const [t, setT] = useState(null);
  const [blocos, setBlocos] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [salvandoQ, setSalvandoQ] = useState(false);
  const [riscoForm, setRiscoForm] = useState(null);
  const [novaAcao, setNovaAcao] = useState(ACAO_VAZIA);
  const [versao, setVersao] = useState(0);
  const podeRiscoManual = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);

  const carregar = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [{ data: terc }, { data: q }] = await Promise.all([
        axios.get(`${API}/terceiros/${terceiroId}`, { headers }),
        axios.get(`${API}/terceiros/questionario`, { headers })
      ]);
      setT(terc);
      setBlocos(q.blocos);
      setRespostas(Object.fromEntries(terc.respostas.map(r => [r.perguntaId, { resposta: r.resposta, observacao: r.observacao || '' }])));
      setVersao(v => v + 1);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar terceiro');
    }
  }, [token, terceiroId]);

  useEffect(() => { carregar(); }, [carregar]);

  const headers = { Authorization: `Bearer ${token}` };
  const executar = async (fn, sucesso) => {
    setErro(''); setMsg('');
    try { await fn(); if (sucesso) setMsg(sucesso); await carregar(); return true; } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar'); return false; }
  };

  const salvarQuestionario = async () => {
    const lista = Object.entries(respostas).filter(([, v]) => v.resposta).map(([perguntaId, v]) => ({ perguntaId, ...v }));
    if (lista.length === 0) return setErro('Responda ao menos uma pergunta');
    setSalvandoQ(true);
    await executar(() => axios.put(`${API}/terceiros/${terceiroId}/questionario`, { respostas: lista }, { headers }), 'Questionário salvo e risco recalculado.');
    setSalvandoQ(false);
  };

  const salvarRisco = async (manual) => {
    const body = manual ? { manual: true, risco: riscoForm.risco, justificativa: riscoForm.justificativa } : { manual: false };
    const ok = await executar(() => axios.put(`${API}/terceiros/${terceiroId}/risco`, body, { headers }), manual ? 'Risco definido manualmente.' : 'Risco voltou a ser calculado pelo questionário.');
    if (ok) setRiscoForm(null);
  };

  const criarAcao = async () => {
    if (!novaAcao.descricao.trim()) return setErro('Descreva a ação');
    const ok = await executar(() => axios.post(`${API}/terceiros/${terceiroId}/acoes`, { ...novaAcao, prazo: novaAcao.prazo || null }, { headers }));
    if (ok) setNovaAcao(ACAO_VAZIA);
  };

  const mudarSituacao = (acao, situacao) =>
    executar(() => axios.put(`${API}/terceiros/${terceiroId}/acoes/${acao.id}`, { situacao }, { headers }));

  const desativar = async () => {
    if (!window.confirm('Desativar este terceiro? O histórico é mantido.')) return;
    await executar(() => axios.delete(`${API}/terceiros/${terceiroId}`, { headers }), 'Terceiro desativado.');
  };

  if (erro && !t) return <div className="alert-error">{erro}</div>;
  if (!t) return <p className="text-muted">Carregando...</p>;
  const av = t.avaliacao;

  return (
    <div>
      <div className="page-header mb-16">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{t.razaoSocial}</h2>
        <BadgeRisco risco={t.risco} manual={t.riscoManual} />
        {!t.ativo && <span className="badge badge-muted">desativado</span>}
      </div>
      {erro && <div className="alert-error mb-12">{erro}</div>}
      {msg && <div className="alert-success mb-12">{msg}</div>}

      <div className="card mb-16">
        <div className="grid-2">
          <div>
            <Campo label="CNPJ">{t.cnpj}</Campo>
            <Campo label="Papel">{PAPEL_TERCEIRO_LABEL[t.papel]}</Campo>
            <Campo label="Serviço prestado">{t.descricaoServico}</Campo>
            <Campo label="Contato">{[t.contatoNome, t.contatoEmail].filter(Boolean).join(' · ')}</Campo>
          </div>
          <div>
            <Campo label="Contrato">{t.contratoVigente ? 'Vigente' : 'Sem contrato vigente'}{t.contratoCritico ? ' · Contrato crítico' : ''}</Campo>
            <Campo label="Aditivo LGPD">
              {t.aditivoLgpdAssinado ? `Assinado${t.dataAditivo ? ' em ' + new Date(t.dataAditivo).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}` : 'Pendente'}
            </Campo>
            <Campo label="Sistemas fornecidos">
              {t.sistemas.length > 0 && t.sistemas.map(s => `${s.nome} (${TIPO_SISTEMA_LABEL[s.tipo]})`).join('; ')}
            </Campo>
            <Campo label="Tratamentos do ROPA em que recebe dados">
              {t.tratamentos.length > 0 && t.tratamentos.map(x => x.nome).join('; ')}
            </Campo>
          </div>
        </div>
        <div className="card-divider btn-row mt-16">
          <button onClick={onEditar} className="btn-primary btn-sm">Editar dados</button>
          {t.ativo && podeRiscoManual && <button onClick={desativar} className="btn-danger btn-sm">Desativar</button>}
        </div>
      </div>

      {/* ---------- Classificacao de risco ---------- */}
      <div className="card mb-16">
        <div className="card-header">Classificação de risco</div>
        <p className="text-sm mb-8">
          Risco atual: <BadgeRisco risco={t.risco} manual={t.riscoManual} />
          {' '}· calculado pelo questionário: <BadgeRisco risco={av.risco} />
          {av.indice !== null && <span className="text-muted"> (índice de não conformidade: {Math.round(av.indice * 100)}%, {av.respondidas}/{av.total} perguntas respondidas)</span>}
          {/* Agravantes ao lado do nivel: sao o motivo de o risco nao ser o do indice */}
          {av.agravantes.map(g => (
            <span key={g} className="badge badge-warning" style={{ marginLeft: 6, whiteSpace: 'normal' }} title="Motivo do nível de risco">Motivo: {g}</span>
          ))}
        </p>
        {t.riscoManual && <p className="text-sm mb-8"><span className="detail-label">Justificativa da classificação manual: </span>{t.riscoJustificativa}</p>}
        <p className="text-muted text-xs mb-12">
          Regra: Sim = 0, Parcial = 1, Não = 2 pontos (× peso da pergunta); N/A não conta. Índice abaixo de 25% = baixo, abaixo de 50% = médio, a partir de 50% = alto.
          Pergunta crítica respondida "Não" ou contrato crítico sem aditivo assinado elevam o mínimo para médio.
        </p>
        {podeRiscoManual && !riscoForm && (
          <div className="btn-row">
            <button className="btn-secondary btn-sm" onClick={() => setRiscoForm({ risco: t.risco || 'MEDIO', justificativa: t.riscoJustificativa || '' })}>Definir manualmente</button>
            {t.riscoManual && <button className="btn-ghost btn-sm" onClick={() => salvarRisco(false)}>Voltar ao cálculo automático</button>}
          </div>
        )}
        {riscoForm && (
          <div>
            <div className="form-grid mb-8">
              <div className="form-group">
                <label>Risco</label>
                <select value={riscoForm.risco} onChange={e => setRiscoForm({ ...riscoForm, risco: e.target.value })}>
                  {Object.entries(RISCO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <label>Justificativa (obrigatória)</label>
            <textarea rows={2} value={riscoForm.justificativa} onChange={e => setRiscoForm({ ...riscoForm, justificativa: e.target.value })} />
            <div className="btn-row mt-8">
              <button className="btn-primary btn-sm" onClick={() => salvarRisco(true)}>Salvar classificação</button>
              <button className="btn-secondary btn-sm" onClick={() => setRiscoForm(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Questionario ---------- */}
      <div className="card mb-16">
        <div className="card-header">Questionário de conformidade</div>
        {blocos.map(b => (
          <details key={b.id} className="mb-8" style={{ border: '1px solid #eef0f4', borderRadius: 8, padding: '8px 12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>{resumoBloco(b, respostas)}</summary>
            <div className="mt-8">
            {b.perguntas.map(p => {
              const atual = respostas[p.id] || { resposta: '', observacao: '' };
              const gravada = t.respostas.find(r => r.perguntaId === p.id);
              return (
                <div key={p.id} className="mb-12" style={{ borderTop: '1px solid #eef0f4', paddingTop: 8 }}>
                  <div className="text-sm mb-8">
                    <strong>{p.id}</strong> · {p.texto}
                    {p.critica && <span className="badge badge-danger" style={{ marginLeft: 6 }}>crítica</span>}
                  </div>
                  <div className="chip-row mb-8">
                    {Object.entries(RESPOSTA_LABEL).map(([k, v]) => (
                      <button key={k} type="button" className={`chip ${atual.resposta === k ? 'chip-active' : ''}`}
                        onClick={() => setRespostas({ ...respostas, [p.id]: { ...atual, resposta: k } })}>{v}</button>
                    ))}
                  </div>
                  <input value={atual.observacao} placeholder="Observação (opcional)"
                    onChange={e => setRespostas({ ...respostas, [p.id]: { ...atual, observacao: e.target.value } })} />
                  {gravada && (
                    <div className="text-muted text-xs">
                      Respondido por {gravada.respondidoPor?.nome || '—'} em {new Date(gravada.respondidoEm).toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </details>
        ))}
        <button className="btn-primary btn-sm mt-8" onClick={salvarQuestionario} disabled={salvandoQ}>
          {salvandoQ ? 'Salvando...' : 'Salvar questionário e recalcular risco'}
        </button>
      </div>

      {/* ---------- Plano de acao ---------- */}
      <div className="card mb-16">
        <div className="card-header">Plano de ação ({t.acoes.length})</div>
        {t.acoes.length === 0 && <p className="text-muted mb-12">Nenhuma ação cadastrada.</p>}
        {t.acoes.map(a => (
          <div key={a.id} className="flex-between mb-8" style={{ borderTop: '1px solid #eef0f4', paddingTop: 8 }}>
            <div>
              <div>{a.descricao}</div>
              <div className="text-muted text-xs">
                {a.responsavel?.nome || 'Sem responsável'}
                {a.prazo && ` · prazo ${new Date(a.prazo).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`}
              </div>
            </div>
            <div className="flex-center gap-8">
              <span className={SITUACAO_ACAO_BADGE[a.situacao]}>{SITUACAO_ACAO_LABEL[a.situacao]}</span>
              <select className="acao-escrita" value={a.situacao} onChange={e => mudarSituacao(a, e.target.value)} style={{ width: 'auto', marginBottom: 0 }}>
                {Object.entries(SITUACAO_ACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        ))}
        <div className="card-divider mt-16" />
        <div className="acao-escrita">
        <label>Nova ação</label>
        <input value={novaAcao.descricao} onChange={e => setNovaAcao({ ...novaAcao, descricao: e.target.value })} placeholder="Ex: Assinar aditivo contratual LGPD" />
        <div className="form-grid mb-8">
          <div className="form-group">
            <label>Responsável</label>
            <SeletorResponsavel token={token} value={novaAcao.responsavelId} onChange={v => setNovaAcao({ ...novaAcao, responsavelId: v })} />
          </div>
          <div className="form-group">
            <label>Prazo</label>
            <input type="date" value={novaAcao.prazo} onChange={e => setNovaAcao({ ...novaAcao, prazo: e.target.value })} />
          </div>
        </div>
        <button className="btn-secondary btn-sm" onClick={criarAcao}>+ Adicionar ação</button>
        </div>
      </div>

      <Anexos token={token} entidade="TERCEIRO" registroId={t.id} titulo="Evidências (contrato, aditivo, certificações)" onEnviado={() => setVersao(v => v + 1)} />
      <Historico token={token} entidade="TERCEIRO" registroId={t.id} versao={versao} />
    </div>
  );
}
