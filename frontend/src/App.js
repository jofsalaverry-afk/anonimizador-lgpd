import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from './config';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Admin from './components/Admin';
import SolicitarDireitos from './components/SolicitarDireitos';
import PesquisaResultadosPublicos from './components/PesquisaResultadosPublicos';
import VerificarCertificado from './components/VerificarCertificado';
import TransparenciaPublica from './components/TransparenciaPublica';
import RedefinirSenha from './components/RedefinirSenha';

// Etapa 7a: chamadas sem sessao (login, MFA do login, senha) podem dar 401
// sem significar sessao encerrada.
const SEM_SESSAO = /\/auth\/(login|mfa\/verificar|senha\/(primeiro-acesso|esqueci|redefinir))$/;

function limparSessaoLocal() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  localStorage.removeItem('camara');
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  // usuario e mantido em memoria — modulosAtivos NUNCA vem de localStorage,
  // sempre e buscado fresco via /auth/me ao iniciar a aplicacao.
  const [usuario, setUsuario] = useState(null);
  const [loadingMe, setLoadingMe] = useState(!!localStorage.getItem('token'));
  const [rota, setRota] = useState(window.location.hash);
  const [avisoLogin, setAvisoLogin] = useState('');

  useEffect(() => {
    const onHash = () => setRota(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Etapa 7a: QUALQUER 401 numa chamada feita com a sessao do usuario
  // (expirada, encerrada no servidor, usuario ou camara desativados) leva de
  // volta ao login. O painel Admin usa outro token e nao entra aqui.
  useEffect(() => {
    const encerrar = () => {
      if (!localStorage.getItem('token')) return;
      limparSessaoLocal();
      setToken(null);
      setUsuario(null);
      setAvisoLogin('Sua sessão foi encerrada. Entre novamente.');
    };
    const id = axios.interceptors.response.use(r => r, err => {
      const cfg = err.config || {};
      const auth = cfg.headers?.Authorization || cfg.headers?.authorization || '';
      const sessaoAtual = localStorage.getItem('token');
      if (err.response?.status === 401 && sessaoAtual && auth === `Bearer ${sessaoAtual}` && !SEM_SESSAO.test((cfg.url || '').split('?')[0])) {
        encerrar();
      }
      return Promise.reject(err);
    });
    // chamadas com fetch (ex.: central de alertas) avisam por evento
    window.addEventListener('complidata:sessao-encerrada', encerrar);
    // troca de senha devolve sessao nova
    const novoToken = (e) => { if (e.detail) { localStorage.setItem('token', e.detail); setToken(e.detail); } };
    window.addEventListener('complidata:token-novo', novoToken);
    return () => {
      axios.interceptors.response.eject(id);
      window.removeEventListener('complidata:sessao-encerrada', encerrar);
      window.removeEventListener('complidata:token-novo', novoToken);
    };
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
    setAvisoLogin('');
    setToken(novoToken);
  };

  // Etapa 7a: "Sair" encerra a sessao tambem no servidor (o token deixa de
  // valer mesmo que alguem tenha copiado). Sai localmente mesmo se a rede falhar.
  const handleLogout = () => {
    const atual = localStorage.getItem('token');
    limparSessaoLocal();
    setToken(null);
    setUsuario(null);
    setAvisoLogin('');
    if (atual) axios.post(`${API}/auth/logout`, {}, { headers: { Authorization: `Bearer ${atual}` } }).catch(() => {});
  };

  if (rota === '#admin') return <Admin />;
  // Rota publica nova: #solicitar/:slug (slug da organizacao)
  if (rota.startsWith('#solicitar/')) {
    const slug = rota.split('/')[1] || '';
    return <SolicitarDireitos slug={slug} />;
  }
  // Pesquisa de satisfacao publica: #pesquisa/:slug
  if (rota.startsWith('#pesquisa/')) {
    const slug = rota.split('/')[1] || '';
    return <SolicitarDireitos slug={slug} modo="pesquisa" />;
  }
  // Resultados publicos da pesquisa: #pesquisa-resultados/:slug
  // Linkado do portal Plone da camara (PNTP TCE/RS 15.6).
  if (rota.startsWith('#pesquisa-resultados/')) {
    const slug = rota.split('/')[1] || '';
    return <PesquisaResultadosPublicos slug={slug} />;
  }
  // Pagina publica de transparencia LGPD: #transparencia/:slug
  if (rota.startsWith('#transparencia/')) {
    const slug = rota.split('/')[1] || '';
    return <TransparenciaPublica slug={slug} />;
  }
  // Verificacao publica de certificado de treinamento: #certificado/:codigo
  if (rota.startsWith('#certificado/')) {
    const codigo = decodeURIComponent(rota.split('/')[1] || '');
    return <VerificarCertificado codigo={codigo} />;
  }
  // Rota publica legada: #solicitar-direitos/:organizacaoId (compat)
  if (rota.startsWith('#solicitar-direitos')) {
    const orgId = rota.split('/')[1] || '';
    return <SolicitarDireitos organizacaoId={orgId} />;
  }
  // Link do e-mail "esqueci minha senha": #redefinir-senha/:token
  if (rota.startsWith('#redefinir-senha/')) {
    return <RedefinirSenha token={rota.slice('#redefinir-senha/'.length)} />;
  }
  if (!token) return <Login onLogin={handleLogin} aviso={avisoLogin} />;

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
