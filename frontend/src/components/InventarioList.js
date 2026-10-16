import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { TIPO_SISTEMA_LABEL, HOSPEDAGEM_LABEL } from './rotulos';
import { BotoesExportar } from './download';

export default function InventarioList({ token, onNovo, onVer }) {
  const [sistemas, setSistemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState('ativo');

  useEffect(() => {
    axios.get(`${API}/inventario/sistemas`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setSistemas(res.data))
      .catch(err => setErro(err.response?.data?.erro || 'Erro ao carregar inventário'))
      .finally(() => setLoading(false));
  }, [token]);

  const filtrados = sistemas.filter(s => {
    if (filtroTipo && s.tipo !== filtroTipo) return false;
    if (filtroAtivo === 'ativo' && !s.ativo) return false;
    if (filtroAtivo === 'inativo' && s.ativo) return false;
    return true;
  });

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Inventário de sistemas</h2>
        <div className="btn-row">
          <BotoesExportar token={token} caminho="/inventario/sistemas/export" nome="inventario-sistemas" onErro={setErro} />
          <button onClick={onNovo} className="btn-primary btn-sm">+ Novo sistema</button>
        </div>
      </div>
      {erro && <p className="alert-error mb-12">{erro}</p>}

      <div className="filters mb-16">
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_SISTEMA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}>
          <option value="ativo">Ativos</option>
          <option value="inativo">Desativados</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum sistema cadastrado.</p>
          <button onClick={onNovo} className="btn-primary btn-sm mt-16">Cadastrar primeiro sistema</button>
        </div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Responsável</th>
                <th>Fornecedor</th>
                <th>Hospedagem</th>
                <th>Tratamentos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(s => (
                <tr key={s.id}>
                  <td>{s.nome}{!s.ativo && <span className="badge badge-muted" style={{ marginLeft: 6 }}>desativado</span>}</td>
                  <td><span className="badge badge-purple">{TIPO_SISTEMA_LABEL[s.tipo] || s.tipo}</span></td>
                  <td>{s.responsavel?.nome || '-'}</td>
                  <td>{s.terceiro?.razaoSocial || '-'}</td>
                  <td className="text-muted">
                    {s.tipoHospedagem ? HOSPEDAGEM_LABEL[s.tipoHospedagem] : '-'}
                    {s.paisHospedagem ? ` · ${s.paisHospedagem}` : ''}
                    {s.regiaoHospedagem ? ` / ${s.regiaoHospedagem}` : ''}
                  </td>
                  <td>{s.qtdTratamentos}</td>
                  <td><button onClick={() => onVer(s.id)} className="btn-secondary btn-sm">Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
