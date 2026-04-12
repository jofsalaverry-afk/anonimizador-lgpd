import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';

const TIPO_OPTIONS = [
  { value: 'ACESSO', label: 'Acesso aos dados' },
  { value: 'CORRECAO', label: 'Correcao de dados' },
  { value: 'ELIMINACAO', label: 'Eliminacao de dados' },
  { value: 'PORTABILIDADE', label: 'Portabilidade' },
  { value: 'OPOSICAO', label: 'Oposicao ao tratamento' },
  { value: 'REVOGACAO', label: 'Revogacao do consentimento' },
  { value: 'INFORMACAO', label: 'Informacao sobre compartilhamento' },
  { value: 'PETICAO', label: 'Peticao a ANPD' }
];

export default function DsarForm({ token, onVoltar }) {
  const [form, setForm] = useState({ titularNome: '', titularEmail: '', titularCpf: '', tipoDireito: '', descricao: '' });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const salvar = async () => {
    if (!form.titularNome || !form.titularEmail || !form.tipoDireito || !form.descricao) {
      return setErro('Preencha nome, e-mail, tipo de direito e descricao');
    }
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/dsar/solicitacoes`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSucesso(`Solicitacao criada com protocolo ${res.data.protocolo}`);
      setTimeout(() => onVoltar(), 1200);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao criar solicitacao');
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="flex-center gap-8 mb-20">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">Nova solicitacao</h2>
      </div>

      <div className="card">
        {erro && <div className="alert-error">{erro}</div>}
        {sucesso && <div className="alert-success">{sucesso}</div>}

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>Nome do titular</label>
            <input value={form.titularNome} onChange={e => setForm({ ...form, titularNome: e.target.value })} placeholder="Nome completo" />
          </div>
          <div className="form-group">
            <label>E-mail do titular</label>
            <input type="email" value={form.titularEmail} onChange={e => setForm({ ...form, titularEmail: e.target.value })} placeholder="email@exemplo.com" />
          </div>
        </div>

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>CPF (opcional)</label>
            <input value={form.titularCpf} onChange={e => setForm({ ...form, titularCpf: e.target.value })} placeholder="000.000.000-00" />
          </div>
          <div className="form-group">
            <label>Tipo de direito (LGPD Art. 18)</label>
            <select value={form.tipoDireito} onChange={e => setForm({ ...form, tipoDireito: e.target.value })}>
              <option value="">Selecione...</option>
              {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Descricao da solicitacao</label>
          <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={4} placeholder="Descreva o pedido do titular..." />
        </div>

        <div className="btn-row-spread mt-20">
          <button onClick={onVoltar} className="btn-secondary btn-sm">Cancelar</button>
          <button onClick={salvar} disabled={loading} className="btn-primary btn-sm">
            {loading ? 'Criando...' : 'Registrar solicitacao'}
          </button>
        </div>
      </div>
    </div>
  );
}
