import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import IncidenteList from './IncidenteList';
import IncidenteForm from './IncidenteForm';
import IncidenteDetail from './IncidenteDetail';
import GeradorDocumentos from './GeradorDocumentos';
import { fmtDiaSP } from '../datas';

// Mapa das categorias do repositorio para rotulos legiveis. POLITICA e
// MODELO sao legados (mantidos para documentos antigos). TERMO e ADITIVO
// voltaram a ser categorias ativas (Etapa 3 PoC).
const CATEGORIA_LABEL = {
  POLITICA_PRIVACIDADE: 'Política de Privacidade',
  POLITICA_SEGURANCA: 'Política de Segurança',
  MODELO_DSAR: 'Modelo DSAR',
  CONTRATO: 'Contrato',
  ADITIVO: 'Aditivo contratual LGPD',
  TERMO: 'Termo',
  TERMO_USO: 'Termo de Uso',
  POLITICA: 'Políticas e procedimentos',
  MODELO: 'Modelos e formulários',
  OUTRO: 'Outros'
};

// Categorias oferecidas no upload (sem os legados).
const CATEGORIAS_UPLOAD = ['POLITICA_PRIVACIDADE', 'POLITICA_SEGURANCA', 'POLITICA', 'MODELO_DSAR', 'MODELO', 'CONTRATO', 'ADITIVO', 'TERMO', 'TERMO_USO', 'OUTRO'];

// Ordem de exibicao das categorias nos cards agrupados.
const ORDEM_CATEGORIA = [
  'POLITICA_PRIVACIDADE', 'POLITICA_SEGURANCA', 'MODELO_DSAR',
  'POLITICA', 'MODELO', 'CONTRATO', 'ADITIVO', 'TERMO', 'TERMO_USO', 'OUTRO'
];

// Upload pelo DPO (rota /repositorio/upload ja existia, sem tela no cliente).
function UploadDocumento({ token, onEnviado }) {
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'ADITIVO' });
  const [arquivo, setArquivo] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!form.titulo.trim() || !arquivo) return setErro('Informe o título e escolha o arquivo (PDF ou DOCX)');
    setEnviando(true);
    setErro('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('arquivo', arquivo);
      await axios.post(`${API}/repositorio/upload`, fd, { headers: { Authorization: `Bearer ${token}` } });
      setForm({ titulo: '', descricao: '', categoria: 'ADITIVO' });
      setArquivo(null);
      setAberto(false);
      onEnviado();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao enviar documento');
    }
    setEnviando(false);
  };

  if (!aberto) return <button className="btn-primary btn-sm mb-16" onClick={() => setAberto(true)}>+ Enviar documento</button>;
  return (
    <div className="card mb-16">
      <div className="card-header">Enviar documento</div>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      <div className="form-grid mb-8">
        <div className="form-group">
          <label>Título</label>
          <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Categoria</label>
          <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS_UPLOAD.map(c => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
        </div>
      </div>
      <label>Descrição (opcional)</label>
      <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
      <input type="file" accept=".pdf,.docx,.doc" onChange={e => setArquivo(e.target.files?.[0] || null)} className="mb-8" />
      <div className="btn-row">
        <button className="btn-primary btn-sm" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando...' : 'Enviar'}</button>
        <button className="btn-secondary btn-sm" onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </div>
  );
}

function iconePorMime(mime) {
  if (!mime) return '📄';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('word')) return '📘';
  return '📄';
}

function RepositorioArquivos({ token, usuario }) {
  const ehDpo = usuario?.perfil === 'ENCARREGADO_LGPD';
  const podeGerar = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const res = await axios.get(`${API}/repositorio/documentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocs(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar documentos');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const baixar = async (doc) => {
    try {
      const res = await axios.get(`${API}/repositorio/documentos/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nomeArquivo || `${doc.titulo}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao baixar arquivo');
    }
  };

  if (loading) return <p className="text-muted">Carregando...</p>;
  if (erro) return <div className="alert-error">{erro}</div>;
  if (!docs.length) {
    return (
      <div className="card">
        {ehDpo && <UploadDocumento token={token} onEnviado={carregar} />}
        {podeGerar && <GeradorDocumentos token={token} onGerado={carregar} />}
        <p className="text-muted">Nenhum documento disponível ainda. Os documentos são publicados pelo administrador do sistema.</p>
      </div>
    );
  }

  // Agrupa por categoria (tipo)
  const grupos = {};
  for (const d of docs) {
    (grupos[d.tipo] = grupos[d.tipo] || []).push(d);
  }
  const categoriasComDocs = ORDEM_CATEGORIA.filter(c => grupos[c] && grupos[c].length);

  return (
    <div>
      <div className="card mb-16">
        <p className="text-sm" style={{ color: '#64748b' }}>
          Documentos institucionais e modelos disponibilizados pela sua organização. Clique em qualquer card para baixar.
        </p>
      </div>
      {ehDpo && <UploadDocumento token={token} onEnviado={carregar} />}
      {podeGerar && <GeradorDocumentos token={token} onGerado={carregar} />}

      {categoriasComDocs.map(cat => (
        <div key={cat} className="card mb-16">
          <h3 className="card-header">{CATEGORIA_LABEL[cat] || cat}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {grupos[cat].map(d => (
              <div
                key={d.id}
                style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{iconePorMime(d.mimetype)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.titulo}</div>
                    <div className="text-muted text-xs">
                      {fmtDiaSP(d.criadoEm)}
                      {d.tamanhoBytes ? ` · ${(d.tamanhoBytes / 1024).toFixed(0)} KB` : ''}
                    </div>
                  </div>
                </div>
                {d.descricao && (
                  <div className="text-sm" style={{ color: '#475569' }}>{d.descricao}</div>
                )}
                {d.mimetype ? (
                  <button
                    type="button"
                    onClick={() => baixar(d)}
                    className="btn-primary acao-leitura btn-sm"
                    style={{ marginTop: 'auto' }}
                  >
                    ⬇ Baixar
                  </button>
                ) : (
                  <span className="text-muted text-xs" style={{ marginTop: 'auto' }}>Documento de texto (sem arquivo)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Repositorio({ token, usuario, subpagina, filtroInicial }) {
  const [tela, setTela] = useState('list');
  const [itemId, setItemId] = useState(null);

  useEffect(() => {
    setTela('list');
    setItemId(null);
  }, [subpagina]);

  if (subpagina === 'documentos') {
    return <RepositorioArquivos token={token} usuario={usuario} />;
  }

  if (subpagina === 'incidentes') {
    if (tela === 'novo') {
      return <IncidenteForm token={token} onVoltar={() => setTela('list')} />;
    }
    // "Ver" abre a leitura; "Editar" e um botao separado (item 25)
    if (tela === 'ver') {
      return <IncidenteDetail token={token} incidenteId={itemId} onVoltar={() => setTela('list')} onEditar={() => setTela('editar')} />;
    }
    if (tela === 'editar') {
      return <IncidenteForm token={token} incidenteId={itemId} onVoltar={() => setTela('ver')} />;
    }
    return (
      <IncidenteList
        token={token}
        filtroInicial={filtroInicial}
        onNovo={() => setTela('novo')}
        onVer={(id) => { setItemId(id); setTela('ver'); }}
        onEditar={(id) => { setItemId(id); setTela('editar'); }}
      />
    );
  }

  return <p className="text-muted">Selecione uma subpágina do repositório.</p>;
}
