import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

const TIPO_LABEL = {
  ACESSO: 'Acesso aos dados', CORRECAO: 'Correção', ELIMINACAO: 'Eliminação',
  PORTABILIDADE: 'Portabilidade', OPOSICAO: 'Oposição', REVOGACAO: 'Revogação',
  INFORMACAO: 'Informação', PETICAO: 'Petição à ANPD'
};

const STATUS_LABEL = {
  RECEBIDA: 'Recebida', EM_ANALISE: 'Em análise', RESPONDIDA: 'Respondida',
  ENCERRADA: 'Encerrada', CANCELADA: 'Cancelada'
};

const STATUS_BADGE = {
  RECEBIDA: 'badge badge-info', EM_ANALISE: 'badge badge-warning',
  RESPONDIDA: 'badge badge-success', ENCERRADA: 'badge badge-muted',
  CANCELADA: 'badge badge-danger'
};

const SLA_BADGE = {
  verde: 'badge badge-success', amarelo: 'badge badge-warning',
  vermelho: 'badge badge-danger', vencido: 'badge badge-danger'
};

export default function DsarDetail({ token, solicitacaoId, onVoltar }) {
  const [sol, setSol] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resposta, setResposta] = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [showRespForm, setShowRespForm] = useState(false);
  const [evidForm, setEvidForm] = useState({ tipo: '', descricao: '' });
  const [showEvidForm, setShowEvidForm] = useState(false);
  const [salvandoEvid, setSalvandoEvid] = useState(false);
  const [erro, setErro] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const carregar = async () => {
    try {
      const res = await axios.get(`${API}/dsar/solicitacoes/${solicitacaoId}`, { headers });
      setSol(res.data);
    } catch (err) {
      setErro('Erro ao carregar solicitação');
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacaoId]);

  const responder = async () => {
    if (!resposta.trim()) return;
    setRespondendo(true);
    try {
      await axios.post(`${API}/dsar/solicitacoes/${solicitacaoId}/responder`, { respostaTexto: resposta }, { headers });
      setShowRespForm(false);
      setResposta('');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao responder');
    }
    setRespondendo(false);
  };

  const addEvidencia = async () => {
    if (!evidForm.tipo.trim() || !evidForm.descricao.trim()) return;
    setSalvandoEvid(true);
    try {
      await axios.post(`${API}/dsar/solicitacoes/${solicitacaoId}/evidencias`, evidForm, { headers });
      setShowEvidForm(false);
      setEvidForm({ tipo: '', descricao: '' });
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao adicionar evidência');
    }
    setSalvandoEvid(false);
  };

  const mudarStatus = async (status) => {
    try {
      await axios.put(`${API}/dsar/solicitacoes/${solicitacaoId}`, { status }, { headers });
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao alterar status');
    }
  };

  if (loading) return <p className="text-muted">Carregando...</p>;
  if (!sol) return <div className="alert-error">Solicitação não encontrada.</div>;

  const encerrada = ['ENCERRADA', 'CANCELADA', 'RESPONDIDA'].includes(sol.status);

  return (
    <div>
      <div className="flex-center gap-8 mb-20">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{sol.protocolo}</h2>
        <span className={STATUS_BADGE[sol.status] || 'badge badge-muted'}>{STATUS_LABEL[sol.status]}</span>
        {!encerrada && <span className={SLA_BADGE[sol.sla?.cor] || 'badge badge-muted'}>{sol.sla?.label}</span>}
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      <div className="card mb-16">
        <div className="card-header">Dados do titular</div>
        <div className="grid-2">
          <div>
            <div className="detail-label">Nome</div>
            <div className="detail-value">{sol.titularNome}</div>
            <div className="detail-label">E-mail</div>
            <div className="detail-value">{sol.titularEmail}</div>
            {sol.titularCpf && <>
              <div className="detail-label">CPF</div>
              <div className="detail-value">{sol.titularCpf}</div>
            </>}
          </div>
          <div>
            <div className="detail-label">Tipo de direito</div>
            <div className="detail-value"><span className="badge badge-purple">{TIPO_LABEL[sol.tipoDireito]}</span></div>
            <div className="detail-label">Data de recebimento</div>
            <div className="detail-value">{new Date(sol.dataRecebimento).toLocaleDateString('pt-BR')}</div>
            <div className="detail-label">Data limite</div>
            <div className="detail-value">{new Date(sol.dataLimite).toLocaleDateString('pt-BR')}</div>
          </div>
        </div>
        <div className="detail-label">Descrição</div>
        <div className="detail-value">{sol.descricao}</div>

        {sol.respostaTexto && (
          <>
            <hr className="card-divider" />
            <div className="detail-label">Resposta</div>
            <div className="detail-value">{sol.respostaTexto}</div>
            {sol.dataResposta && (
              <div className="text-muted text-xs">Respondida em {new Date(sol.dataResposta).toLocaleString('pt-BR')}</div>
            )}
          </>
        )}

        {!encerrada && (
          <div className="btn-row mt-20">
            {sol.status === 'RECEBIDA' && (
              <button onClick={() => mudarStatus('EM_ANALISE')} className="btn-secondary btn-sm">Iniciar análise</button>
            )}
            <button onClick={() => setShowEvidForm(!showEvidForm)} className="btn-secondary btn-sm">
              {showEvidForm ? 'Cancelar' : '+ Evidência'}
            </button>
            <button onClick={() => setShowRespForm(!showRespForm)} className="btn-primary btn-sm">
              {showRespForm ? 'Cancelar' : 'Responder'}
            </button>
          </div>
        )}
      </div>

      {showRespForm && (
        <div className="card mb-16">
          <div className="card-header">Responder solicitação</div>
          <label>Texto da resposta</label>
          <textarea value={resposta} onChange={e => setResposta(e.target.value)} rows={5} placeholder="Digite a resposta ao titular..." />
          <div className="btn-row mt-16">
            <button onClick={responder} disabled={respondendo} className="btn-primary btn-sm">
              {respondendo ? 'Enviando...' : 'Enviar resposta'}
            </button>
          </div>
        </div>
      )}

      {showEvidForm && (
        <div className="card mb-16">
          <div className="card-header">Adicionar evidência</div>
          <div className="form-grid">
            <div className="form-group">
              <label>Tipo</label>
              <input value={evidForm.tipo} onChange={e => setEvidForm({ ...evidForm, tipo: e.target.value })} placeholder="Ex: E-mail, Documento, Captura de tela" />
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <input value={evidForm.descricao} onChange={e => setEvidForm({ ...evidForm, descricao: e.target.value })} placeholder="Descreva a evidência" />
            </div>
          </div>
          <div className="btn-row mt-16">
            <button onClick={addEvidencia} disabled={salvandoEvid} className="btn-primary btn-sm">
              {salvandoEvid ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {(sol.evidencias || []).length > 0 && (
        <div className="card">
          <div className="card-header">Evidências ({sol.evidencias.length})</div>
          <div className="timeline">
            {sol.evidencias.map((ev, i) => (
              <div key={ev.id} className="timeline-item">
                <div className={`timeline-dot ${i === 0 ? 'timeline-dot-active' : ''}`} />
                <div className="timeline-date">
                  {new Date(ev.criadoEm).toLocaleString('pt-BR')} — {ev.tipo}
                </div>
                <div className="timeline-content">
                  <div>{ev.descricao}</div>
                  {ev.hashSha256 && <div className="text-muted text-xs mt-16">SHA-256: {ev.hashSha256.slice(0, 16)}...</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
