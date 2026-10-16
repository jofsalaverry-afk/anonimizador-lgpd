import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import SeletorResponsavel from './SeletorResponsavel';
import { TIPO_SISTEMA_LABEL, HOSPEDAGEM_LABEL, CATEGORIAS_DADOS } from './rotulos';

const VAZIO = {
  nome: '', tipo: '', finalidade: '', responsavelId: '', terceiroId: '',
  categoriasDados: [], formasCompartilhamento: '', integracaoIds: [],
  tipoHospedagem: '', paisHospedagem: '', regiaoHospedagem: '', ativo: true
};

export default function InventarioForm({ token, sistemaId, onVoltar }) {
  const [form, setForm] = useState(VAZIO);
  const [sistemas, setSistemas] = useState([]);
  const [terceiros, setTerceiros] = useState(null); // null = modulo terceiros indisponivel
  const [loading, setLoading] = useState(!!sistemaId);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/inventario/sistemas`, { headers }).then(res => setSistemas(res.data)).catch(() => {});
    axios.get(`${API}/terceiros`, { headers }).then(res => setTerceiros(res.data.filter(t => t.ativo))).catch(() => setTerceiros(null));
    if (!sistemaId) return;
    axios.get(`${API}/inventario/sistemas/${sistemaId}`, { headers })
      .then(({ data: s }) => setForm({
        nome: s.nome, tipo: s.tipo, finalidade: s.finalidade || '',
        responsavelId: s.responsavelId || '', terceiroId: s.terceiroId || '',
        categoriasDados: s.categoriasDados || [], formasCompartilhamento: s.formasCompartilhamento || '',
        integracaoIds: (s.integracoesSaida || []).map(i => i.destinoId),
        tipoHospedagem: s.tipoHospedagem || '', paisHospedagem: s.paisHospedagem || '',
        regiaoHospedagem: s.regiaoHospedagem || '', ativo: s.ativo
      }))
      .catch(err => setErro(err.response?.data?.erro || 'Erro ao carregar sistema'))
      .finally(() => setLoading(false));
  }, [token, sistemaId]);

  const alternar = (campo, valor) => setForm(f => ({
    ...f,
    [campo]: f[campo].includes(valor) ? f[campo].filter(x => x !== valor) : [...f[campo], valor]
  }));

  const salvar = async () => {
    if (!form.nome.trim() || !form.tipo) return setErro('Preencha nome e tipo');
    setSalvando(true);
    setErro('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const payload = { ...form, terceiroId: terceiros ? form.terceiroId : undefined };
      if (sistemaId) await axios.put(`${API}/inventario/sistemas/${sistemaId}`, payload, { headers });
      else await axios.post(`${API}/inventario/sistemas`, payload, { headers });
      onVoltar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar');
    }
    setSalvando(false);
  };

  if (loading) return <p className="text-muted">Carregando...</p>;
  const outros = sistemas.filter(s => s.id !== sistemaId && (s.ativo || form.integracaoIds.includes(s.id)));

  return (
    <div>
      <div className="page-header mb-16">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{sistemaId ? 'Editar sistema' : 'Novo sistema'}</h2>
      </div>
      <div className="card">
        {erro && <p className="alert-error mb-12">{erro}</p>}
        <div className="form-grid mb-12">
          <div className="form-group">
            <label>Nome</label>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Sistema de protocolo" />
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="">Selecione...</option>
              {Object.entries(TIPO_SISTEMA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group mb-12">
          <label>Finalidade</label>
          <textarea rows={2} value={form.finalidade} onChange={e => setForm({ ...form, finalidade: e.target.value })} placeholder="Para que o sistema é usado" />
        </div>
        <div className="form-grid mb-12">
          <div className="form-group">
            <label>Responsável</label>
            <SeletorResponsavel token={token} value={form.responsavelId} onChange={v => setForm({ ...form, responsavelId: v })} />
          </div>
          <div className="form-group">
            <label>Fornecedor</label>
            {terceiros ? (
              <select value={form.terceiroId} onChange={e => setForm({ ...form, terceiroId: e.target.value })}>
                <option value="">Sem fornecedor / desenvolvimento próprio</option>
                {terceiros.map(t => <option key={t.id} value={t.id}>{t.razaoSocial}</option>)}
              </select>
            ) : (
              <p className="text-muted text-sm">Ative o módulo Terceiros para vincular o fornecedor.</p>
            )}
          </div>
        </div>
        <label className="mb-8">Categorias de dados pessoais</label>
        <div className="chip-row mb-16">
          {CATEGORIAS_DADOS.map(c => (
            <button key={c} type="button" onClick={() => alternar('categoriasDados', c)} className={`chip ${form.categoriasDados.includes(c) ? 'chip-active' : ''}`}>{c}</button>
          ))}
        </div>
        <div className="form-group mb-12">
          <label>Compartilhamento (com quem e como os dados saem do sistema)</label>
          <textarea rows={2} value={form.formasCompartilhamento} onChange={e => setForm({ ...form, formasCompartilhamento: e.target.value })} placeholder="Ex: envio mensal ao TCE via arquivo; consulta pela Receita via API" />
        </div>
        <label className="mb-8">Integrações com outros sistemas</label>
        <div className="chip-row mb-16">
          {outros.length === 0 && <span className="text-muted text-sm">Nenhum outro sistema cadastrado.</span>}
          {outros.map(s => (
            <button key={s.id} type="button" onClick={() => alternar('integracaoIds', s.id)} className={`chip ${form.integracaoIds.includes(s.id) ? 'chip-active' : ''}`}>{s.nome}</button>
          ))}
        </div>
        <div className="form-grid mb-12">
          <div className="form-group">
            <label>Hospedagem</label>
            <select value={form.tipoHospedagem} onChange={e => setForm({ ...form, tipoHospedagem: e.target.value })}>
              <option value="">Não informado</option>
              {Object.entries(HOSPEDAGEM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>País</label>
            <input value={form.paisHospedagem} onChange={e => setForm({ ...form, paisHospedagem: e.target.value })} placeholder="Ex: Brasil" />
          </div>
        </div>
        <div className="form-group mb-12">
          <label>Região / local</label>
          <input value={form.regiaoHospedagem} onChange={e => setForm({ ...form, regiaoHospedagem: e.target.value })} placeholder="Ex: São Paulo (sa-east-1) ou Sala do CPD" />
        </div>
        {sistemaId && (
          <label className="mb-12" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} /> Sistema em uso
          </label>
        )}
        <div className="btn-row-spread mt-20">
          <button onClick={onVoltar} className="btn-secondary btn-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="btn-primary btn-sm">{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
