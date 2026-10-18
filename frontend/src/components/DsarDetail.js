import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { TIPO_DIREITO_LABEL, SLA_BADGE, rotuloProvidenciaDsar } from './rotulos';
import { erroTextoResposta } from '../documentosId';
import Anexos from './Anexos';
import Historico from './Historico';
import { fmtDataHora, fmtDiaSP, fmtData, hojeInput } from '../datas';

const METODO_TEXTO = { CODIGO_EMAIL: 'código no e-mail', DOCUMENTO: 'documento apresentado', CODIGO: 'código', OUTRO: 'outro meio' };
const MEIO_ENVIO_TEXTO = { PESSOALMENTE: 'Entregue pessoalmente', CORREIOS: 'Correios', TELEFONE: 'Telefone', EMAIL_INSTITUCIONAL: 'E-mail institucional (fora do sistema)', OUTRO: 'Outro meio' };

const TIPO_LABEL = TIPO_DIREITO_LABEL;

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
  const [metodoVerif, setMetodoVerif] = useState('DOCUMENTO');
  const [envioForm, setEnvioForm] = useState(null); // { meio, data, observacao }
  const [showVerifForm, setShowVerifForm] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState('');
  // Erro do envio da resposta: aparece junto do botao "Enviar resposta"
  const [erroResposta, setErroResposta] = useState('');
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
    setErroResposta('');
    if (!resposta.trim()) return setErroResposta('Escreva a resposta antes de enviar');
    const rascunho = erroTextoResposta(resposta);
    if (rascunho) return setErroResposta(rascunho);
    setRespondendo(true);
    try {
      await axios.post(`${API}/dsar/solicitacoes/${solicitacaoId}/responder`, { respostaTexto: resposta }, { headers });
      setShowRespForm(false);
      setResposta('');
      carregar();
    } catch (err) {
      setErroResposta(err.response?.data?.erro || 'Erro ao responder');
    }
    setRespondendo(false);
  };

  // Modelos de resposta da organizacao: os do mesmo tipo de direito
  // aparecem primeiro. O backend preenche {nome_titular}, {protocolo} e
  // {nome_organizacao}.
  const abrirResposta = async () => {
    setErro('');
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
    setErro('');
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
    setErro('');
    if (!evidForm.tipo.trim() || !evidForm.descricao.trim()) return setErro('Preencha o tipo e a descrição da providência');
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
    setErro('');
    try {
      await axios.put(`${API}/dsar/solicitacoes/${solicitacaoId}`, { status }, { headers });
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao alterar status');
    }
  };

  const verificarIdentidade = async () => {
    setErro('');
    if (metodoVerif === 'OUTRO' && !observacaoVerif.trim()) return setErro('Com o método "Outro", descreva na observação como a identidade foi confirmada');
    setVerificando(true);
    try {
      await axios.patch(
        `${API}/dsar/solicitacoes/${solicitacaoId}/verificar-identidade`,
        { metodo: metodoVerif, observacao: observacaoVerif.trim() || undefined },
        { headers }
      );
      setVersaoHistorico(v => v + 1);
      setShowVerifForm(false);
      setObservacaoVerif('');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao verificar identidade');
    }
    setVerificando(false);
  };

  const registrarEnvio = async () => {
    setErro('');
    try {
      await axios.post(`${API}/dsar/solicitacoes/${solicitacaoId}/envio`, envioForm, { headers });
      setEnvioForm(null);
      setVersaoHistorico(v => v + 1);
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao registrar envio');
    }
  };

  if (loading) return <p className="text-muted">Carregando...</p>;
  if (!sol) return <div className="alert-error">Solicitação não encontrada.</div>;
  const ident = sol.identidade || { verificada: false };

  const encerrada = ['ENCERRADA', 'CANCELADA', 'RESPONDIDA'].includes(sol.status);

  return (
    <div>
      <div className="flex-center gap-8 mb-20">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{sol.protocolo}</h2>
        <span className={STATUS_BADGE[sol.status] || 'badge badge-muted'}>{STATUS_LABEL[sol.status]}</span>
        {sol.sla?.label && <span className={SLA_BADGE[sol.sla.cor] || 'badge badge-muted'}>{sol.sla.label}</span>}
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
            <div className="detail-value">{fmtDataHora(sol.dataRecebimento)}</div>
            <div className="detail-label">Data limite</div>
            <div className="detail-value">
              {sol.dataLimite
                ? fmtDiaSP(sol.dataLimite)
                : <span className="text-muted">Aguardando verificação de identidade</span>}
            </div>
          </div>
        </div>
        <div className="detail-label">Descrição</div>
        <div className="detail-value">{sol.descricao}</div>

        <div className="detail-label">Identidade</div>
        <div className="detail-value flex-center gap-8">
          {ident.verificada ? (
            <span className="badge badge-success">
              Verificada{ident.metodo ? ` por ${METODO_TEXTO[ident.metodo]}` : ''} em {fmtDataHora(ident.em)}
            </span>
          ) : <span className="badge badge-warning">Não verificada</span>}
          {ident.observacao && <span className="text-xs text-muted">{ident.observacao}</span>}
          {!['ENCERRADA', 'CANCELADA'].includes(sol.status) && !showVerifForm && (
            <button onClick={() => setShowVerifForm(true)} className="btn-ghost btn-sm acao-escrita">
              Registrar verificação de identidade
            </button>
          )}
        </div>

        {sol.respostaTexto && (
          <>
            <hr className="card-divider" />
            <div className="detail-label">Resposta</div>
            <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{sol.respostaTexto}</div>
            {sol.dataResposta && (
              <div className="text-muted text-xs">Respondida em {fmtDataHora(sol.dataResposta)}</div>
            )}
            <div className="mt-8 flex-center gap-8">
              {sol.respostaEnviadaEmailEm ? (
                <span className="badge badge-success">Enviada por e-mail em {fmtDataHora(sol.respostaEnviadaEmailEm)}</span>
              ) : sol.respostaEnvioMeio ? (
                <span className="badge badge-success">{MEIO_ENVIO_TEXTO[sol.respostaEnvioMeio]} em {fmtData(sol.respostaEnvioData)}{sol.respostaEnvioObservacao ? ` — ${sol.respostaEnvioObservacao}` : ''}</span>
              ) : (
                <>
                  <span className="badge badge-warning">Não enviada por e-mail — registre o envio por outro meio</span>
                  {!envioForm && <button className="btn-secondary btn-sm acao-escrita" onClick={() => setEnvioForm({ meio: 'PESSOALMENTE', data: hojeInput(), observacao: '' })}>Registrar envio</button>}
                </>
              )}
            </div>
            {envioForm && (
              <div className="card-flush mt-8" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Meio de envio</label>
                    <select value={envioForm.meio} onChange={e => setEnvioForm({ ...envioForm, meio: e.target.value })}>
                      {Object.entries(MEIO_ENVIO_TEXTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Data do envio</label>
                    <input type="date" value={envioForm.data} max={hojeInput()} onChange={e => setEnvioForm({ ...envioForm, data: e.target.value })} />
                  </div>
                </div>
                <label>Observação {envioForm.meio === 'OUTRO' ? '(obrigatória)' : '(opcional)'}</label>
                <input value={envioForm.observacao} onChange={e => setEnvioForm({ ...envioForm, observacao: e.target.value })} placeholder="Ex.: AR nº ..., entregue no protocolo" />
                <div className="btn-row mt-8">
                  <button className="btn-primary btn-sm" onClick={registrarEnvio}>Salvar envio</button>
                  <button className="btn-secondary btn-sm" onClick={() => setEnvioForm(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}

        {!encerrada && (
          <div className="btn-row mt-20">
            {sol.status === 'AGUARDANDO_VERIFICACAO' ? (
              !showVerifForm && (
                <button onClick={() => setShowVerifForm(true)} className="btn-primary btn-sm">
                  Registrar verificação de identidade
                </button>
              )
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
          <div className="card-header">Registrar verificação de identidade</div>
          {sol.status === 'AGUARDANDO_VERIFICACAO' && (
            <p className="text-muted text-xs mb-16">
              Ao registrar, o status muda para "Em análise" e o prazo legal de 15 dias começa a contar.
            </p>
          )}
          <label>Método</label>
          <select value={metodoVerif} onChange={e => setMetodoVerif(e.target.value)}>
            <option value="DOCUMENTO">Documento apresentado</option>
            <option value="CODIGO">Código</option>
            <option value="OUTRO">Outro</option>
          </select>
          <label>Observação {metodoVerif === 'OUTRO' ? '(obrigatória)' : '(opcional)'}</label>
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
            <button onClick={() => setShowVerifForm(false)} className="btn-secondary btn-sm">Cancelar</button>
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
          <p className="text-xs text-muted mb-8">Antes de enviar, retire a marca "MINUTA" e complete todos os campos entre colchetes [ ]: a resposta não é enviada com eles.</p>
          <label>Texto da resposta</label>
          <textarea value={resposta} onChange={e => setResposta(e.target.value)} rows={5} placeholder="Digite a resposta ao titular..." />
          {erroResposta && <div className="alert-error mt-8" role="alert">{erroResposta}</div>}
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
                  {fmtDataHora(ev.criadoEm)} — {rotuloProvidenciaDsar(ev.tipo)}
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
