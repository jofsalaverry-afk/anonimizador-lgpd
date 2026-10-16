import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';
import SeletorResponsavel from './SeletorResponsavel';
import { paraInputData } from '../datas';

// Cadastro/edicao de atividade propria do checklist (alem do catalogo global).
export default function AtividadeForm({ token, atividade, onSalvo, onCancelar }) {
  const [form, setForm] = useState({
    titulo: atividade?.titulo || '',
    descricao: atividade?.descricao || '',
    responsavelId: atividade?.responsavelId || '',
    prazo: paraInputData(atividade?.prazo),
    criticidade: atividade?.criticidade || 'MEDIA'
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!form.titulo.trim()) return setErro('Informe o título');
    setSalvando(true);
    setErro('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const corpo = { ...form, prazo: form.prazo || null };
      if (atividade?.id) await axios.put(`${API}/conformidade/atividades/${atividade.id}`, corpo, { headers });
      else await axios.post(`${API}/conformidade/atividades`, corpo, { headers });
      onSalvo();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar atividade');
    }
    setSalvando(false);
  };

  return (
    <div className="card mb-16">
      <div className="card-header">{atividade?.id ? 'Editar atividade própria' : 'Nova atividade própria'}</div>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      <label>Título</label>
      <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Revisar contratos de TI com cláusula LGPD" />
      <label>Descrição</label>
      <textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
      <div className="form-grid mb-8">
        <div className="form-group">
          <label>Responsável</label>
          <SeletorResponsavel token={token} value={form.responsavelId} onChange={v => setForm({ ...form, responsavelId: v })} />
        </div>
        <div className="form-group">
          <label>Prazo</label>
          <input type="date" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Criticidade</label>
          <select value={form.criticidade} onChange={e => setForm({ ...form, criticidade: e.target.value })}>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Média</option>
            <option value="BAIXA">Baixa</option>
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn-primary btn-sm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        <button className="btn-secondary btn-sm" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
