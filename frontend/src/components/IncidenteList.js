import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import { BotoesExportar, BotaoPdfA } from './download';

const TIPO_INC_LABEL = { VAZAMENTO: 'Vazamento', ACESSO_INDEVIDO: 'Acesso indevido', PERDA: 'Perda', ALTERACAO: 'Alteração', OUTRO: 'Outro' };
const STATUS_INC_LABEL = { ABERTO: 'Aberto', EM_INVESTIGACAO: 'Em investigação', RESOLVIDO: 'Resolvido', ENCERRADO: 'Encerrado' };
const SEVERIDADE_LABEL = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
const SEVERIDADE_BADGE = { ALTA: 'badge badge-danger', MEDIA: 'badge badge-warning', BAIXA: 'badge badge-success' };
const STATUS_INC_BADGE = { ABERTO: 'badge badge-danger', EM_INVESTIGACAO: 'badge badge-warning', RESOLVIDO: 'badge badge-success', ENCERRADO: 'badge badge-muted' };

export default function IncidenteList({ token, onNovo, onVer, filtroInicial }) {
  const [incidentes, setIncidentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroSeveridade, setFiltroSeveridade] = useState('');
  const [filtroTipo, setFiltroTipo] = useState(['REAL', 'SIMULADO'].includes(filtroInicial?.filtro) ? filtroInicial.filtro : '');

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/repositorio/incidentes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIncidentes(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar incidentes');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = incidentes.filter(i => {
    if (filtroStatus && i.status !== filtroStatus) return false;
    if (filtroSeveridade && i.severidade !== filtroSeveridade) return false;
    if (filtroTipo && i.tipoRegistro !== filtroTipo) return false;
    return true;
  });

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Incidentes de Segurança</h2>
        <div className="btn-row">
          <BotoesExportar token={token} caminho="/repositorio/incidentes/export" nome="incidentes" onErro={setErro} />
          <BotaoPdfA token={token} tipo="incidentes" onErro={setErro} />
          <button onClick={onNovo} className="btn-primary btn-sm">+ Novo incidente</button>
        </div>
      </div>

      {erro && <div className="alert-error">{erro}</div>}

      <div className="filters">
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_INC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroSeveridade} onChange={e => setFiltroSeveridade(e.target.value)}>
          <option value="">Todas as severidades</option>
          {Object.entries(SEVERIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Reais e simulados</option>
          <option value="REAL">Só reais</option>
          <option value="SIMULADO">Só simulados</option>
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum incidente registrado.</p>
          <button onClick={onNovo} className="btn-primary btn-sm">Registrar primeiro incidente</button>
        </div>
      ) : (
        <div className="card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Severidade</th>
                <th>Data Ocorrência</th>
                <th>Titulares Afetados</th>
                <th>ANPD</th>
                <th>Status</th>
                <th>Responsável</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(i => (
                <tr key={i.id}>
                  <td className="table-cell-truncate">
                    <strong>{i.titulo}</strong>
                    {i.tipoRegistro === 'SIMULADO' && <span className="badge badge-info" style={{ marginLeft: 6 }}>simulado</span>}
                  </td>
                  <td><span className="badge badge-purple">{TIPO_INC_LABEL[i.tipoIncidente] || i.tipoIncidente}</span></td>
                  <td>{i.severidade ? <span className={SEVERIDADE_BADGE[i.severidade]}>{SEVERIDADE_LABEL[i.severidade]}</span> : '-'}</td>
                  <td>{i.dataOcorrencia ? new Date(i.dataOcorrencia).toLocaleDateString('pt-BR') : '-'}</td>
                  <td>{i.qtdTitulares || 0}</td>
                  <td>
                    <span className={i.notificadoANPD ? 'badge badge-success' : 'badge badge-danger'}>
                      {i.notificadoANPD ? 'Sim' : 'Não'}
                    </span>
                  </td>
                  <td>
                    <span className={STATUS_INC_BADGE[i.status] || 'badge badge-muted'}>
                      {STATUS_INC_LABEL[i.status] || i.status}
                    </span>
                  </td>
                  <td>{i.responsavel?.nome || '-'}</td>
                  <td>
                    <button onClick={() => onVer(i.id)} className="btn-ghost btn-sm">Ver</button>
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
