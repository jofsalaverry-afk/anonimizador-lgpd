import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { BotoesExportar } from './download';
import { PAPEL_TERCEIRO_LABEL, BadgeRisco } from './rotulos';

export default function TerceiroList({ token, onNovo, onVer, filtroInicial }) {
  const [terceiros, setTerceiros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroRisco, setFiltroRisco] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState('ativo');
  // Vindo do painel: contratos criticos ainda sem aditivo LGPD
  const [filtroContrato, setFiltroContrato] = useState(filtroInicial?.filtro === 'criticos-sem-aditivo' ? 'criticos-sem-aditivo' : '');

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/terceiros`, { params: filtroRisco ? { risco: filtroRisco } : {}, headers: { Authorization: `Bearer ${token}` } })
      .then(res => setTerceiros(res.data))
      .catch(err => setErro(err.response?.data?.erro || 'Erro ao carregar terceiros'))
      .finally(() => setLoading(false));
  }, [token, filtroRisco]);

  const filtrados = terceiros.filter(t => {
    if (filtroAtivo === 'ativo' && !t.ativo) return false;
    if (filtroAtivo === 'inativo' && t.ativo) return false;
    if (filtroContrato === 'criticos' && !t.contratoCritico) return false;
    if (filtroContrato === 'criticos-sem-aditivo' && !(t.contratoCritico && !t.aditivoLgpdAssinado)) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div className="btn-row">
          <BotoesExportar token={token} caminho="/terceiros/export" nome="terceiros-operadores" onErro={setErro} />
          <button onClick={onNovo} className="btn-primary btn-sm">+ Novo terceiro</button>
        </div>
      </div>
      {erro && <p className="alert-error mb-12">{erro}</p>}

      <div className="filters mb-16">
        <select value={filtroRisco} onChange={e => setFiltroRisco(e.target.value)}>
          <option value="">Todos os riscos</option>
          <option value="ALTO">Risco alto</option>
          <option value="MEDIO">Risco médio</option>
          <option value="BAIXO">Risco baixo</option>
          <option value="NAO_AVALIADO">Não avaliado</option>
        </select>
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}>
          <option value="ativo">Ativos</option>
          <option value="inativo">Desativados</option>
          <option value="todos">Todos</option>
        </select>
        <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)}>
          <option value="">Todos os contratos</option>
          <option value="criticos">Só críticos</option>
          <option value="criticos-sem-aditivo">Críticos sem aditivo LGPD</option>
        </select>
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum terceiro encontrado.</p>
          <button onClick={onNovo} className="btn-primary btn-sm mt-16">Cadastrar terceiro</button>
        </div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Razão social</th>
                <th>Papel</th>
                <th>Contrato</th>
                <th>Aditivo LGPD</th>
                <th>Risco</th>
                <th>Ações pendentes</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(t => (
                <tr key={t.id}>
                  <td>
                    {t.razaoSocial}
                    {t.contratoCritico && <span className="badge badge-muted" style={{ marginLeft: 6 }}>Contrato crítico</span>}
                    {!t.ativo && <span className="badge badge-muted" style={{ marginLeft: 6 }}>desativado</span>}
                  </td>
                  <td>{PAPEL_TERCEIRO_LABEL[t.papel]}</td>
                  <td>{t.contratoVigente ? 'Vigente' : 'Sem contrato vigente'}</td>
                  <td>
                    <span className={t.aditivoLgpdAssinado ? 'badge badge-success' : 'badge badge-warning'}>
                      {t.aditivoLgpdAssinado ? 'Assinado' : 'Pendente'}
                    </span>
                  </td>
                  <td><BadgeRisco risco={t.risco} manual={t.riscoManual} /></td>
                  <td>{t.acoesPendentes}</td>
                  <td><button onClick={() => onVer(t.id)} className="btn-secondary btn-sm">Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
