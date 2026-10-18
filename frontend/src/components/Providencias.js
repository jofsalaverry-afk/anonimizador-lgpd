import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';
import SeletorResponsavel from './SeletorResponsavel';
import { fmtData } from '../datas';

const VAZIA = { descricao: '', data: '', responsavelId: '' };

// Lista de providencias de um incidente + formulario para adicionar.
export default function Providencias({ token, incidenteId, providencias, onAdicionada }) {
  const [nova, setNova] = useState(VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const adicionar = async () => {
    if (!nova.descricao.trim()) return setErro('Descreva a providência');
    setSalvando(true);
    setErro('');
    try {
      await axios.post(`${API}/repositorio/incidentes/${incidenteId}/providencias`,
        { ...nova, data: nova.data || null }, { headers: { Authorization: `Bearer ${token}` } });
      setNova(VAZIA);
      onAdicionada();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao registrar providência');
    }
    setSalvando(false);
  };

  return (
    <div className="card mb-16">
      <div className="card-header">Providências adotadas ({providencias.length})</div>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      {providencias.length === 0 && <p className="text-muted mb-12">Nenhuma providência registrada.</p>}
      {providencias.length > 0 && (
        <div className="timeline mb-16">
          {providencias.map(p => (
            <div key={p.id} className="timeline-item">
              <div className="timeline-dot" />
              <div className="timeline-date">
                {fmtData(p.data)} — {p.responsavel?.nome || 'sem responsável'}
              </div>
              <div className="timeline-content">{p.descricao}</div>
            </div>
          ))}
        </div>
      )}
      <div className="acao-escrita">
      <label>Nova providência</label>
      <textarea rows={2} value={nova.descricao} onChange={e => setNova({ ...nova, descricao: e.target.value })} placeholder="Ex: Senhas redefinidas e titulares comunicados" />
      <div className="form-grid mb-8">
        <div className="form-group">
          <label>Data</label>
          <input type="date" value={nova.data} onChange={e => setNova({ ...nova, data: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Responsável</label>
          <SeletorResponsavel token={token} value={nova.responsavelId} onChange={v => setNova({ ...nova, responsavelId: v })} />
        </div>
      </div>
      <button className="btn-secondary btn-sm" onClick={adicionar} disabled={salvando}>{salvando ? 'Salvando...' : '+ Registrar providência'}</button>
      </div>
    </div>
  );
}
