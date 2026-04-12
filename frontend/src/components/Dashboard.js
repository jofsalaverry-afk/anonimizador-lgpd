import { useState } from 'react';
import Anonimizador from './Anonimizador';
import Ropa from './Ropa';

const PERFIL_LABEL = {
  ENCARREGADO_LGPD: 'DPO',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  AUDITOR: 'Auditor',
  TREINANDO: 'Treinando'
};

export default function Dashboard({ usuario, token, onLogout, onTokenInvalido }) {
  const [pagina, setPagina] = useState('anonimizador');
  const modulos = usuario?.modulosAtivos || ['anonimizador'];

  return (
    <div className="page-shell">
      <header className="header">
        <div className="header-brand">
          <span className="header-brand-icon">🏛️</span>
          <span className="header-brand-text">Anonimizador LGPD</span>
        </div>
        <div className="header-right">
          <div className="header-user">
            <div className="header-user-org">{usuario?.orgNome}</div>
            <div className="header-user-meta">
              {usuario?.nome !== usuario?.orgNome ? `${usuario?.nome} · ` : ''}{PERFIL_LABEL[usuario?.perfil] || usuario?.perfil}
            </div>
          </div>
          <button onClick={onLogout} className="btn-logout">Sair</button>
        </div>
      </header>

      <div className="layout">
        {/* Sidebar — visivel quando ha mais de 1 modulo ativo */}
        {modulos.length > 1 && (
          <nav className="sidebar">
            <div className="sidebar-section">
              {modulos.includes('anonimizador') && (
                <button onClick={() => setPagina('anonimizador')} className={pagina === 'anonimizador' ? 'nav-item nav-item-active' : 'nav-item'}>
                  <span className="nav-icon">📄</span> Anonimizador
                </button>
              )}
              {modulos.includes('ropa') && (
                <button onClick={() => setPagina('ropa')} className={pagina === 'ropa' ? 'nav-item nav-item-active' : 'nav-item'}>
                  <span className="nav-icon">📋</span> Mapeamento ROPA
                </button>
              )}
            </div>
          </nav>
        )}

        <main className="main">
          {pagina === 'anonimizador' && <Anonimizador token={token} onTokenInvalido={onTokenInvalido} />}
          {pagina === 'ropa' && <Ropa token={token} />}
        </main>
      </div>
    </div>
  );
}
