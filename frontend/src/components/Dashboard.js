import { useState } from 'react';
import Anonimizador from './Anonimizador';
import Ropa from './Ropa';
import Dsar from './Dsar';

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
  dsar: 'Direitos do Titular'
};

export default function Dashboard({ usuario, token, onLogout, onTokenInvalido }) {
  const [pagina, setPagina] = useState('anonimizador');
  const modulos = usuario?.modulosAtivos || ['anonimizador'];
  const showSidebar = modulos.length > 1;
  const initials = (usuario?.orgNome || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

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
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user-org">{usuario?.orgNome}</div>
            <div className="sidebar-user-meta">
              {usuario?.nome !== usuario?.orgNome ? `${usuario?.nome} · ` : ''}{PERFIL_LABEL[usuario?.perfil] || usuario?.perfil}
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
            {!showSidebar && (
              <>
                <div>
                  <div className="header-user-name">{usuario?.orgNome}</div>
                  <div className="header-user-role">{PERFIL_LABEL[usuario?.perfil] || usuario?.perfil}</div>
                </div>
                <button onClick={onLogout} className="btn-logout">Sair</button>
              </>
            )}
            {showSidebar && (
              <>
                <div>
                  <div className="header-user-name">{usuario?.orgNome}</div>
                  <div className="header-user-role">{PERFIL_LABEL[usuario?.perfil] || usuario?.perfil}</div>
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
        </div>
      </div>
    </div>
  );
}
