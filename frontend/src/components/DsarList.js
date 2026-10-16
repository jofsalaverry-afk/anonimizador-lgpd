import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import { TIPO_DIREITO_LABEL } from './rotulos';
import { BotoesExportar, BotaoPdfA } from './download';

// Mes AAAA-MM em horario de Brasilia (mesma regra do painel).
const mesBrt = d => {
  const x = new Date(new Date(d).getTime() - 3 * 60 * 60 * 1000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};

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

const SLA_BADGE = {
  verde: 'badge badge-success', amarelo: 'badge badge-warning',
  vermelho: 'badge badge-danger', vencido: 'badge badge-danger'
};

export default function DsarList({ token, onNova, onVer, filtroInicial, onModelos }) {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroMes, setFiltroMes] = useState(filtroInicial?.filtro === 'mes' ? filtroInicial.mes : '');

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
    if (filtroMes && mesBrt(s.dataRecebimento) !== filtroMes) return false;
    return true;
  });

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <div className="btn-row">
          <BotoesExportar token={token} caminho="/dsar/export" nome="dsar-solicitacoes" onErro={setErro} />
          <BotaoPdfA token={token} tipo="dsar" onErro={setErro} />
          <button onClick={onModelos} className="btn-secondary btn-sm">Modelos de resposta</button>
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
        <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} title="Mês de recebimento" style={{ width: 'auto', marginBottom: 0 }} />
        {filtroMes && <button className="btn-ghost btn-sm" onClick={() => setFiltroMes('')}>Todos os meses</button>}
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
