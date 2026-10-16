// build: 2026-04-12-v4
import { useState } from 'react';
import Anonimizador from './Anonimizador';
import Configuracoes from './Configuracoes';
import Ropa from './Ropa';
import Dsar from './Dsar';
import Pesquisa from './Pesquisa';
import Repositorio from './Repositorio';
import ChecklistPage from './ChecklistPage';
import Treinamento from './Treinamento';
import AlertasCenter from './AlertasCenter';
import Inventario from './Inventario';
import Terceiros from './Terceiros';
import PainelIndicadores from './PainelIndicadores';

const PERFIL_LABEL = {
  ENCARREGADO_LGPD: 'DPO',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  AUDITOR: 'Auditor',
  TREINANDO: 'Treinando'
};

const PAGE_TITLES = {
  painel: 'Painel de Indicadores',
  anonimizador: 'Anonimizador de Documentos',
  ropa: 'Mapeamento ROPA',
  dsar: 'Direitos do Titular',
  pesquisa: 'Pesquisa de Satisfação',
  documentos: 'Repositório de Documentos',
  incidentes: 'Gestão de Incidentes',
  conformidade: 'Checklist de Conformidade',
  treinamento: 'Treinamentos LGPD',
  inventario: 'Inventário de Sistemas',
  terceiros: 'Terceiros e Operadores',
  configuracoes: 'Configurações e Segurança'
};

export default function Dashboard({ usuario, token, onLogout, onTokenInvalido }) {
  // usuario vem do App.js ja com modulosAtivos fresco de /auth/me.
  const modulos = usuario?.modulosAtivos || ['anonimizador'];
  const showSidebar = modulos.length > 1;
  // Com mais de um modulo, a tela inicial e o painel de indicadores.
  const [pagina, setPagina] = useState(showSidebar ? 'painel' : 'anonimizador');
  // Filtro vindo de um card do painel (ex.: ROPA "nao mapeados").
  const [filtro, setFiltro] = useState(null);
  const irPara = (p) => { setFiltro(null); setPagina(p); };
  const navegar = (link) => { setFiltro(link); setPagina(link.pagina); };
  const chaveFiltro = filtro ? JSON.stringify(filtro) : 'sem-filtro';
  const initials = (usuario?.orgNome || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={`app-layout ${showSidebar ? '' : 'app-layout-single'}`}>
      {showSidebar && (
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-logo"><img src="/submark-complidata.png" alt="Complidata" width="32" height="32" /></div>
            <div>
              <div className="sidebar-brand-name">Complidata</div>
              <div className="sidebar-brand-sub">LGPD · Poder Público</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button onClick={() => irPara('painel')} className={`nav-item ${pagina === 'painel' ? 'nav-item-active' : ''}`}>
              <span className="nav-icon">📊</span> Painel
            </button>
            <div className="sidebar-section-label">Módulos</div>
            {modulos.includes('anonimizador') && (
              <button onClick={() => irPara('anonimizador')} className={`nav-item ${pagina === 'anonimizador' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">📄</span> Anonimizador
              </button>
            )}
            {modulos.includes('ropa') && (
              <button onClick={() => irPara('ropa')} className={`nav-item ${pagina === 'ropa' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">📋</span> Mapeamento ROPA
              </button>
            )}
            {modulos.includes('inventario') && (
              <button onClick={() => irPara('inventario')} className={`nav-item ${pagina === 'inventario' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">🖥️</span> Inventário
              </button>
            )}
            {modulos.includes('terceiros') && (
              <button onClick={() => irPara('terceiros')} className={`nav-item ${pagina === 'terceiros' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">🤝</span> Terceiros
              </button>
            )}
            {modulos.includes('dsar') && (
              <button onClick={() => irPara('dsar')} className={`nav-item ${pagina === 'dsar' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">🔒</span> DSAR
              </button>
            )}
            {modulos.includes('pesquisa') && (
              <button onClick={() => irPara('pesquisa')} className={`nav-item ${pagina === 'pesquisa' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">💬</span> Pesquisa
              </button>
            )}
            {modulos.includes('repositorio') && (
              <>
                <button onClick={() => irPara('documentos')} className={`nav-item ${pagina === 'documentos' ? 'nav-item-active' : ''}`}>
                  <span className="nav-icon">📁</span> Repositório
                </button>
                <button onClick={() => irPara('incidentes')} className={`nav-item ${pagina === 'incidentes' ? 'nav-item-active' : ''}`}>
                  <span className="nav-icon">⚠️</span> Incidentes
                </button>
              </>
            )}
            {modulos.includes('checklist') && (
              <button onClick={() => irPara('conformidade')} className={`nav-item ${pagina === 'conformidade' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">✓</span> Conformidade
              </button>
            )}
            {modulos.includes('treinamento') && (
              <button onClick={() => irPara('treinamento')} className={`nav-item ${pagina === 'treinamento' ? 'nav-item-active' : ''}`}>
                <span className="nav-icon">🎓</span> Treinamentos
              </button>
            )}
            <button onClick={() => irPara('configuracoes')} className={`nav-item ${pagina === 'configuracoes' ? 'nav-item-active' : ''}`}>
              <span className="nav-icon">⚙️</span> Configurações
            </button>
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
            {showSidebar ? PAGE_TITLES[pagina] || pagina : 'Complidata'}
          </h1>
          <div className="content-header-right">
            <AlertasCenter token={token} />
            <div>
              <div className="header-user-name">{usuario?.orgNome}</div>
              <div className="header-user-role">{PERFIL_LABEL[usuario?.perfil] || usuario?.perfil}</div>
            </div>
            {showSidebar && <div className="header-avatar">{initials}</div>}
            {/* Botao Sair sempre visivel no header */}
            <button onClick={onLogout} className="btn-logout">Sair</button>
          </div>
        </header>

        <div className="content-body">
          {pagina === 'painel' && <PainelIndicadores token={token} usuario={usuario} onNavegar={navegar} />}
          {pagina === 'anonimizador' && <Anonimizador token={token} usuario={usuario} onTokenInvalido={onTokenInvalido} />}
          {pagina === 'ropa' && <Ropa key={chaveFiltro} token={token} filtroInicial={filtro} />}
          {pagina === 'dsar' && <Dsar key={chaveFiltro} token={token} usuario={usuario} filtroInicial={filtro} />}
          {pagina === 'pesquisa' && <Pesquisa token={token} usuario={usuario} />}
          {pagina === 'documentos' && <Repositorio token={token} usuario={usuario} subpagina="documentos" />}
          {pagina === 'incidentes' && <Repositorio key={chaveFiltro} token={token} subpagina="incidentes" filtroInicial={filtro} />}
          {pagina === 'conformidade' && <ChecklistPage token={token} />}
          {pagina === 'treinamento' && <Treinamento key={chaveFiltro} token={token} usuario={usuario} filtroInicial={filtro} />}
          {pagina === 'inventario' && <Inventario token={token} />}
          {pagina === 'terceiros' && <Terceiros key={chaveFiltro} token={token} usuario={usuario} filtroInicial={filtro} />}
          {pagina === 'configuracoes' && <Configuracoes token={token} usuario={usuario} />}
        </div>
      </div>
    </div>
  );
}
