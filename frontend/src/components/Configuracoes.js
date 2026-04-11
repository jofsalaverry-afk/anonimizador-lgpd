import { useState, useEffect } from 'react';
import { API } from '../config';
export default function Configuracoes({ token }) {
  const [perfil, setPerfil] = useState({ nome: '', cnpj: '', email: '', municipio: '', cabecalho: '', logoBase64: '' });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    fetch(API + '/perfil/perfil', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()).then(d => { setPerfil(d); setLoading(false); });
  }, [token]);
  const handleLogo = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPerfil(p => ({ ...p, logoBase64: reader.result }));
    reader.readAsDataURL(file);
  };
  const salvar = async () => {
    setSalvando(true); setMsg('');
    try {
      const res = await fetch(API + '/perfil/perfil', { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ municipio: perfil.municipio, cabecalho: perfil.cabecalho, logoBase64: perfil.logoBase64 }) });
      if (res.ok) setMsg('Salvo com sucesso!'); else setMsg('Erro ao salvar.');
    } catch { setMsg('Erro ao salvar.'); }
    setSalvando(false);
  };
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>;
  return (
    <div>
      <div className='card' style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Dados da Camara</h2>
        <label>Nome</label><input value={perfil.nome || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} />
        <label>CNPJ</label><input value={perfil.cnpj || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} />
        <label>Email</label><input value={perfil.email || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} />
        <label>Municipio</label><input value={perfil.municipio || ''} onChange={e => setPerfil(p => ({ ...p, municipio: e.target.value }))} placeholder='Ex: Portao / RS' />
        <label>Cabecalho do documento</label>
        <textarea value={perfil.cabecalho || ''} onChange={e => setPerfil(p => ({ ...p, cabecalho: e.target.value }))} rows={3} placeholder='Ex: Camara Municipal de Portao' />
      </div>
      <div className='card' style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Logo da Camara</h2>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>A logo aparecera no cabecalho do PDF.</p>
        {perfil.logoBase64 && (<div style={{ marginBottom: 12, textAlign: 'center' }}><img src={perfil.logoBase64} alt='Logo' style={{ maxHeight: 100, maxWidth: 200, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }} /><br /><button onClick={() => setPerfil(p => ({ ...p, logoBase64: '' }))} style={{ marginTop: 8, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Remover logo</button></div>)}
        <input type='file' accept='image/*' onChange={handleLogo} />
      </div>
      {msg && <p style={{ color: msg.includes('sucesso') ? '#16a34a' : '#dc2626', fontSize: 13, marginBottom: 12 }}>{msg}</p>}
      <button className='btn-primary' onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar configuracoes'}</button>
    </div>
  );
}