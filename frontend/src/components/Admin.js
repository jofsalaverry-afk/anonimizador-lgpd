import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CampoSenha from './CampoSenha';

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
  { id: 'repositorio', nome: 'Repositório' },
  { id: 'treinamento', nome: 'Treinamento' },
  { id: 'checklist', nome: 'Checklist' },
  { id: 'pesquisa', nome: 'Pesquisa de Satisfação' },
  { id: 'inventario', nome: 'Inventário de Sistemas' },
  { id: 'terceiros', nome: 'Terceiros/Operadores' }
];

const CATEGORIAS_REPO = [
  { value: 'POLITICA_PRIVACIDADE', label: 'Política de privacidade' },
  { value: 'POLITICA_SEGURANCA', label: 'Política de segurança' },
  { value: 'MODELO_DSAR', label: 'Modelo DSAR' },
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'TERMO_USO', label: 'Termo de uso' },
  { value: 'TERMO', label: 'Termo (confidencialidade, consentimento etc.)' },
  { value: 'POLITICA', label: 'Políticas e procedimentos' },
  { value: 'MODELO', label: 'Modelos e formulários' },
  { value: 'ADITIVO', label: 'Aditivo contratual LGPD' },
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
  const [form, setForm] = useState({ nome: '', cnpj: '', nomeGestor: '', email: '', senha: '', plano: 'basico' });
  const [msg, setMsg] = useState('');
  const [expandida, setExpandida] = useState(null);
  const [linkCopiadoId, setLinkCopiadoId] = useState(null);
  const [trilhas, setTrilhas] = useState([]);
  const [edicaoModulo, setEdicaoModulo] = useState({});
  const [orgParaExcluir, setOrgParaExcluir] = useState(null);
  const [excluindoOrg, setExcluindoOrg] = useState(false);

  // Repositorio de documentos — estado
  const [repoOrg, setRepoOrg] = useState('');
  const [repoDocs, setRepoDocs] = useState([]);
  const [repoForm, setRepoForm] = useState({ titulo: '', categoria: '', descricao: '' });
  const [repoArquivo, setRepoArquivo] = useState(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoMsg, setRepoMsg] = useState('');
  const [repoErro, setRepoErro] = useState('');
  // Novo usuario por organizacao: { [orgId]: { nome, email, senha, perfil } }
  const [novoUsuario, setNovoUsuario] = useState({});

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
    if (!edit || edit.linkComplementar === undefined) return;
    try {
      await axios.put(
        `${API}/admin/treinamento/trilhas/${trilhaId}/modulos/${moduloId}`,
        { linkComplementar: edit.linkComplementar.trim() },
        { headers }
      );
      setEdicaoModulo(prev => {
        const novo = { ...prev };
        delete novo[key];
        return novo;
      });
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao salvar módulo');
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
      return setRepoErro('Preencha câmara, título, categoria e selecione um arquivo');
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

  const criarUsuario = async (orgId) => {
    const dados = novoUsuario[orgId] || {};
    try {
      await axios.post(`${API}/admin/camaras/${orgId}/usuarios`, { perfil: 'OPERADOR', ...dados }, { headers });
      setNovoUsuario(n => ({ ...n, [orgId]: undefined }));
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao criar usuário');
    }
  };

  const salvarSlug = async (org) => {
    const novo = window.prompt('Endereço público (slug): só letras minúsculas, números e hífens. Atenção: trocar quebra links já divulgados.', org.slug || '');
    if (novo === null) return;
    try {
      await axios.patch(`${API}/admin/camaras/${org.id}/slug`, { slug: novo }, { headers });
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao salvar slug');
    }
  };

  const mudarPerfil = async (id, perfil) => {
    try {
      await axios.patch(`${API}/admin/usuarios/${id}/perfil`, { perfil }, { headers });
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao alterar perfil');
    }
  };

  // Corrige o nome da pessoa (ex.: Gestor criado com o nome da camara)
  const editarNome = async (u) => {
    const nome = window.prompt('Nome da pessoa', u.nome || '');
    if (nome === null || !nome.trim() || nome.trim() === u.nome) return;
    try {
      await axios.patch(`${API}/admin/usuarios/${u.id}/nome`, { nome: nome.trim() }, { headers });
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao alterar nome');
    }
  };

  const zerarMfaAdmin = async (u) => {
    const motivo = window.prompt(`Zerar o MFA de ${u.nome || u.email}? Informe o motivo (obrigatório):`, '');
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Motivo obrigatório. Nada foi alterado.'); return; }
    try {
      const r = await axios.post(`${API}/admin/usuarios/${u.id}/mfa/zerar`, { motivo: motivo.trim() }, { headers });
      alert(r.data?.mensagem || 'MFA zerado.');
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao zerar MFA');
    }
  };

  const toggleUsuario = async (id) => {
    try {
      await axios.patch(`${API}/admin/usuarios/${id}/toggle`, {}, { headers });
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao atualizar usuário');
    }
  };

  const excluirUsuario = async (email, id) => {
    if (!window.confirm(`Excluir o usuário ${email}? Esta ação preserva o histórico mas remove o acesso permanentemente.`)) return;
    try {
      await axios.delete(`${API}/admin/usuarios/${id}`, { headers });
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao excluir usuário');
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
      setForm({ nome: '', cnpj: '', nomeGestor: '', email: '', senha: '', plano: 'basico' });
      setMsg('Organização criada com sucesso');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao criar organização');
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

  const excluirOrg = async (id) => {
    setExcluindoOrg(true);
    try {
      await axios.delete(`${API}/admin/camaras/${id}/excluir`, { headers });
      setOrgParaExcluir(null);
      carregar();
    } catch (err) {
      const r = err.response?.data;
      alert(`${r?.erro || 'Erro ao excluir organização'}${r?.detalhes ? `\n\n${r.detalhes}` : ''}`);
    } finally {
      setExcluindoOrg(false);
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
      setErro('Erro ao alterar módulos');
    }
  };

  const toggleMfaObrigatorio = async (org) => {
    const novo = !org.mfaObrigatorio;
    if (novo) {
      const semMfa = (org.usuarios || []).filter(u => u.ativo && !u.mfaAtivo).length;
      const aviso = semMfa > 0
        ? `${semMfa} usuário(s) ativo(s) ainda não têm MFA e terão que configurar no próximo login. Continuar?`
        : 'Exigir MFA de todos os usuários desta organização?';
      if (!window.confirm(aviso)) return;
    }
    try {
      await axios.patch(`${API}/admin/camaras/${org.id}/mfa-obrigatorio`, { mfaObrigatorio: novo }, { headers });
      carregar();
    } catch (err) {
      setErro('Erro ao alterar exigência de MFA');
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
            <CampoSenha value={senha} onChange={e => setSenha(e.target.value)} required />
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
                  <div className="stat-label">Organizações</div>
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
                  <div className="stat-label">Usuários</div>
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
          <h2 className="card-header">Criar nova organização</h2>
          <form onSubmit={criarOrg}>
            <label>Nome da organização</label>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Câmara Municipal de ..." required />
            <label>CNPJ</label>
            <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" required />
            <label>Nome da pessoa do primeiro usuário (Gestor)</label>
            <input value={form.nomeGestor} onChange={e => setForm({ ...form, nomeGestor: e.target.value })} placeholder="Nome e sobrenome de quem vai usar a conta" required />
            <label>E-mail do primeiro usuário (Gestor)</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contato@camara.gov.br" required />
            <label>Senha inicial</label>
            <input type="text" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="senha inicial (mín. 10) — o Gestor troca no 1º acesso" required />
            <label>Plano</label>
            <select value={form.plano} onChange={e => setForm({ ...form, plano: e.target.value })}>
              <option value="basico">Básico</option>
              <option value="intermediario">Intermediário</option>
              <option value="premium">Premium</option>
            </select>
            {msg && <p className="text-success mb-12">{msg}</p>}
            {erro && <p className="text-error mb-12">{erro}</p>}
            <button className="btn-primary" type="submit">Criar organização</button>
          </form>
        </div>

        <div className="card">
          <h2 className="card-header">Organizações ({orgs.length})</h2>
          {orgs.length === 0 && <p className="text-muted text-sm">Nenhuma organização cadastrada.</p>}
          {orgs.map(o => (
            <div key={o.id} className="org-row">
              <div className="flex-between">
                <div>
                  <div className="comp-name text-sm">{o.nome}</div>
                  <div className="text-muted text-sm">{o.cnpj} · {o.plano} · {o._count?.usuarios || 0} usuários · {o._count?.documentos || 0} docs</div>
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
                  <button
                    type="button"
                    onClick={() => setOrgParaExcluir(o)}
                    className="btn-danger btn-sm"
                    title="Excluir permanentemente (apenas se não houver dados vinculados)"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {expandida === o.id && (
                <div className="org-expand">
                  <div className="mb-12">
                    <div className="detail-label mb-8">Endereço público (slug)</div>
                    <div className="flex-center gap-8">
                      <code className="text-sm">{o.slug || 'não definido — páginas públicas indisponíveis'}</code>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => salvarSlug(o)}>{o.slug ? 'Alterar' : 'Definir'}</button>
                      {o.slug && <a href={`${window.location.origin}/#transparencia/${o.slug}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Página de transparência</a>}
                    </div>
                  </div>
                  <div className="mb-12">
                    <div className="detail-label mb-8">Link público DSAR</div>
                    {(() => {
                      const linkDsar = `${window.location.origin}/#solicitar-direitos/${o.id}`;
                      const copiar = async () => {
                        try {
                          await navigator.clipboard.writeText(linkDsar);
                          setLinkCopiadoId(o.id);
                          setTimeout(() => setLinkCopiadoId(prev => prev === o.id ? null : prev), 2000);
                        } catch (e) {
                          window.prompt('Copie o link:', linkDsar);
                        }
                      };
                      return (
                        <div className="flex-center gap-8">
                          <input type="text" readOnly value={linkDsar} onFocus={e => e.target.select()} className="text-sm" style={{ flex: 1, minWidth: 0 }} />
                          <button type="button" onClick={copiar} className="btn-secondary btn-sm">
                            {linkCopiadoId === o.id ? 'Copiado!' : 'Copiar'}
                          </button>
                          <a href={linkDsar} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Abrir</a>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="mb-12">
                    <div className="detail-label mb-8">Módulos</div>
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

                  <div className="mb-12">
                    <div className="detail-label mb-8">Segurança</div>
                    <label className="flex-center gap-8" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!o.mfaObrigatorio} onChange={() => toggleMfaObrigatorio(o)} />
                      <span className="text-sm">Exigir autenticação em 2 etapas (MFA) no login</span>
                    </label>
                  </div>

                  <div>
                    <div className="detail-label mb-8">Usuários</div>
                    {(o.usuarios || []).map(u => (
                      <div key={u.id} className="user-row">
                        <div className="flex-center gap-8">
                          <span className="text-sm">{u.nome ? `${u.nome} · ` : ''}{u.email}</span>
                          <select value={u.perfil} onChange={e => mudarPerfil(u.id, e.target.value)} style={{ width: 'auto', marginBottom: 0, fontSize: 12 }} title="Perfil de acesso">
                            {Object.entries(PERFIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <span className={u.ativo ? 'text-success text-sm' : 'text-error text-sm'}>{u.ativo ? 'ativo' : 'inativo'}</span>
                          <span className={u.mfaAtivo ? 'badge badge-success' : 'badge badge-muted'}>{u.mfaAtivo ? 'MFA ativo' : 'sem MFA'}</span>
                        </div>
                        <div className="flex-center gap-8">
                          <button type="button" onClick={() => editarNome(u)} className="btn-ghost" title="Corrigir o nome da pessoa">Editar nome</button>
                          {u.mfaAtivo && <button type="button" onClick={() => zerarMfaAdmin(u)} className="btn-ghost" title="Apaga o autenticador e encerra as sessões">Zerar MFA</button>}
                          <button
                            type="button"
                            onClick={() => toggleUsuario(u.id)}
                            className="btn-ghost"
                            title={u.ativo ? 'Desativar acesso' : 'Reativar acesso'}
                          >
                            {u.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => excluirUsuario(u.email, u.id)}
                            className="btn-danger btn-sm"
                            title="Remover acesso permanentemente (mantém histórico)"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                    {novoUsuario[o.id] ? (
                      <div className="mt-8" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input placeholder="Nome" value={novoUsuario[o.id].nome || ''} style={{ width: 160, marginBottom: 0 }}
                          onChange={e => setNovoUsuario(n => ({ ...n, [o.id]: { ...n[o.id], nome: e.target.value } }))} />
                        <input placeholder="E-mail" type="email" value={novoUsuario[o.id].email || ''} style={{ width: 200, marginBottom: 0 }}
                          onChange={e => setNovoUsuario(n => ({ ...n, [o.id]: { ...n[o.id], email: e.target.value } }))} />
                        <input placeholder="Senha inicial (mín. 10)" type="password" autoComplete="new-password" value={novoUsuario[o.id].senha || ''} style={{ width: 170, marginBottom: 0 }}
                          onChange={e => setNovoUsuario(n => ({ ...n, [o.id]: { ...n[o.id], senha: e.target.value } }))} />
                        <select value={novoUsuario[o.id].perfil || 'OPERADOR'} style={{ width: 'auto', marginBottom: 0 }}
                          onChange={e => setNovoUsuario(n => ({ ...n, [o.id]: { ...n[o.id], perfil: e.target.value } }))}>
                          {Object.entries(PERFIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button type="button" className="btn-primary btn-sm" onClick={() => criarUsuario(o.id)}>Criar</button>
                        <button type="button" className="btn-ghost" onClick={() => setNovoUsuario(n => ({ ...n, [o.id]: undefined }))}>Cancelar</button>
                      </div>
                    ) : (
                      <button type="button" className="btn-ghost mt-8" onClick={() => setNovoUsuario(n => ({ ...n, [o.id]: { perfil: 'OPERADOR' } }))}>+ Novo usuário</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ========== Treinamento ========== */}
        <div className="card mt-20">
          <h2 className="card-header">Treinamentos — material complementar</h2>
          <p className="text-muted mb-16">Os módulos são textos curtos com questionário (iguais para todas as organizações). Aqui você pode indicar, por módulo, um link opcional para material complementar externo (https://), que aparece abaixo do texto. Deixe em branco para não exibir.</p>

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
                const atual = modulo.linkComplementar || '';
                const valorInput = edit.linkComplementar !== undefined ? edit.linkComplementar : atual;
                return (
                  <div key={modulo.moduloId} className="user-row" style={{ display: 'block', padding: '12px 0' }}>
                    <div className="text-sm" style={{ fontWeight: 600 }}>{modulo.titulo}</div>
                    <div className="text-muted text-xs mb-8">{modulo.duracaoMin} min · {modulo.quiz?.length || 0} perguntas · {atual ? 'com material complementar' : 'sem material complementar'}</div>
                    <div className="flex gap-8">
                      <input
                        type="url"
                        placeholder="https://... (opcional)"
                        value={valorInput}
                        onChange={e => setEdicaoModulo(prev => ({ ...prev, [key]: { ...prev[key], linkComplementar: e.target.value } }))}
                        style={{ marginBottom: 0, flex: 1 }}
                      />
                      <button
                        onClick={() => salvarModulo(trilha.id, modulo.moduloId)}
                        className="btn-primary btn-sm"
                        disabled={edit.linkComplementar === undefined || edit.linkComplementar.trim() === atual}
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
          <h2 className="card-header">Repositório de Documentos</h2>
          <p className="text-sm mb-16" style={{ color: '#64748b' }}>
            Suba arquivos (PDF ou DOCX até 20MB) que ficarão disponíveis para download pelos usuários da câmara selecionada.
          </p>

          <label>Câmara</label>
          <select value={repoOrg} onChange={e => setRepoOrg(e.target.value)}>
            <option value="">Selecione uma câmara...</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>

          {repoOrg && (
            <>
              <form onSubmit={uploadRepoDoc} className="mt-16">
                <div className="grid-2">
                  <div>
                    <label>Título *</label>
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
                <label>Descrição</label>
                <textarea
                  value={repoForm.descricao}
                  onChange={e => setRepoForm({ ...repoForm, descricao: e.target.value })}
                  rows={2}
                  maxLength={500}
                  placeholder="Descrição curta mostrada no card"
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
                <div className="detail-label mb-8">Documentos desta câmara ({repoDocs.length})</div>
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

      {orgParaExcluir && (
        <ConfirmDeleteModal
          org={orgParaExcluir}
          loading={excluindoOrg}
          onConfirm={excluirOrg}
          onCancel={() => setOrgParaExcluir(null)}
        />
      )}
    </div>
  );
}
