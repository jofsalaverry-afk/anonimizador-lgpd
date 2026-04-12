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

  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const [c, s] = await Promise.all([
        axios.get(`${API}/admin/camaras`, { headers }),
        axios.get(`${API}/admin/stats`, { headers })
      ]);
      setOrgs(c.data);
      setStats(s.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('admin_token');
        setToken('');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div className="card" style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Admin — Anonimizador LGPD</h1>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Acesso restrito</p>
          </div>
          <form onSubmit={handleLogin}>
            <label>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label>Senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required />
            {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 12, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => { window.location.hash = ''; window.location.reload(); }}
              style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit' }}
            >← Voltar para login normal</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Admin — Anonimizador LGPD</span>
        </div>
        <button onClick={handleLogout} style={{ fontSize: 13, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Sair</button>
      </header>

      <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 16px' }}>
        {stats && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1d4ed8' }}>{stats.totalCamaras}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Organizacoes</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{stats.camarasAtivas}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Ativas</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{stats.totalUsuarios}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Usuarios</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#475569' }}>{stats.totalDocumentos}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Documentos</div>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Criar nova organizacao</h2>
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
            <select value={form.plano} onChange={e => setForm({ ...form, plano: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
              <option value="basico">Basico</option>
              <option value="intermediario">Intermediario</option>
              <option value="premium">Premium</option>
            </select>
            {msg && <p style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>{msg}</p>}
            {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
            <button className="btn-primary" type="submit">Criar organizacao</button>
          </form>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Organizacoes ({orgs.length})</h2>
          {orgs.length === 0 && <p style={{ fontSize: 13, color: '#64748b' }}>Nenhuma organizacao cadastrada.</p>}
          {orgs.map(o => (
            <div key={o.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{o.nome}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{o.cnpj} · {o.plano} · {o._count?.usuarios || 0} usuarios · {o._count?.documentos || 0} docs</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: o.ativo ? '#dcfce7' : '#fee2e2', color: o.ativo ? '#16a34a' : '#dc2626' }}>
                    {o.ativo ? 'ativa' : 'inativa'}
                  </span>
                  <button onClick={() => setExpandida(expandida === o.id ? null : o.id)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>
                    {expandida === o.id ? 'Fechar' : 'Detalhes'}
                  </button>
                  <button onClick={() => toggleOrg(o.id)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>
                    {o.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>

              {expandida === o.id && (
                <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Modulos</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {MODULOS_DISPONIVEIS.map(m => {
                        const ativo = (o.modulosAtivos || []).includes(m.id);
                        return (
                          <button key={m.id} onClick={() => toggleModulo(o.id, m.id, ativo, o.modulosAtivos || [])}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid', cursor: 'pointer',
                              background: ativo ? '#dcfce7' : '#f1f5f9',
                              borderColor: ativo ? '#16a34a' : '#e2e8f0',
                              color: ativo ? '#16a34a' : '#94a3b8' }}>
                            {ativo ? '● ' : '○ '}{m.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Usuarios</div>
                    {(o.usuarios || []).map(u => (
                      <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                        <div>
                          <span style={{ fontSize: 12, color: '#1e293b' }}>{u.email}</span>
                          <span style={{ fontSize: 11, marginLeft: 8, padding: '1px 6px', borderRadius: 8, background: '#ede9fe', color: '#7c3aed' }}>{PERFIL_LABEL[u.perfil] || u.perfil}</span>
                        </div>
                        <span style={{ fontSize: 11, color: u.ativo ? '#16a34a' : '#dc2626' }}>{u.ativo ? 'ativo' : 'inativo'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
