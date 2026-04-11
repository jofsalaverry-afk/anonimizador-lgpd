import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const [camaras, setCamaras] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ nome: '', cnpj: '', email: '', senha: '', plano: 'basico' });
  const [msg, setMsg] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const [c, s] = await Promise.all([
        axios.get(`${API}/admin/camaras`, { headers }),
        axios.get(`${API}/admin/stats`, { headers })
      ]);
      setCamaras(c.data);
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
    setCamaras([]);
    setStats(null);
  };

  const criarCamara = async (e) => {
    e.preventDefault();
    setMsg('');
    setErro('');
    try {
      await axios.post(`${API}/admin/camaras`, form, { headers });
      setForm({ nome: '', cnpj: '', email: '', senha: '', plano: 'basico' });
      setMsg('Câmara criada com sucesso');
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao criar câmara');
    }
  };

  const toggleCamara = async (id) => {
    try {
      await axios.patch(`${API}/admin/camaras/${id}/toggle`, {}, { headers });
      carregar();
    } catch (err) {
      setErro('Erro ao alterar status');
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
            <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = ''; window.location.reload(); }}>← Voltar para login normal</a>
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
              <div style={{ fontSize: 12, color: '#64748b' }}>Câmaras cadastradas</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{stats.camarasAtivas}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Ativas</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#475569' }}>{stats.totalDocumentos}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Documentos processados</div>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Criar nova câmara</h2>
          <form onSubmit={criarCamara}>
            <label>Nome</label>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Câmara Municipal de ..." required />
            <label>CNPJ</label>
            <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" required />
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contato@camara.gov.br" required />
            <label>Senha inicial</label>
            <input type="text" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="senha inicial" required />
            <label>Plano</label>
            <select value={form.plano} onChange={e => setForm({ ...form, plano: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
              <option value="basico">Básico</option>
              <option value="intermediario">Intermediário</option>
              <option value="premium">Premium</option>
            </select>
            {msg && <p style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>{msg}</p>}
            {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
            <button className="btn-primary" type="submit">Criar câmara</button>
          </form>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Câmaras cadastradas ({camaras.length})</h2>
          {camaras.length === 0 && <p style={{ fontSize: 13, color: '#64748b' }}>Nenhuma câmara cadastrada ainda.</p>}
          {camaras.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{c.email} · {c.cnpj} · {c.plano}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c._count?.documentos || 0} documentos processados</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: c.ativo ? '#dcfce7' : '#fee2e2', color: c.ativo ? '#16a34a' : '#dc2626' }}>
                  {c.ativo ? 'ativa' : 'inativa'}
                </span>
                <button onClick={() => toggleCamara(c.id)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>
                  {c.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
