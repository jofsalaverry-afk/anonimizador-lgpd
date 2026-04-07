import { useState } from 'react';
import Anonimizador from './Anonimizador';
import Configuracoes from './Configuracoes';

export default function Dashboard({ camara, token, onLogout }) {
  const [aba, setAba] = useState('anonimizar');
  const abas = [{ key: 'anonimizar', label: 'Anonimizar documento' }, { key: 'configuracoes', label: 'Configuracoes' }];
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🏛️</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Anonimizador LGPD</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>{camara?.nome}</span>
          <button onClick={onLogout} style={{ fontSize: 13, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Sair</button>
        </div>
      </header>
      <div style={{ maxWidth: 800, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {abas.map(a => (<button key={a.key} onClick={() => setAba(a.key)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 13, background: aba === a.key ? '#1d4ed8' : 'white', color: aba === a.key ? 'white' : '#475569' }}>{a.label}</button>))}
        </div>
        {aba === 'anonimizar' && <Anonimizador token={token} />}
        {aba === 'configuracoes' && <Configuracoes token={token} />}
      </div>
    </div>
  );
}