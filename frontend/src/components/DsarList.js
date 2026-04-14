import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

const TIPO_LABEL = {
  ACESSO: 'Acesso', CORRECAO: 'Correção', ELIMINACAO: 'Eliminação',
  PORTABILIDADE: 'Portabilidade', OPOSICAO: 'Oposição', REVOGACAO: 'Revogação',
  INFORMACAO: 'Informação', PETICAO: 'Petição'
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

export default function DsarList({ token, onNova, onVer }) {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/dsar/solicitacoes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSolicitacoes(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar solicitações');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = solicitacoes.filter(s => {
    if (filtroStatus && s.status !== filtroStatus) return false;
    if (filtroTipo && s.tipoDireito !== filtroTipo) return false;
    return true;
  });

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Direitos do Titular (DSAR)</h2>
        <div className="btn-row">
          <button onClick={onNova} className="btn-primary btn-sm">+ Nova solicitação</button>
        </div>
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      <div className="filters">
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {filtradas.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhuma solicitação registrada.</p>
          <button onClick={onNova} className="btn-primary btn-sm">Registrar primeira solicitação</button>
        </div>
      ) : (
        <div className="card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Protocolo</th>
                <th>Titular</th>
                <th>Tipo de Direito</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.protocolo}</strong></td>
                  <td>
                    <div>{s.titularNome}</div>
                    <div className="text-muted text-xs">{s.titularEmail}</div>
                  </td>
                  <td><span className="badge badge-purple">{TIPO_LABEL[s.tipoDireito] || s.tipoDireito}</span></td>
                  <td><span className={STATUS_BADGE[s.status] || 'badge badge-muted'}>{STATUS_LABEL[s.status] || s.status}</span></td>
                  <td>
                    {['ENCERRADA', 'CANCELADA'].includes(s.status) ? (
                      <span className="badge badge-muted">Encerrado</span>
                    ) : (
                      <span className={SLA_BADGE[s.sla?.cor] || 'badge badge-muted'}>{s.sla?.label || '-'}</span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => onVer(s.id)} className="btn-ghost btn-sm">Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
