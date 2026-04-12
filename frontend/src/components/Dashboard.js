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

const menuItemStyle = (ativo) => ({
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: ativo ? 600 : 400, border: 'none', width: '100%', textAlign: 'left',
  background: ativo ? '#eff6ff' : 'transparent',
  color: ativo ? '#1d4ed8' : '#475569'
});

export default function Dashboard({ usuario, token, onLogout, onTokenInvalido }) {
  const [pagina, setPagina] = useState('anonimizador');
  const modulos = usuario?.modulosAtivos || ['anonimizador'];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🏛️</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Anonimizador LGPD</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{usuario?.orgNome}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {usuario?.nome !== usuario?.orgNome ? `${usuario?.nome} · ` : ''}{PERFIL_LABEL[usuario?.perfil] || usuario?.perfil}
            </div>
          </div>
          <button onClick={onLogout} style={{ fontSize: 13, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Sair</button>
        </div>
      </header>

      <div style={{ display: 'flex', maxWidth: 1100, margin: '0 auto' }}>
        {/* Sidebar — visivel quando ha mais de 1 modulo ativo */}
        {modulos.length > 1 && (
          <nav style={{ width: 220, padding: '24px 12px', flexShrink: 0 }}>
            {modulos.includes('anonimizador') && (
              <button onClick={() => setPagina('anonimizador')} style={menuItemStyle(pagina === 'anonimizador')}>
                <span style={{ fontSize: 16 }}>📄</span> Anonimizador
              </button>
            )}
            {modulos.includes('ropa') && (
              <button onClick={() => setPagina('ropa')} style={menuItemStyle(pagina === 'ropa')}>
                <span style={{ fontSize: 16 }}>📋</span> Mapeamento ROPA
              </button>
            )}
          </nav>
        )}

        <main style={{ flex: 1, padding: '32px 16px', maxWidth: 800 }}>
          {pagina === 'anonimizador' && <Anonimizador token={token} onTokenInvalido={onTokenInvalido} />}
          {pagina === 'ropa' && <Ropa token={token} />}
        </main>
      </div>
    </div>
  );
}
