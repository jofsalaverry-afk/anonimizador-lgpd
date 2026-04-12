import Anonimizador from './Anonimizador';

const PERFIL_LABEL = {
  ENCARREGADO_LGPD: 'DPO',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  AUDITOR: 'Auditor',
  TREINANDO: 'Treinando'
};

export default function Dashboard({ usuario, token, onLogout, onTokenInvalido }) {
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
      <div style={{ maxWidth: 800, margin: '32px auto', padding: '0 16px' }}>
        <Anonimizador token={token} onTokenInvalido={onTokenInvalido} />
      </div>
    </div>
  );
}
