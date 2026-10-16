import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import Anexos from './Anexos';
import Historico from './Historico';

const TIPO_LABEL = {
  ACESSO: 'Acesso aos dados', CORRECAO: 'Correção', ELIMINACAO: 'Eliminação',
  PORTABILIDADE: 'Portabilidade', OPOSICAO: 'Oposição', REVOGACAO: 'Revogação',
  INFORMACAO: 'Informação', PETICAO: 'Petição à ANPD'
};

const STATUS_LABEL = {
  RECEBIDA: 'Recebida', AGUARDANDO_VERIFICACAO: 'Aguardando verificação',
  EM_ANALISE: 'Em análise', RESPONDIDA: 'Respondida',
  ENCERRADA: 'Encerrada', CANCELADA: 'Cancelada'
};

const STATUS_BADGE = {
  RECEBIDA: 'badge badge-info', AGUARDANDO_VERIFICACAO: 'badge badge-info',
  EM_ANALISE: 'badge badge-warning',
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
  const [modelos, setModelos] = useState([]);
  const [modeloId, setModeloId] = useState('');
  const [evidForm, setEvidForm] = useState({ tipo: '', descricao: '' });
  const [showEvidForm, setShowEvidForm] = useState(false);
  const [salvandoEvid, setSalvandoEvid] = useState(false);
  const [observacaoVerif, setObservacaoVerif] = useState('');
  const [showVerifForm, setShowVerifForm] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState('');
  const [versaoHistorico, setVersaoHistorico] = useState(0);

  const headers = { Authorization: `Bearer ${token}` };

  const carregar = async () => {
    try {
      const res = await axios.get(`${API}/dsar/solicitacoes/${solicitacaoId}`, { headers });
      setSol(res.data);
      setVersaoHistorico(v => v + 1);
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

  // Modelos de resposta da organizacao: os do mesmo tipo de direito
  // aparecem primeiro. O backend preenche {nome_titular}, {protocolo} e
  // {nome_organizacao}.
  const abrirResposta = async () => {
    const abrir = !showRespForm;
    setShowRespForm(abrir);
    if (!abrir) return;
    try {
      const res = await axios.get(`${API}/dsar/modelos`, { headers });
      const ordenados = [...res.data].sort((a, b) => (b.tipoDireito === sol.tipoDireito) - (a.tipoDireito === sol.tipoDireito));
      setModelos(ordenados);
      setModeloId(ordenados[0]?.id || '');
    } catch {
      setModelos([]);
    }
  };

  const usarModelo = async () => {
    if (!modeloId) return;
    if (resposta.trim() && !window.confirm('Substituir o texto atual pelo modelo?')) return;
    try {
      const res = await axios.get(`${API}/dsar/solicitacoes/${solicitacaoId}/modelos/${modeloId}/preenchido`, { headers });
      setResposta(res.data.texto);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar modelo');
    }
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
      setErro(err.response?.data?.erro || 'Erro ao registrar providência');
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

  const verificarIdentidade = async () => {
    setVerificando(true);
    try {
      await axios.patch(
        `${API}/dsar/solicitacoes/${solicitacaoId}/verificar-identidade`,
        { observacao: observacaoVerif.trim() || undefined },
        { headers }
      );
      setShowVerifForm(false);
      setObservacaoVerif('');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao verificar identidade');
    }
    setVerificando(false);
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
        {!encerrada && sol.dataLimite && <span className={SLA_BADGE[sol.sla?.cor] || 'badge badge-muted'}>{sol.sla?.label}</span>}
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
            <div className="detail-value">
              {sol.dataLimite
                ? new Date(sol.dataLimite).toLocaleDateString('pt-BR')
                : <span className="text-muted">Aguardando verificação de identidade</span>}
            </div>
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
            {sol.status === 'AGUARDANDO_VERIFICACAO' ? (
              <button onClick={() => setShowVerifForm(!showVerifForm)} className="btn-primary btn-sm">
                {showVerifForm ? 'Cancelar' : 'Verificar identidade'}
              </button>
            ) : (
              <>
                {sol.status === 'RECEBIDA' && (
                  <button onClick={() => mudarStatus('EM_ANALISE')} className="btn-secondary btn-sm acao-escrita">Iniciar análise</button>
                )}
                <button onClick={() => setShowEvidForm(!showEvidForm)} className="btn-secondary btn-sm acao-escrita">
                  {showEvidForm ? 'Cancelar' : '+ Registrar providência'}
                </button>
                <button onClick={abrirResposta} className="btn-primary btn-sm">
                  {showRespForm ? 'Cancelar' : 'Responder'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {showVerifForm && (
        <div className="card mb-16">
          <div className="card-header">Verificar identidade do titular</div>
          <p className="text-muted text-xs mb-16">
            Ao verificar, o status muda para "Em análise" e o prazo legal de 15 dias começa a contar.
          </p>
          <label>Observação (opcional)</label>
          <textarea
            value={observacaoVerif}
            onChange={e => setObservacaoVerif(e.target.value)}
            rows={3}
            placeholder="Ex: Documento validado presencialmente; Ligação confirmada com o titular; etc."
          />
          <div className="btn-row mt-16">
            <button onClick={verificarIdentidade} disabled={verificando} className="btn-primary btn-sm">
              {verificando ? 'Verificando...' : 'Confirmar verificação'}
            </button>
          </div>
        </div>
      )}

      {showRespForm && (
        <div className="card mb-16">
          <div className="card-header">Responder solicitação</div>
          {modelos.length > 0 && (
            <div className="flex-center gap-8 mb-12">
              <select value={modeloId} onChange={e => setModeloId(e.target.value)} style={{ marginBottom: 0 }}>
                {modelos.map(m => <option key={m.id} value={m.id}>{m.titulo}{m.tipoDireito === sol.tipoDireito ? ' (este direito)' : ''}</option>)}
              </select>
              <button type="button" className="btn-secondary btn-sm" onClick={usarModelo}>Usar modelo</button>
            </div>
          )}
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
          <div className="card-header">Registrar providência</div>
          <div className="form-grid">
            <div className="form-group">
              <label>Tipo</label>
              <input value={evidForm.tipo} onChange={e => setEvidForm({ ...evidForm, tipo: e.target.value })} placeholder="Ex: Consulta ao sistema, E-mail ao setor, Documento" />
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <input value={evidForm.descricao} onChange={e => setEvidForm({ ...evidForm, descricao: e.target.value })} placeholder="Descreva a providência adotada" />
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
        <div className="card mb-16">
          <div className="card-header">Providências registradas ({sol.evidencias.length})</div>
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

      <Anexos token={token} entidade="SOLICITACAO_DSAR" registroId={sol.id} titulo="Arquivos anexados" onEnviado={() => setVersaoHistorico(v => v + 1)} />
      <Historico token={token} entidade="SOLICITACAO_DSAR" registroId={sol.id} versao={versaoHistorico} />
    </div>
  );
}
