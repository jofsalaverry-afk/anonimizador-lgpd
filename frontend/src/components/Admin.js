import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

const PERFIL_LABEL = {
  ENCARREGADO_LGPD: 'DPO',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  AUDITOR: 'Auditor',
  TREINANDO: 'Treinando'
};

const MODULOS_DISPONIVEIS = [
  { id: 'anonimizador', nome: 'Anonimizador' },
  { id: 'ropa', nome: 'ROPA' },
  { id: 'dsar', nome: 'DSAR' },
  { id: 'repositorio', nome: 'Repositorio' },
  { id: 'treinamento', nome: 'Treinamento' },
  { id: 'checklist', nome: 'Checklist' }
];

const CATEGORIAS_REPO = [
  { value: 'POLITICA_PRIVACIDADE', label: 'Politica de privacidade' },
  { value: 'POLITICA_SEGURANCA', label: 'Politica de seguranca' },
  { value: 'MODELO_DSAR', label: 'Modelo DSAR' },
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'TERMO_USO', label: 'Termo de uso' },
  { value: 'OUTRO', label: 'Outro' }
];

const CATEGORIA_LABEL = Object.fromEntries(CATEGORIAS_REPO.map(c => [c.value, c.label]));

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const [orgs, setOrgs] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ nome: '', cnpj: '', email: '', senha: '', plano: 'basico' });
  const [msg, setMsg] = useState('');
  const [expandida, setExpandida] = useState(null);
  const [trilhas, setTrilhas] = useState([]);
  const [edicaoModulo, setEdicaoModulo] = useState({});

  // Repositorio de documentos — estado
  const [repoOrg, setRepoOrg] = useState('');
  const [repoDocs, setRepoDocs] = useState([]);
  const [repoForm, setRepoForm] = useState({ titulo: '', categoria: '', descricao: '' });
  const [repoArquivo, setRepoArquivo] = useState(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoMsg, setRepoMsg] = useState('');
  const [repoErro, setRepoErro] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const [c, s, t] = await Promise.all([
        axios.get(`${API}/admin/camaras`, { headers }),
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/treinamento/trilhas`, { headers })
      ]);
      setOrgs(c.data);
      setStats(s.data);
      setTrilhas(t.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('admin_token');
        setToken('');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const salvarModulo = async (trilhaId, moduloId) => {
    const key = `${trilhaId}:${moduloId}`;
    const edit = edicaoModulo[key];
    if (!edit || !edit.youtubeId) return;
    try {
      await axios.put(
        `${API}/admin/treinamento/trilhas/${trilhaId}/modulos/${moduloId}`,
        { youtubeId: edit.youtubeId, titulo: edit.titulo || null },
        { headers }
      );
      setEdicaoModulo(prev => {
        const novo = { ...prev };
        delete novo[key];
        return novo;
      });
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao salvar modulo');
    }
  };

  // Repositorio: carrega docs quando uma org e selecionada no dropdown.
  const carregarRepoDocs = useCallback(async (orgId) => {
    if (!orgId || !token) { setRepoDocs([]); return; }
    try {
      const res = await axios.get(`${API}/admin/repositorio`, { headers, params: { organizacaoId: orgId } });
      setRepoDocs(res.data);
    } catch (err) {
      setRepoErro(err.response?.data?.erro || 'Erro ao carregar documentos');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { carregarRepoDocs(repoOrg); }, [repoOrg, carregarRepoDocs]);

  const uploadRepoDoc = async (e) => {
    e.preventDefault();
    setRepoMsg('');
    setRepoErro('');
    if (!repoOrg || !repoArquivo || !repoForm.titulo || !repoForm.categoria) {
      return setRepoErro('Preencha camara, titulo, categoria e selecione um arquivo');
    }
    setRepoLoading(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', repoArquivo);
      fd.append('titulo', repoForm.titulo);
      fd.append('categoria', repoForm.categoria);
      fd.append('descricao', repoForm.descricao);
      fd.append('organizacaoId', repoOrg);
      await axios.post(`${API}/admin/repositorio/upload`, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' }
      });
      setRepoForm({ titulo: '', categoria: '', descricao: '' });
      setRepoArquivo(null);
      setRepoMsg('Documento enviado');
      carregarRepoDocs(repoOrg);
    } catch (err) {
      setRepoErro(err.response?.data?.erro || 'Erro ao subir arquivo');
    }
    setRepoLoading(false);
  };

  const excluirRepoDoc = async (id) => {
    if (!window.confirm('Excluir este documento?')) return;
    try {
      await axios.delete(`${API}/admin/repositorio/${id}`, { headers });
      carregarRepoDocs(repoOrg);
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao excluir');
    }
  };

  useEffect(() => { carregar(); }, [carregar]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/admin/login`, { email, senha });
      localStorage.setItem('admin_token', res.data.token);
      setToken(res.data.token);
      setEmail('');
      setSenha('');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao fazer login');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken('');
    setOrgs([]);
    setStats(null);
  };

  const criarOrg = async (e) => {
    e.preventDefault();
    setMsg('');
    setErro('');
    try {
      await axios.post(`${API}/admin/camaras`, form, { headers });
      setForm({ nome: '', cnpj: '', email: '', senha: '', plano: 'basico' });
      setMsg('Organizacao criada com sucesso');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao criar organizacao');
    }
  };

  const toggleOrg = async (id) => {
    try {
      await axios.patch(`${API}/admin/camaras/${id}/toggle`, {}, { headers });
      carregar();
    } catch (err) {
      setErro('Erro ao alterar status');
    }
  };

  const toggleModulo = async (orgId, modulo, ativo, modulosAtuais) => {
    const novos = ativo
      ? modulosAtuais.filter(m => m !== modulo)
      : [...modulosAtuais, modulo];
    try {
      await axios.patch(`${API}/admin/camaras/${orgId}/modulos`, { modulosAtivos: novos }, { headers });
      carregar();
    } catch (err) {
      setErro('Erro ao alterar modulos');
    }
  };

  if (!token) {
    return (
      <div className="page-center">
        <div className="card login-card">
          <div className="login-header">
            <div className="login-icon">🛡️</div>
            <h1 className="login-title">Admin — Complidata</h1>
            <p className="login-subtitle">Acesso restrito</p>
          </div>
          <form onSubmit={handleLogin}>
            <label>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label>Senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required />
            {erro && <p className="text-error mb-12">{erro}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-muted text-sm mt-16 text-center">
            <button
              type="button"
              onClick={() => { window.location.hash = ''; window.location.reload(); }}
              className="link-back"
            >← Voltar para login normal</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="header">
        <div className="header-brand">
          <span className="header-brand-icon">🛡️</span>
          <span className="header-brand-text">Admin — Complidata</span>
        </div>
        <button onClick={handleLogout} className="btn-logout">Sair</button>
      </header>

      <div className="content-body">
        {stats && (
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-bar stat-card-bar-blue" />
              <div className="stat-card-body">
                <div className="stat-card-icon stat-card-icon-blue">🏛️</div>
                <div>
                  <div className="stat-value">{stats.totalCamaras}</div>
                  <div className="stat-label">Organizacoes</div>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-bar stat-card-bar-green" />
              <div className="stat-card-body">
                <div className="stat-card-icon stat-card-icon-green">✓</div>
                <div>
                  <div className="stat-value">{stats.camarasAtivas}</div>
                  <div className="stat-label">Ativas</div>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-bar stat-card-bar-purple" />
              <div className="stat-card-body">
                <div className="stat-card-icon stat-card-icon-purple">👤</div>
                <div>
                  <div className="stat-value">{stats.totalUsuarios}</div>
                  <div className="stat-label">Usuarios</div>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-bar stat-card-bar-slate" />
              <div className="stat-card-body">
                <div className="stat-card-icon stat-card-icon-slate">📄</div>
                <div>
                  <div className="stat-value">{stats.totalDocumentos}</div>
                  <div className="stat-label">Documentos</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card mb-24">
          <h2 className="card-header">Criar nova organizacao</h2>
          <form onSubmit={criarOrg}>
            <label>Nome</label>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Camara Municipal de ..." required />
            <label>CNPJ</label>
            <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" required />
            <label>E-mail do primeiro usuario (Gestor)</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contato@camara.gov.br" required />
            <label>Senha inicial</label>
            <input type="text" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="senha inicial" required />
            <label>Plano</label>
            <select value={form.plano} onChange={e => setForm({ ...form, plano: e.target.value })}>
              <option value="basico">Basico</option>
              <option value="intermediario">Intermediario</option>
              <option value="premium">Premium</option>
            </select>
            {msg && <p className="text-success mb-12">{msg}</p>}
            {erro && <p className="text-error mb-12">{erro}</p>}
            <button className="btn-primary" type="submit">Criar organizacao</button>
          </form>
        </div>

        <div className="card">
          <h2 className="card-header">Organizacoes ({orgs.length})</h2>
          {orgs.length === 0 && <p className="text-muted text-sm">Nenhuma organizacao cadastrada.</p>}
          {orgs.map(o => (
            <div key={o.id} className="org-row">
              <div className="flex-between">
                <div>
                  <div className="comp-name text-sm">{o.nome}</div>
                  <div className="text-muted text-sm">{o.cnpj} · {o.plano} · {o._count?.usuarios || 0} usuarios · {o._count?.documentos || 0} docs</div>
                </div>
                <div className="flex-center gap-8">
                  <span className={o.ativo ? 'badge badge-success' : 'badge badge-danger'}>
                    {o.ativo ? 'ativa' : 'inativa'}
                  </span>
                  <button onClick={() => setExpandida(expandida === o.id ? null : o.id)} className="btn-secondary btn-sm">
                    {expandida === o.id ? 'Fechar' : 'Detalhes'}
                  </button>
                  <button onClick={() => toggleOrg(o.id)} className="btn-secondary btn-sm">
                    {o.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>

              {expandida === o.id && (
                <div className="org-expand">
                  <div className="mb-12">
                    <div className="detail-label mb-8">Modulos</div>
                    <div className="chip-row">
                      {MODULOS_DISPONIVEIS.map(m => {
                        const ativo = (o.modulosAtivos || []).includes(m.id);
                        return (
                          <button key={m.id} onClick={() => toggleModulo(o.id, m.id, ativo, o.modulosAtivos || [])}
                            className={ativo ? 'chip chip-active' : 'chip'}>
                            {ativo ? '● ' : '○ '}{m.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="detail-label mb-8">Usuarios</div>
                    {(o.usuarios || []).map(u => (
                      <div key={u.id} className="user-row">
                        <div className="flex-center gap-8">
                          <span className="text-sm">{u.email}</span>
                          <span className="badge badge-purple">{PERFIL_LABEL[u.perfil] || u.perfil}</span>
                        </div>
                        <span className={u.ativo ? 'text-success text-sm' : 'text-error text-sm'}>{u.ativo ? 'ativo' : 'inativo'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ========== Treinamento ========== */}
        <div className="card mt-20">
          <h2 className="card-header">Treinamentos — curadoria de videos</h2>
          <p className="text-muted mb-16">Cole o ID ou a URL completa do YouTube para cada modulo. Os videos sao compartilhados entre todas as organizacoes com o modulo treinamento ativo.</p>

          {trilhas.length === 0 && <p className="text-muted">Carregando trilhas...</p>}

          {trilhas.map(trilha => (
            <div key={trilha.id} className="org-expand mb-16">
              <div className="flex-center gap-8 mb-12">
                <span className="text-sm" style={{ fontWeight: 700 }}>{trilha.titulo}</span>
                <span className="badge badge-info">{trilha.nivel}</span>
              </div>

              {trilha.modulos.map(modulo => {
                const key = `${trilha.id}:${modulo.moduloId}`;
                const edit = edicaoModulo[key] || {};
                const valorInput = edit.youtubeId !== undefined ? edit.youtubeId : modulo.youtubeId;
                return (
                  <div key={modulo.moduloId} className="user-row" style={{ display: 'block', padding: '12px 0' }}>
                    <div className="flex-center gap-8 mb-8">
                      <img
                        src={`https://img.youtube.com/vi/${modulo.youtubeId}/mqdefault.jpg`}
                        alt=""
                        style={{ width: 80, height: 45, borderRadius: 6, objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div className="text-sm" style={{ fontWeight: 600 }}>{modulo.titulo}</div>
                        <div className="text-muted text-xs">{modulo.duracaoMin} min · ID atual: {modulo.youtubeId}</div>
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <input
                        type="text"
                        placeholder="Cole o ID ou URL do YouTube"
                        value={valorInput}
                        onChange={e => setEdicaoModulo(prev => ({
                          ...prev,
                          [key]: { ...prev[key], youtubeId: e.target.value }
                        }))}
                        style={{ marginBottom: 0, flex: 1 }}
                      />
                      <button
                        onClick={() => salvarModulo(trilha.id, modulo.moduloId)}
                        className="btn-primary btn-sm"
                        disabled={!edit.youtubeId || edit.youtubeId === modulo.youtubeId}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ========== Repositorio de Documentos (admin cross-org) ========== */}
        <div className="card mt-16">
          <h2 className="card-header">Repositorio de Documentos</h2>
          <p className="text-sm mb-16" style={{ color: '#64748b' }}>
            Suba arquivos (PDF ou DOCX ate 20MB) que ficarao disponiveis para download pelos usuarios da camara selecionada.
          </p>

          <label>Camara</label>
          <select value={repoOrg} onChange={e => setRepoOrg(e.target.value)}>
            <option value="">Selecione uma camara...</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>

          {repoOrg && (
            <>
              <form onSubmit={uploadRepoDoc} className="mt-16">
                <div className="grid-2">
                  <div>
                    <label>Titulo *</label>
                    <input
                      value={repoForm.titulo}
                      onChange={e => setRepoForm({ ...repoForm, titulo: e.target.value })}
                      maxLength={200}
                      required
                    />
                  </div>
                  <div>
                    <label>Categoria *</label>
                    <select
                      value={repoForm.categoria}
                      onChange={e => setRepoForm({ ...repoForm, categoria: e.target.value })}
                      required
                    >
                      <option value="">Selecione...</option>
                      {CATEGORIAS_REPO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <label>Descricao</label>
                <textarea
                  value={repoForm.descricao}
                  onChange={e => setRepoForm({ ...repoForm, descricao: e.target.value })}
                  rows={2}
                  maxLength={500}
                  placeholder="Descricao curta mostrada no card"
                />
                <label>Arquivo (PDF ou DOCX) *</label>
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={e => setRepoArquivo(e.target.files?.[0] || null)}
                  required
                />
                {repoErro && <div className="alert-error mt-8">{repoErro}</div>}
                {repoMsg && <div className="alert-success mt-8">{repoMsg}</div>}
                <button className="btn-primary mt-8" type="submit" disabled={repoLoading}>
                  {repoLoading ? 'Enviando...' : 'Enviar documento'}
                </button>
              </form>

              <div className="mt-16">
                <div className="detail-label mb-8">Documentos desta camara ({repoDocs.length})</div>
                {repoDocs.length === 0 ? (
                  <div className="text-muted text-sm">Nenhum documento enviado ainda.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {repoDocs.map(d => (
                      <li
                        key={d.id}
                        style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <span style={{ fontSize: 24 }}>{d.mimetype === 'application/pdf' ? '📕' : '📘'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{d.titulo}</div>
                          <div className="text-muted text-xs">
                            {CATEGORIA_LABEL[d.tipo] || d.tipo} · {d.nomeArquivo} · {(d.tamanhoBytes / 1024).toFixed(0)} KB
                          </div>
                          {d.descricao && <div className="text-sm" style={{ color: '#475569' }}>{d.descricao}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => excluirRepoDoc(d.id)}
                          className="btn-sm"
                          style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}
                        >
                          Excluir
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
