import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import IncidenteList from './IncidenteList';
import IncidenteForm from './IncidenteForm';
import IncidenteDetail from './IncidenteDetail';
import GeradorDocumentos from './GeradorDocumentos';
import Historico from './Historico';
import { baixarArquivo } from './download';
import { fmtDiaSP, fmtDataHora } from '../datas';

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

// Envio de arquivo por Gestor ou DPO (Etapa 7b).
function UploadDocumento({ token, onEnviado }) {
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'ADITIVO' });
  const [arquivo, setArquivo] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setErro('');
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

// Card de um documento: baixar, historico (enviado/gerado/excluido, por quem
// e quando) e exclusao logica com motivo (Gestor/DPO).
function CardDocumento({ token, d, podeExcluir, onExcluido, onErro }) {
  const [verHistorico, setVerHistorico] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const excluir = async () => {
    onErro('');
    if (motivo.trim().length < 3) return onErro('Informe o motivo da exclusão');
    setSalvando(true);
    try {
      await axios.delete(`${API}/repositorio/documentos/${d.id}`, { headers: { Authorization: `Bearer ${token}` }, data: { motivo: motivo.trim() } });
      setExcluindo(false);
      onExcluido();
    } catch (err) {
      onErro(err.response?.data?.erro || 'Erro ao excluir documento');
    }
    setSalvando(false);
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
      {d.descricao && <div className="text-sm" style={{ color: '#475569' }}>{d.descricao}</div>}
      {d.excluidoEm && (
        <div className="text-xs" style={{ color: '#b91c1c' }}>Excluído em {fmtDataHora(d.excluidoEm)} — motivo: {d.motivoExclusao}</div>
      )}
      <div className="btn-row" style={{ marginTop: 'auto' }}>
        {d.mimetype ? (
          <button type="button" onClick={() => baixarArquivo(token, `/repositorio/documentos/${d.id}/download`, d.nomeArquivo || `${d.titulo}.pdf`).catch(e => onErro(e.message))} className="btn-primary acao-leitura btn-sm">
            ⬇ Baixar
          </button>
        ) : (
          <span className="text-muted text-xs">Documento de texto (sem arquivo)</span>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setVerHistorico(v => !v)}>{verHistorico ? 'Ocultar histórico' : 'Histórico'}</button>
        {podeExcluir && !d.excluidoEm && !excluindo && (
          <button type="button" className="btn-ghost btn-sm acao-escrita" style={{ color: '#b91c1c' }} onClick={() => { onErro(''); setExcluindo(true); }}>Excluir</button>
        )}
      </div>
      {excluindo && (
        <div className="mt-8">
          <label className="text-xs">Motivo da exclusão (obrigatório; o documento fica guardado e a exclusão vai para o histórico)</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: versão substituída pela v3" autoFocus />
          <div className="btn-row">
            <button type="button" className="btn-danger btn-sm" onClick={excluir} disabled={salvando}>{salvando ? 'Excluindo...' : 'Confirmar exclusão'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setExcluindo(false); setMotivo(''); }}>Cancelar</button>
          </div>
        </div>
      )}
      {verHistorico && <Historico token={token} entidade="DOCUMENTO" registroId={d.id} />}
    </div>
  );
}

function RepositorioArquivos({ token, usuario }) {
  // Etapa 7b: Gestor ou DPO enviam, geram e excluem (exclusao logica)
  const podeGerir = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);
  const [docs, setDocs] = useState([]);
  const [excluidos, setExcluidos] = useState(null);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState('');

  // Recarrega sem trocar a tela por "Carregando..." (o gerador e o envio
  // continuam montados e mostram a mensagem e os botoes de baixar).
  const carregar = useCallback(async () => {
    try {
      const h = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/repositorio/documentos`, { headers: h });
      setDocs(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar documentos');
    }
    setCarregado(true);
  }, [token]);

  const carregarExcluidos = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/repositorio/documentos?excluidos=1`, { headers: { Authorization: `Bearer ${token}` } });
      setExcluidos(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar documentos excluídos');
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const aposExcluir = () => { carregar(); if (excluidos) carregarExcluidos(); };

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
          Documentos institucionais e modelos da sua organização, organizados por categoria. Cada documento mostra o histórico de envio, geração e exclusão.
        </p>
      </div>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      {podeGerir && <UploadDocumento token={token} onEnviado={carregar} />}
      {podeGerir && <GeradorDocumentos token={token} onGerado={carregar} />}

      {!carregado ? <p className="text-muted">Carregando...</p> : docs.length === 0 && (
        <div className="card mb-16"><p className="text-muted">Nenhum documento no repositório ainda.</p></div>
      )}

      {categoriasComDocs.map(cat => (
        <div key={cat} className="card mb-16">
          <h3 className="card-header">{CATEGORIA_LABEL[cat] || cat}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {grupos[cat].map(d => (
              <CardDocumento key={d.id} token={token} d={d} podeExcluir={podeGerir} onExcluido={aposExcluir} onErro={setErro} />
            ))}
          </div>
        </div>
      ))}

      <div className="card mb-16">
        <div className="flex-between">
          <h3 className="card-header" style={{ marginBottom: 0 }}>Documentos excluídos</h3>
          <button className="btn-ghost btn-sm" onClick={() => (excluidos ? setExcluidos(null) : carregarExcluidos())}>{excluidos ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        {excluidos && (excluidos.length === 0 ? <p className="text-muted text-sm mt-8">Nenhum documento excluído.</p> : (
          <div className="mt-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {excluidos.map(d => <CardDocumento key={d.id} token={token} d={d} podeExcluir={false} onExcluido={aposExcluir} onErro={setErro} />)}
          </div>
        ))}
      </div>
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
