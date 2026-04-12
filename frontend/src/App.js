import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Admin from './components/Admin';
import SolicitarDireitos from './components/SolicitarDireitos';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(JSON.parse(localStorage.getItem('usuario') || 'null'));
  const [rota, setRota] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setRota(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleLogin = (token, usuario) => {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
    // Limpa chave legada
    localStorage.removeItem('camara');
    setToken(token);
    setUsuario(usuario);
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
  return <Dashboard usuario={usuario} token={token} onLogout={handleLogout} onTokenInvalido={handleLogout} />;
}

export default App;
