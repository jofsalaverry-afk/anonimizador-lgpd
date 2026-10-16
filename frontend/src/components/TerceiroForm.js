import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { PAPEL_TERCEIRO_LABEL } from './rotulos';

const VAZIO = {
  razaoSocial: '', cnpj: '', contatoNome: '', contatoEmail: '', papel: 'OPERADOR',
  descricaoServico: '', contratoVigente: false, contratoCritico: false,
  aditivoLgpdAssinado: false, dataAditivo: ''
};

export default function TerceiroForm({ token, terceiroId, onVoltar, onSalvo }) {
  const [form, setForm] = useState(VAZIO);
  const [loading, setLoading] = useState(!!terceiroId);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!terceiroId) return;
    axios.get(`${API}/terceiros/${terceiroId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data: t }) => setForm({
        razaoSocial: t.razaoSocial, cnpj: t.cnpj || '', contatoNome: t.contatoNome || '',
        contatoEmail: t.contatoEmail || '', papel: t.papel, descricaoServico: t.descricaoServico || '',
        contratoVigente: t.contratoVigente, contratoCritico: t.contratoCritico,
        aditivoLgpdAssinado: t.aditivoLgpdAssinado, dataAditivo: t.dataAditivo ? t.dataAditivo.substring(0, 10) : ''
      }))
      .catch(err => setErro(err.response?.data?.erro || 'Erro ao carregar terceiro'))
      .finally(() => setLoading(false));
  }, [token, terceiroId]);

  const salvar = async () => {
    if (!form.razaoSocial.trim()) return setErro('Informe a razão social');
    setSalvando(true);
    setErro('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const payload = { ...form, dataAditivo: form.dataAditivo || null };
      const res = terceiroId
        ? await axios.put(`${API}/terceiros/${terceiroId}`, payload, { headers })
        : await axios.post(`${API}/terceiros`, payload, { headers });
      onSalvo(res.data.id);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar');
    }
    setSalvando(false);
  };

  const check = (campo, texto) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="mb-8">
      <input type="checkbox" checked={form[campo]} onChange={e => setForm({ ...form, [campo]: e.target.checked })} /> {texto}
    </label>
  );

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header mb-16">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{terceiroId ? 'Editar terceiro' : 'Novo terceiro'}</h2>
      </div>
      <div className="card">
        {erro && <p className="alert-error mb-12">{erro}</p>}
        <div className="form-grid mb-12">
          <div className="form-group">
            <label>Razão social</label>
            <input value={form.razaoSocial} onChange={e => setForm({ ...form, razaoSocial: e.target.value })} />
          </div>
          <div className="form-group">
            <label>CNPJ</label>
            <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
          </div>
          <div className="form-group">
            <label>Contato (nome)</label>
            <input value={form.contatoNome} onChange={e => setForm({ ...form, contatoNome: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Contato (e-mail)</label>
            <input type="email" value={form.contatoEmail} onChange={e => setForm({ ...form, contatoEmail: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Papel na LGPD</label>
            <select value={form.papel} onChange={e => setForm({ ...form, papel: e.target.value })}>
              {Object.entries(PAPEL_TERCEIRO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Data do aditivo LGPD</label>
            <input type="date" value={form.dataAditivo} onChange={e => setForm({ ...form, dataAditivo: e.target.value })} />
          </div>
        </div>
        <div className="form-group mb-12">
          <label>Serviço prestado</label>
          <textarea rows={2} value={form.descricaoServico} onChange={e => setForm({ ...form, descricaoServico: e.target.value })} placeholder="Ex: hospedagem do sistema de folha de pagamento" />
        </div>
        {check('contratoVigente', 'Contrato vigente')}
        {check('contratoCritico', 'Contrato crítico (trata dados sensíveis ou em grande volume)')}
        {check('aditivoLgpdAssinado', 'Aditivo LGPD assinado')}
        <div className="btn-row-spread mt-20">
          <button onClick={onVoltar} className="btn-secondary btn-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="btn-primary btn-sm">{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
