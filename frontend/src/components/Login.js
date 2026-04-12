import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';

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
      onLogin(res.data.token, res.data.usuario);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao fazer login');
    }
    setLoading(false);
  };

  return (
    <div className="page-center">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🏛️</div>
          <h1 className="login-title">Anonimizador LGPD</h1>
          <p className="login-subtitle">Plataforma de conformidade para camaras municipais</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@camara.gov.br" required />
          <label>Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" required />
          {erro && <p className="text-error">{erro}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
