import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import SeletorResponsavel from './SeletorResponsavel';
import Anexos from './Anexos';
import Historico from './Historico';
import AtividadeForm from './AtividadeForm';
import { BotoesExportar } from './download';

const STATUS_OPTIONS = [
  { value: 'CONFORME', label: 'Conforme' },
  { value: 'PARCIAL', label: 'Parcial' },
  { value: 'NAO_CONFORME', label: 'Não conforme' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável' }
];

const STATUS_BADGE = {
  CONFORME: 'badge badge-success',
  PARCIAL: 'badge badge-warning',
  NAO_CONFORME: 'badge badge-danger',
  NAO_APLICAVEL: 'badge badge-muted'
};

const CRITICIDADE_BADGE = {
  ALTA: 'badge badge-danger',
  MEDIA: 'badge badge-warning',
  BAIXA: 'badge badge-success'
};

const EVIDENCIA_LABEL = {
  DOCUMENTO: 'Documento',
  CAPTURA: 'Captura de tela',
  AUTO_DECLARACAO: 'Auto-declaração',
  LINK_SISTEMA: 'Link de sistema'
};

function ChecklistPage({ token }) {
  const [itens, setItens] = useState([]);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroCriticidade, setFiltroCriticidade] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [form, setForm] = useState({
    status: 'CONFORME',
    observacao: '',
    evidenciaUrl: '',
    proximaRevisao: '',
    responsavelId: ''
  });
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  // null = fechado; {} = nova atividade; item = editar atividade propria
  const [atividadeForm, setAtividadeForm] = useState(null);

  const authHeader = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const [resItens, resScore] = await Promise.all([
        axios.get(`${API}/conformidade/checklist`, { headers: authHeader }),
        axios.get(`${API}/conformidade/score`, { headers: authHeader })
      ]);
      setItens(Array.isArray(resItens.data) ? resItens.data : []);
      setScore(resScore.data || null);
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao carregar checklist de conformidade.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirResposta = (item) => {
    setExpandido(item.id);
    setForm({
      status: item.resposta?.status || 'CONFORME',
      observacao: item.resposta?.observacao || '',
      evidenciaUrl: item.resposta?.evidenciaUrl || '',
      proximaRevisao: item.resposta?.proximaRevisao
        ? String(item.resposta.proximaRevisao).substring(0, 10)
        : '',
      // atividade propria: responsavel da atividade vem preenchido
      responsavelId: item.resposta?.responsavelId || item.responsavelId || ''
    });
  };

  const cancelarResposta = () => {
    setExpandido(null);
    setForm({ status: 'CONFORME', observacao: '', evidenciaUrl: '', proximaRevisao: '', responsavelId: '' });
  };

  const salvarResposta = async (itemId) => {
    setErro('');
    try {
      await axios.post(
        `${API}/conformidade/checklist/${itemId}/responder`,
        {
          status: form.status,
          observacao: form.observacao,
          evidenciaUrl: form.evidenciaUrl,
          proximaRevisao: form.proximaRevisao || null,
          responsavelId: form.responsavelId
        },
        { headers: authHeader }
      );
      cancelarResposta();
      setVersaoHistorico(v => v + 1);
      await carregar();
    } catch (e) {
      setErro(e.response?.data?.erro || e.response?.data?.error || 'Erro ao salvar resposta.');
    }
  };

  const filtrados = itens.filter((it) => {
    if (filtroStatus && it.resposta?.status !== filtroStatus) return false;
    if (filtroCriticidade && it.criticidade !== filtroCriticidade) return false;
    return true;
  });

  const grupos = {};
  for (const it of filtrados) {
    (grupos[it.categoria] = grupos[it.categoria] || []).push(it);
  }

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h2 className="page-title">Checklist de Conformidade</h2>
        </div>
        <p className="text-muted">Carregando...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Checklist de Conformidade</h2>
        <div className="btn-row">
          <BotoesExportar token={token} caminho="/conformidade/checklist/export" nome="checklist-conformidade" onErro={setErro} />
          {!atividadeForm && <button className="btn-primary btn-sm" onClick={() => setAtividadeForm({})}>+ Atividade própria</button>}
        </div>
      </div>

      {erro && <div className="alert-error mb-16">{erro}</div>}

      {atividadeForm && (
        <AtividadeForm
          token={token}
          atividade={atividadeForm}
          onCancelar={() => setAtividadeForm(null)}
          onSalvo={() => { setAtividadeForm(null); setVersaoHistorico(v => v + 1); carregar(); }}
        />
      )}

      {score && (
        <div className="card mb-20">
          <div className="card-header">Conformidade Geral</div>
          <div className="card-divider" />
          <div className="flex-between mb-8">
            <div style={{ fontSize: '42px', fontWeight: 800 }}>{score.score}%</div>
            <div className="text-sm text-muted">
              Total de itens: {score.totalItens}
            </div>
          </div>
          <div className="text-sm text-muted mb-12">
            {score.porStatus?.CONFORME || 0} conformes ·{' '}
            {score.porStatus?.PARCIAL || 0} parciais ·{' '}
            {score.porStatus?.NAO_CONFORME || 0} não conformes ·{' '}
            {score.porStatus?.SEM_RESPOSTA || 0} sem resposta
          </div>
          {score.porCategoria && Object.keys(score.porCategoria).length > 0 && (
            <>
              <div className="card-divider" />
              <div className="detail-label mb-8">Por categoria</div>
              {Object.entries(score.porCategoria).map(([cat, pct]) => (
                <div key={cat} className="flex-between mb-8">
                  <span className="text-sm">{cat}</span>
                  <span className="badge badge-info">{pct}%</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="filters mb-16">
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filtroCriticidade}
          onChange={(e) => setFiltroCriticidade(e.target.value)}
        >
          <option value="">Todas as criticidades</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>
      </div>

      {Object.keys(grupos).length === 0 && (
        <div className="empty-state">Nenhum item encontrado para os filtros selecionados.</div>
      )}

      {Object.entries(grupos).map(([categoria, itensCat]) => (
        <div key={categoria}>
          <h3 className="card-header mt-20">{categoria}</h3>
          <div className="card mb-16">
            {itensCat.map((item, idx) => (
              <div key={item.id}>
                {idx > 0 && <div className="card-divider" />}
                <div className="flex-between mb-8">
                  <div>
                    <strong>{item.codigo}</strong> - {item.titulo}
                  </div>
                  <div className="badge-row">
                    <span className={CRITICIDADE_BADGE[item.criticidade] || 'badge badge-muted'}>
                      {item.criticidade}
                    </span>
                    {item.obrigatorio && (
                      <span className="badge badge-purple">Obrigatório</span>
                    )}
                    {item.resposta?.status ? (
                      <span className={STATUS_BADGE[item.resposta.status] || 'badge badge-muted'}>
                        {item.resposta.status}
                      </span>
                    ) : (
                      <span className="badge badge-muted">Sem resposta</span>
                    )}
                  </div>
                </div>
                <div className="text-sm mb-8">{item.descricao}</div>
                {item.organizacaoId && (
                  <div className="text-sm text-muted mb-8">
                    <span className="badge badge-info">Atividade própria</span>
                    {' '}Responsável: {item.responsavel?.nome || 'não designado'}
                    {item.prazo && <> · Prazo: {new Date(item.prazo).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</>}
                    {' '}<button className="btn-ghost btn-sm" onClick={() => setAtividadeForm(item)}>Editar atividade</button>
                  </div>
                )}
                <div className="badge-row mb-8">
                  {item.fundamentoLegal && (
                    <span className="badge badge-legal">{item.fundamentoLegal}</span>
                  )}
                  <span className="badge badge-info">
                    Evidência: {EVIDENCIA_LABEL[item.evidenciaRequerida] || item.evidenciaRequerida}
                  </span>
                </div>
                {item.resposta?.observacao && (
                  <div className="text-sm text-muted mb-8">
                    <span className="detail-label">Observação: </span>
                    {item.resposta.observacao}
                  </div>
                )}
                {item.resposta?.evidenciaUrl && (
                  <div className="text-sm mb-8">
                    <span className="detail-label">Evidência: </span>
                    <a href={item.resposta.evidenciaUrl} target="_blank" rel="noopener noreferrer">
                      {item.resposta.evidenciaUrl}
                    </a>
                  </div>
                )}
                {item.resposta && (
                  <div className="text-sm text-muted mb-8">
                    <span className="detail-label">Responsável: </span>
                    {item.resposta.responsavel?.nome || 'Não designado'}
                  </div>
                )}
                {item.resposta?.proximaRevisao && (
                  <div className="text-sm text-muted mb-8">
                    <span className="detail-label">Próxima revisão / prazo: </span>
                    {String(item.resposta.proximaRevisao).substring(0, 10)}
                  </div>
                )}

                {expandido === item.id ? (
                  <div className="card-flush mt-16">
                    <div className="card-divider" />
                    <div className="mb-8">
                      <label className="detail-label">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-8">
                      <label className="detail-label">Observação</label>
                      <textarea
                        value={form.observacao}
                        onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="mb-8">
                      <label className="detail-label">
                        Evidência ({EVIDENCIA_LABEL[item.evidenciaRequerida] || item.evidenciaRequerida})
                      </label>
                      <input
                        type="text"
                        value={form.evidenciaUrl}
                        onChange={(e) => setForm({ ...form, evidenciaUrl: e.target.value })}
                        placeholder={`URL ou referência para ${EVIDENCIA_LABEL[item.evidenciaRequerida] || item.evidenciaRequerida}`}
                        style={{ fontFamily: 'monospace' }}
                      />
                    </div>
                    <div className="mb-8">
                      <label className="detail-label">Responsável</label>
                      <SeletorResponsavel token={token} value={form.responsavelId} onChange={(v) => setForm({ ...form, responsavelId: v })} />
                    </div>
                    <div className="mb-12">
                      <label className="detail-label">Próxima revisão / prazo</label>
                      <input
                        type="date"
                        value={form.proximaRevisao}
                        onChange={(e) => setForm({ ...form, proximaRevisao: e.target.value })}
                      />
                    </div>
                    <div className="btn-row">
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => salvarResposta(item.id)}
                      >
                        Salvar
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={cancelarResposta}
                      >
                        Cancelar
                      </button>
                    </div>
                    <div className="mt-16">
                      <Anexos token={token} entidade="CHECKLIST_ITEM" registroId={item.id} titulo="Evidências anexadas" onEnviado={() => setVersaoHistorico(v => v + 1)} />
                      <Historico token={token} entidade="CHECKLIST_ITEM" registroId={item.id} versao={versaoHistorico} />
                    </div>
                  </div>
                ) : (
                  <div className="btn-row">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => abrirResposta(item)}
                    >
                      Responder
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ChecklistPage;
