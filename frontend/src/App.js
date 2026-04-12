import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from './config';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Admin from './components/Admin';
import SolicitarDireitos from './components/SolicitarDireitos';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  // usuario e mantido em memoria — modulosAtivos NUNCA vem de localStorage,
  // sempre e buscado fresco via /auth/me ao iniciar a aplicacao.
  const [usuario, setUsuario] = useState(null);
  const [loadingMe, setLoadingMe] = useState(!!localStorage.getItem('token'));
  const [rota, setRota] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setRota(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Ao inicializar (ou apos login), busca dados frescos do usuario
  // incluindo modulosAtivos atualizados do banco.
  useEffect(() => {
    if (!token) {
      setUsuario(null);
      setLoadingMe(false);
      return;
    }
    let cancelado = false;
    (async () => {
      setLoadingMe(true);
      try {
        const res = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelado) setUsuario(res.data);
      } catch (err) {
        if (!cancelado) {
          // Token invalido/expirado — desloga
          localStorage.removeItem('token');
          localStorage.removeItem('usuario');
          localStorage.removeItem('camara');
          setToken(null);
          setUsuario(null);
        }
      } finally {
        if (!cancelado) setLoadingMe(false);
      }
    })();
    return () => { cancelado = true; };
  }, [token]);

  const handleLogin = (novoToken) => {
    // Salva apenas o token. O usuario (incluindo modulosAtivos) sera
    // buscado automaticamente via /auth/me pelo useEffect acima.
    localStorage.setItem('token', novoToken);
    localStorage.removeItem('usuario');  // limpa chave legada
    localStorage.removeItem('camara');
    setToken(novoToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('camara');
    setToken(null);
    setUsuario(null);
  };

  if (rota === '#admin') return <Admin />;
  if (rota.startsWith('#solicitar-direitos')) {
    const orgId = rota.split('/')[1] || '';
    return <SolicitarDireitos organizacaoId={orgId} />;
  }
  if (!token) return <Login onLogin={handleLogin} />;

  // Enquanto busca /auth/me, mostra loading — evita renderizar Dashboard
  // com modulosAtivos stale de localStorage antigo.
  if (loadingMe || !usuario) {
    return (
      <div className="page-center">
        <div className="text-muted">Carregando...</div>
      </div>
    );
  }

  return <Dashboard usuario={usuario} token={token} onLogout={handleLogout} onTokenInvalido={handleLogout} />;
}

export default App;
