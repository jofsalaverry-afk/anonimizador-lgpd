import { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [camara, setCamara] = useState(JSON.parse(localStorage.getItem('camara') || 'null'));

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

  if (!token) return <Login onLogin={handleLogin} />;
  return <Dashboard camara={camara} token={token} onLogout={handleLogout} />;
}

export default App;