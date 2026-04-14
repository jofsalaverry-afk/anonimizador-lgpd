import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

const TIPO_OPTIONS = [
  { value: 'POLITICA', label: 'Política' },
  { value: 'TERMO', label: 'Termo' },
  { value: 'ADITIVO', label: 'Aditivo' },
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'MODELO', label: 'Modelo' },
  { value: 'OUTRO', label: 'Outro' }
];

const STATUS_OPTIONS = [
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'APROVADO', label: 'Aprovado' },
  { value: 'PUBLICADO', label: 'Publicado' }
];

const ALL_TAGS = ['LGPD', 'LAI', 'Compliance', 'RH', 'TI', 'Financeiro', 'Outro'];

export default function DocumentoEditor({ token, documentoId, onVoltar }) {
  const [form, setForm] = useState({
    titulo: '', tipo: '', status: 'RASCUNHO', tags: [], conteudoMd: ''
  });
  const [loading, setLoading] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(!!documentoId);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const carregarDocumento = useCallback(async () => {
    if (!documentoId) return;
    try {
      const res = await axios.get(`${API}/repositorio/documentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const doc = res.data.find(d => d.id === documentoId);
      if (doc) {
        setForm({
          titulo: doc.titulo || '',
          tipo: doc.tipo || '',
          status: doc.status || 'RASCUNHO',
          tags: doc.tags || [],
          conteudoMd: doc.conteudoMd || ''
        });
      } else {
        setErro('Documento não encontrado');
      }
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar documento');
    }
    setLoadingDoc(false);
  }, [token, documentoId]);

  useEffect(() => { carregarDocumento(); }, [carregarDocumento]);

  const toggleTag = (tag) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const salvar = async () => {
    if (!form.titulo || !form.tipo) {
      return setErro('Preencha título e tipo');
    }
    setLoading(true);
    setErro('');
    try {
      if (documentoId) {
        await axios.put(`${API}/repositorio/documentos/${documentoId}`, form, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSucesso('Documento atualizado com sucesso');
      } else {
        await axios.post(`${API}/repositorio/documentos`, form, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSucesso('Documento criado com sucesso');
      }
      setTimeout(() => onVoltar(), 1200);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar documento');
    }
    setLoading(false);
  };

  if (loadingDoc) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="flex-center gap-8 mb-20">
        <button onClick={onVoltar} className="link-back">&#8592; Voltar</button>
        <h2 className="page-title">{documentoId ? 'Editar documento' : 'Novo documento'}</h2>
      </div>

      <div className="card">
        {erro && <div className="alert-error">{erro}</div>}
        {sucesso && <div className="alert-success">{sucesso}</div>}

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>Título</label>
            <input
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
              placeholder="Título do documento"
            />
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="">Selecione...</option>
              {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group mb-16">
          <label>Tags</label>
          <div className="chip-row">
            {ALL_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                className={form.tags.includes(tag) ? 'chip chip-active' : 'chip'}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group mb-16">
          <label>Conteúdo (Markdown)</label>
          <textarea
            value={form.conteudoMd}
            onChange={e => setForm({ ...form, conteudoMd: e.target.value })}
            rows={15}
            placeholder="Escreva o conteúdo do documento em Markdown..."
            style={{ fontFamily: 'monospace' }}
          />
        </div>

        <div className="btn-row-spread mt-20">
          <button onClick={onVoltar} className="btn-secondary btn-sm">Cancelar</button>
          <button onClick={salvar} disabled={loading} className="btn-primary btn-sm">
            {loading ? 'Salvando...' : (documentoId ? 'Atualizar documento' : 'Criar documento')}
          </button>
        </div>
      </div>
    </div>
  );
}
