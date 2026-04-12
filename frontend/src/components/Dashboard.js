// build: 2026-04-12-v3
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import Anonimizador from './Anonimizador';
import Ropa from './Ropa';
import Dsar from './Dsar';
import Repositorio from './Repositorio';
import ChecklistPage from './ChecklistPage';
import AlertasCenter from './AlertasCenter';

const PERFIL_LABEL = {
  ENCARREGADO_LGPD: 'DPO',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  AUDITOR: 'Auditor',
  TREINANDO: 'Treinando'
};

const PAGE_TITLES = {
  anonimizador: 'Anonimizador de Documentos',
  ropa: 'Mapeamento ROPA',
  dsar: 'Direitos do Titular',
  documentos: 'Repositorio de Documentos',
  incidentes: 'Gestao de Incidentes',
  conformidade: 'Checklist de Conformidade'
};

export default function Dashboard({ usuario, token, onLogout, onTokenInvalido }) {
  const [pagina, setPagina] = useState('anonimizador');
  // Estado local para usuario — permite atualizar modulosAtivos sem deslogar
  const [usuarioAtual, setUsuarioAtual] = useState(usuario);

  // Busca dados frescos do backend ao montar: garante que modulosAtivos
  // reflita alteracoes feitas pelo admin depois do login.
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsuarioAtual(prev => ({ ...prev, ...res.data }));
        // Atualiza localStorage com dados frescos
        localStorage.setItem('usuario', JSON.stringify({ ...usuario, ...res.data }));
      } catch (err) {
        if (err.response?.status === 401 && onTokenInvalido) onTokenInvalido();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const modulos = usuarioAtual?.modulosAtivos || ['anonimizador'];
  const showSidebar = modulos.length > 1;
  const initials = (usuarioAtual?.orgNome || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={`app-layout ${showSidebar ? '' : 'app-layout-single'}`}>
      {showSidebar && (
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-logo">🏛️</div>
            <div>
              <div className="sidebar-brand-name">Anonimizador</div>
              <div className="sidebar-brand-sub">LGPD Compliance</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-section-label">Modulos</div>
            {modulos.includes('anonimizador') && (
              <button onClick={() => setPagina('anonimizador')} className={`nav-item ${pagina === 'anonimizador' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">📄</span> Anonimizador
              </button>
            )}
            {modulos.includes('ropa') && (
              <button onClick={() => setPagina('ropa')} className={`nav-item ${pagina === 'ropa' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">📋</span> Mapeamento ROPA
              </button>
            )}
            {modulos.includes('dsar') && (
              <button onClick={() => setPagina('dsar')} className={`nav-item ${pagina === 'dsar' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">🔒</span> DSAR
              </button>
            )}
            {modulos.includes('repositorio') && (
              <>
                <button onClick={() => setPagina('documentos')} className={`nav-item ${pagina === 'documentos' ? 'nav-item-active' : ''}`}>
                  <span className="nav-icon">📁</span> Repositorio
                </button>
                <button onClick={() => setPagina('incidentes')} className={`nav-item ${pagina === 'incidentes' ? 'nav-item-active' : ''}`}>
                  <span className="nav-icon">⚠️</span> Incidentes
                </button>
              </>
            )}
            {modulos.includes('checklist') && (
              <button onClick={() => setPagina('conformidade')} className={`nav-item ${pagina === 'conformidade' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">✓</span> Conformidade
              </button>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user-org">{usuarioAtual?.orgNome}</div>
            <div className="sidebar-user-meta">
              {usuarioAtual?.nome !== usuarioAtual?.orgNome ? `${usuarioAtual?.nome} · ` : ''}{PERFIL_LABEL[usuarioAtual?.perfil] || usuarioAtual?.perfil}
            </div>
            <button onClick={onLogout} className="sidebar-logout">Sair da conta</button>
          </div>
        </aside>
      )}

      <div className="content-area">
        <header className="content-header">
          <h1 className="content-header-title">
            {showSidebar ? PAGE_TITLES[pagina] || pagina : 'Anonimizador LGPD'}
          </h1>
          <div className="content-header-right">
            <AlertasCenter token={token} />
            {!showSidebar && (
              <>
                <div>
                  <div className="header-user-name">{usuarioAtual?.orgNome}</div>
                  <div className="header-user-role">{PERFIL_LABEL[usuarioAtual?.perfil] || usuarioAtual?.perfil}</div>
                </div>
                <button onClick={onLogout} className="btn-logout">Sair</button>
              </>
            )}
            {showSidebar && (
              <>
                <div>
                  <div className="header-user-name">{usuarioAtual?.orgNome}</div>
                  <div className="header-user-role">{PERFIL_LABEL[usuarioAtual?.perfil] || usuarioAtual?.perfil}</div>
                </div>
                <div className="header-avatar">{initials}</div>
              </>
            )}
          </div>
        </header>

        <div className="content-body">
          {pagina === 'anonimizador' && <Anonimizador token={token} onTokenInvalido={onTokenInvalido} />}
          {pagina === 'ropa' && <Ropa token={token} />}
          {pagina === 'dsar' && <Dsar token={token} />}
          {pagina === 'documentos' && <Repositorio token={token} subpagina="documentos" />}
          {pagina === 'incidentes' && <Repositorio token={token} subpagina="incidentes" />}
          {pagina === 'conformidade' && <ChecklistPage token={token} />}
        </div>
      </div>
    </div>
  );
}
