import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Admin from './components/Admin';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [camara, setCamara] = useState(JSON.parse(localStorage.getItem('camara') || 'null'));
  const [rota, setRota] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setRota(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleLogin = (token, camara) => {
    localStorage.setItem('token', token);
    localStorage.setItem('camara', JSON.stringify(camara));
    setToken(token);
    setCamara(camara);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('camara');
    setToken(null);
    setCamara(null);
  };

  if (rota === '#admin') return <Admin />;
  if (!token) return <Login onLogin={handleLogin} />;
  return <Dashboard camara={camara} token={token} onLogout={handleLogout} onTokenInvalido={handleLogout} />;
}

export default App;
