import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import { baixarArquivo, BotoesExportar, BotaoPdfA } from './download';
import Historico from './Historico';
import { fmtData, fmtDiaSP } from '../datas';

const STATUS_BADGE = { OK: 'badge badge-success', PENDENTE: 'badge badge-danger', INATIVO: 'badge badge-muted', SEM_DADOS: 'badge badge-muted' };
const STATUS_TEXTO = { OK: 'OK', PENDENTE: 'Pendente', INATIVO: 'Módulo inativo', SEM_DADOS: 'Sem dados no mês' };
const NOME_META = { ROPA: 'ROPA (processos mapeados)', CONTRATOS: 'Contratos críticos com aditivo', TREINAMENTOS: 'Servidores treinados', DSAR: 'DSAR no prazo' };
const fmt = d => fmtData(d) || '—';

function CardIndicador({ i, onAbrir, metaPersonalizada }) {
  const clicavel = i.link && i.status !== 'INATIVO';
  return (
    <div className="card" style={{ cursor: clicavel ? 'pointer' : 'default', minHeight: 140 }} onClick={() => clicavel && onAbrir(i.link)}
      title={clicavel ? 'Abrir a lista de origem' : ''}>
      <div className="flex-between mb-8">
        <div className="detail-label">{i.titulo}</div>
        <span className={STATUS_BADGE[i.status]}>{STATUS_TEXTO[i.status] || i.status}</span>
      </div>
      {i.chave === 'INCIDENTES' ? (
        i.status !== 'INATIVO' && (
          <>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{i.incidentesReaisNoMes}</div>
            <div className="text-sm text-muted">incidente(s) real(is) no mês · último simulado: {fmt(i.ultimoSimulado)}</div>
          </>
        )
      ) : (
        i.status === 'SEM_DADOS' ? (
          <div className="text-sm text-muted" style={{ padding: '10px 0' }}>{i.observacao}</div>
        ) : i.status !== 'INATIVO' && (
          <>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{i.n}/{i.total}</div>
            <div className="text-sm text-muted">
              {i.percentual === null ? 'sem base de cálculo' : `${i.percentual}%`} · meta {i.meta}%
              {metaPersonalizada && <span className="badge badge-muted" style={{ marginLeft: 6 }}>meta personalizada</span>}
            </div>
          </>
        )
      )}
      {i.status !== 'SEM_DADOS' && <div className="text-xs text-muted mt-8">{i.observacao}</div>}
    </div>
  );
}

