import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';

export default function Login({ onLogin }) {
  const [etapa, setEtapa] = useState('senha'); // 'senha' | 'mfa'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/auth/login`, { email, senha });
      // Se o usuario tem MFA ativo, o backend nao emite o token final:
      // ele devolve { mfaPendente, tempToken } e passamos para a etapa
      // de desafio MFA. O token real so vira depois do POST verificar.
      if (res.data.mfaPendente) {
        setTempToken(res.data.tempToken);
        setEtapa('mfa');
        setLoading(false);
        return;
      }
      onLogin(res.data.token);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao fazer login');
    }
    setLoading(false);
  };

  const verificarMfa = async (e) => {
    e.preventDefault();
    if (!codigo || codigo.length < 6) {
      return setErro('Informe o codigo de 6 digitos');
    }
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/auth/mfa/verificar`, { tempToken, codigo });
      onLogin(res.data.token);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Codigo invalido ou expirado');
    }
    setLoading(false);
  };

  if (etapa === 'mfa') {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🔐</div>
            <h1 className="login-title">Autenticacao em 2 etapas</h1>
            <p className="login-subtitle">Abra seu app autenticador e informe o codigo de 6 digitos</p>
          </div>
          <form onSubmit={verificarMfa}>
            <label>Codigo</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              required
              style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: 700 }}
            />
            {erro && <p className="text-error">{erro}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Verificar codigo'}
            </button>
          </form>
          <p className="text-center mt-16">
            <button
              type="button"
              onClick={() => { setEtapa('senha'); setCodigo(''); setTempToken(''); setErro(''); }}
              className="link-back"
            >
              ← Voltar
            </button>
          </p>
        </div>
      </div>
    );
  }

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
