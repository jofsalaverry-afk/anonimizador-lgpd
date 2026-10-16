import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import { BotoesExportar, BotaoPdfA } from './download';
import { SeloANPD } from './incidenteRotulos';
import { fmtData } from '../datas';

const TIPO_INC_LABEL = { VAZAMENTO: 'Vazamento', ACESSO_INDEVIDO: 'Acesso indevido', PERDA: 'Perda', ALTERACAO: 'Alteração', OUTRO: 'Outro' };
const STATUS_INC_LABEL = { ABERTO: 'Aberto', EM_INVESTIGACAO: 'Em investigação', RESOLVIDO: 'Resolvido', ENCERRADO: 'Encerrado' };
const SEVERIDADE_LABEL = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
const SEVERIDADE_BADGE = { ALTA: 'badge badge-danger', MEDIA: 'badge badge-warning', BAIXA: 'badge badge-success' };
const STATUS_INC_BADGE = { ABERTO: 'badge badge-danger', EM_INVESTIGACAO: 'badge badge-warning', RESOLVIDO: 'badge badge-success', ENCERRADO: 'badge badge-muted' };

export default function IncidenteList({ token, onNovo, onVer, onEditar, filtroInicial }) {
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
        // Colunas enxutas para caber na largura; tipo e responsavel vao como
        // linha de apoio sob o titulo; detalhes completos em "Ver".
        <div className="card-flush" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Incidente</th>
                <th>Ocorrência</th>
                <th>Severidade</th>
                <th>Titulares</th>
                <th>ANPD</th>
                <th>Status</th>
                <th style={{ whiteSpace: 'nowrap' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(i => (
                <tr key={i.id}>
                  <td style={{ maxWidth: 280 }}>
                    <strong style={{ wordBreak: 'break-word' }}>{i.titulo}</strong>
                    {i.tipoRegistro === 'SIMULADO' && <span className="badge badge-info" style={{ marginLeft: 6 }}>simulado</span>}
                    <div className="text-xs text-muted">{TIPO_INC_LABEL[i.tipoIncidente] || i.tipoIncidente}{i.responsavel?.nome ? ` · ${i.responsavel.nome}` : ''}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{i.dataOcorrencia ? fmtData(i.dataOcorrencia) : '-'}</td>
                  <td>{i.severidade ? <span className={SEVERIDADE_BADGE[i.severidade]}>{SEVERIDADE_LABEL[i.severidade]}</span> : '-'}</td>
                  <td>{i.qtdTitulares || 0}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><SeloANPD inc={i} /></td>
                  <td>
                    <span className={STATUS_INC_BADGE[i.status] || 'badge badge-muted'}>
                      {STATUS_INC_LABEL[i.status] || i.status}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => onVer(i.id)} className="btn-ghost btn-sm">Ver</button>
                    <button onClick={() => onEditar(i.id)} className="btn-secondary btn-sm acao-escrita" style={{ marginLeft: 4 }}>Editar</button>
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