export default function PainelIndicadores({ token, usuario, onNavegar }) {
  const [dados, setDados] = useState(null);
  const [metas, setMetas] = useState(null);
  const [editandoMetas, setEditandoMetas] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [mostrarHist, setMostrarHist] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [gerandoZip, setGerandoZip] = useState(false);
  const gestor = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);
  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [ind, met, snap] = await Promise.all([
        axios.get(`${API}/indicadores`, { headers: h }),
        axios.get(`${API}/indicadores/metas`, { headers: h }),
        axios.get(`${API}/indicadores/snapshots`, { headers: h })
      ]);
      setDados(ind.data);
      setMetas(met.data.metas);
      setSnapshots(snap.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar indicadores');
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarMetas = async () => {
    setErro(''); setMsg('');
    try {
      await axios.put(`${API}/indicadores/metas`, { metas }, { headers });
      setEditandoMetas(false);
      setMsg('Metas atualizadas.');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar metas');
    }
  };

  const gerarFoto = async () => {
    setErro(''); setMsg('');
    try {
      await axios.post(`${API}/indicadores/snapshots`, {}, { headers });
      setMsg('Foto do mês registrada.');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao gerar foto');
    }
  };

  const pacote = async () => {
    setGerandoZip(true); setErro('');
    try {
      await baixarArquivo(token, '/portabilidade/pacote', 'portabilidade.zip');
    } catch (e) {
      setErro(e.message);
    }
    setGerandoZip(false);
  };

  if (!dados) return erro ? <div className="alert-error">{erro}</div> : <p className="text-muted">Carregando indicadores...</p>;

  return (
    <div>
      <div className="page-header">
        <div className="text-muted">Mês de referência: <strong>{dados.mesReferencia}</strong></div>
        <div className="btn-row">
          <BotoesExportar token={token} caminho="/indicadores/export" nome="indicadores" onErro={setErro} />
          <BotaoPdfA token={token} tipo="indicadores" onErro={setErro} />
          {gestor && <button className="btn-primary btn-sm" onClick={pacote} disabled={gerandoZip}>{gerandoZip ? 'Gerando ZIP...' : 'Pacote de portabilidade (ZIP)'}</button>}
        </div>
      </div>
      {erro && <div className="alert-error mb-12">{erro}</div>}
      {msg && <div className="alert-success mb-12">{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }} className="mb-16">
        {dados.indicadores.map(i => <CardIndicador key={i.chave} i={i} onAbrir={onNavegar} metaPersonalizada={!!dados.metasPersonalizadas?.[i.chave]} />)}
      </div>

      {/* ---------- Metas ---------- */}
      <div className="card mb-16">
        <div className="flex-between mb-8">
          <div className="card-header" style={{ marginBottom: 0 }}>Metas</div>
          {gestor && !editandoMetas && <button className="btn-ghost btn-sm" onClick={() => setEditandoMetas(true)}>Editar metas</button>}
        </div>
        <p className="text-xs text-muted mb-8">
          Padrões: ROPA 100%, Contratos 100%, Treinamentos 80%, DSAR 100%; Incidentes fica OK com simulado nos últimos 12 meses.
          As metas definitivas são fixadas no Plano de Trabalho.
        </p>
        {metas && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {Object.entries(NOME_META).map(([k, nome]) => (
              <label key={k} className="text-sm">
                {nome}
                {editandoMetas ? (
                  <input type="number" min="0" max="100" value={metas[k]} onChange={e => setMetas({ ...metas, [k]: Number(e.target.value) })} />
                ) : (
                  <div style={{ fontWeight: 700 }}>{metas[k]}%</div>
                )}
              </label>
            ))}
          </div>
        )}
        {editandoMetas && (
          <div className="btn-row mt-8">
            <button className="btn-primary btn-sm" onClick={salvarMetas}>Salvar metas</button>
            <button className="btn-secondary btn-sm" onClick={() => { setEditandoMetas(false); carregar(); }}>Cancelar</button>
          </div>
        )}
        {gestor && (
          <div className="mt-8">
            <button className="btn-ghost btn-sm" onClick={() => setMostrarHist(!mostrarHist)}>{mostrarHist ? 'Ocultar histórico das metas' : 'Histórico das metas'}</button>
            {mostrarHist && <Historico token={token} entidade="METAS_INDICADORES" registroId={usuario.organizacaoId} />}
          </div>
        )}
      </div>

      {/* ---------- Fotos mensais ---------- */}
      <div className="card">
        <div className="flex-between mb-8">
          <div className="card-header" style={{ marginBottom: 0 }}>Histórico mensal (fotos)</div>
          <div className="btn-row">
            <BotoesExportar token={token} caminho="/indicadores/snapshots/export" nome="indicadores-snapshots" onErro={setErro} rotulo="histórico" />
            {gestor && <button className="btn-secondary btn-sm" onClick={gerarFoto}>Gerar foto agora</button>}
          </div>
        </div>
        <p className="text-xs text-muted mb-8">Gerada automaticamente no dia 1 de cada mês para o mês anterior. A foto manual do mês é substituída pela automática no fechamento.</p>
        {snapshots.length === 0 ? (
          <p className="text-muted">Nenhuma foto registrada ainda.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Mês</th>{dados.indicadores.map(i => <th key={i.chave}>{i.chave}</th>)}<th>Origem</th></tr>
            </thead>
            <tbody>
              {snapshots.map(sn => (
                <tr key={sn.id}>
                  <td>{sn.mesReferencia}</td>
                  {dados.indicadores.map(i => {
                    const v = (sn.valores?.indicadores || []).find(x => x.chave === i.chave);
                    if (!v) return <td key={i.chave}>—</td>;
                    const txt = v.chave === 'INCIDENTES' ? `${v.incidentesReaisNoMes ?? '—'} · sim. ${fmt(v.ultimoSimulado)}` : v.status === 'INATIVO' ? '—' : `${v.n}/${v.total}`;
                    return <td key={i.chave}><span className={STATUS_BADGE[v.status]}>{txt}</span></td>;
                  })}
                  <td className="text-xs">{sn.origem === 'CRON' ? 'automática' : 'manual'} · {fmtDiaSP(sn.geradoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
