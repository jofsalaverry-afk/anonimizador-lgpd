import { useState } from 'react';
import axios from 'axios';

const API = 'http://localhost:3001';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/auth/login`, { email, senha });
      onLogin(res.data.token, res.data.camara);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao fazer login');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏛️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Anonimizador LGPD</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Sistema para câmaras municipais</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@camara.gov.br" required />
          <label>Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" required />
          {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}