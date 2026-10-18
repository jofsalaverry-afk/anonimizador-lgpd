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
import UsuariosOrganizacao from './UsuariosOrganizacao';
import { paginasVisiveis, somenteLeitura, PAGINAS_PESSOAIS } from '../permissoes';

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
  usuarios: 'Usuários da Organização',
  configuracoes: 'Configurações e Segurança'
};

// Item do menu: icone e rotulo
const MENU = {
  painel: ['📊', 'Painel'],
  anonimizador: ['📄', 'Anonimizador'],
  ropa: ['📋', 'Mapeamento ROPA'],
  inventario: ['🖥️', 'Inventário'],
  terceiros: ['🤝', 'Terceiros'],
  dsar: ['🔒', 'DSAR'],
  pesquisa: ['💬', 'Pesquisa'],
  documentos: ['📁', 'Repositório'],
  incidentes: ['⚠️', 'Incidentes'],
  conformidade: ['✓', 'Conformidade'],
  treinamento: ['🎓', 'Treinamentos'],
  usuarios: ['👥', 'Usuários'],
  configuracoes: ['⚙️', 'Configurações']
};
const FORA_DE_MODULOS = ['painel', 'usuarios', 'configuracoes'];

export default function Dashboard({ usuario, token, onLogout, onTokenInvalido }) {
  // usuario vem do App.js ja com modulosAtivos fresco de /auth/me.
  const modulos = usuario?.modulosAtivos || ['anonimizador'];
  const showSidebar = modulos.length > 1;
  // Menu filtrado pelo perfil (src/permissoes.js)
  const visiveis = paginasVisiveis(usuario?.perfil, modulos);
  const inicial = showSidebar ? (visiveis.includes('painel') ? 'painel' : visiveis[0]) : 'anonimizador';
  const [pagina, setPagina] = useState(inicial);
  // Filtro vindo de um card do painel (ex.: ROPA "nao mapeados").
  const [filtro, setFiltro] = useState(null);
  const irPara = (p) => { setFiltro(null); setPagina(p); };
  const navegar = (link) => {
    if (!visiveis.includes(link.pagina)) return;
    setFiltro(link);
    setPagina(link.pagina);
  };
  const chaveFiltro = filtro ? JSON.stringify(filtro) : 'sem-filtro';
  const initials = (usuario?.orgNome || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const leitura = somenteLeitura(usuario?.perfil) && !PAGINAS_PESSOAIS.includes(pagina);
  // Pagina fora do que o perfil pode ver nao renderiza (ex.: estado antigo)
  const pode = p => !showSidebar || visiveis.includes(p);

  const item = (p) => (
    <button key={p} onClick={() => irPara(p)} className={`nav-item ${pagina === p ? 'nav-item-active' : ''}`}>
      <span className="nav-icon">{MENU[p][0]}</span> {MENU[p][1]}
    </button>
  );

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
            {visiveis.includes('painel') && item('painel')}
            <div className="sidebar-section-label">Módulos</div>
            {visiveis.filter(p => !FORA_DE_MODULOS.includes(p)).map(item)}
            {visiveis.includes('usuarios') && item('usuarios')}
            {item('configuracoes')}
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

        <div className={`content-body ${leitura ? 'modo-leitura' : ''}`}>
          {leitura && <div className="aviso-leitura">Perfil Auditor: modo somente leitura.</div>}
          {pagina === 'painel' && pode('painel') && <PainelIndicadores token={token} usuario={usuario} onNavegar={navegar} />}
          {pagina === 'anonimizador' && pode('anonimizador') && <Anonimizador token={token} usuario={usuario} onTokenInvalido={onTokenInvalido} />}
          {pagina === 'ropa' && pode('ropa') && <Ropa key={chaveFiltro} token={token} filtroInicial={filtro} />}
          {pagina === 'dsar' && pode('dsar') && <Dsar key={chaveFiltro} token={token} usuario={usuario} filtroInicial={filtro} />}
          {pagina === 'pesquisa' && pode('pesquisa') && <Pesquisa token={token} usuario={usuario} />}
          {pagina === 'documentos' && pode('documentos') && <Repositorio token={token} usuario={usuario} subpagina="documentos" />}
          {pagina === 'incidentes' && pode('incidentes') && <Repositorio key={chaveFiltro} token={token} subpagina="incidentes" filtroInicial={filtro} />}
          {pagina === 'conformidade' && pode('conformidade') && <ChecklistPage token={token} />}
          {pagina === 'treinamento' && pode('treinamento') && <Treinamento key={chaveFiltro} token={token} usuario={usuario} filtroInicial={filtro} />}
          {pagina === 'inventario' && pode('inventario') && <Inventario token={token} />}
          {pagina === 'terceiros' && pode('terceiros') && <Terceiros key={chaveFiltro} token={token} usuario={usuario} filtroInicial={filtro} />}
          {pagina === 'usuarios' && pode('usuarios') && <UsuariosOrganizacao token={token} usuario={usuario} />}
          {pagina === 'configuracoes' && <Configuracoes token={token} usuario={usuario} />}
        </div>
      </div>
    </div>
  );
}
