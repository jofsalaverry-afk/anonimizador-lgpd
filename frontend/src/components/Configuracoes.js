import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

// Seccao de MFA/Seguranca. Carrega o status atual de /auth/me, mostra
// setup (QR code) se nao estiver ativo e opcao de desativar se estiver.
function SegurancaMFA({ token, usuario, onStatusChange }) {
  const [etapa, setEtapa] = useState('status'); // 'status' | 'setup' | 'confirmar' | 'desativar'
  const [qrCode, setQrCode] = useState('');
  const [secretPlain, setSecretPlain] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const iniciarSetup = async () => {
    setErro('');
    setMsg('');
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/mfa/configurar`, {}, { headers });
      setQrCode(res.data.qrCode);
      setSecretPlain(res.data.secret);
      setEtapa('confirmar');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao configurar MFA');
    }
    setLoading(false);
  };

  const ativar = async (e) => {
    e.preventDefault();
    if (!codigo || codigo.length < 6) return setErro('Informe o código de 6 dígitos');
    setLoading(true);
    setErro('');
    try {
      await axios.post(`${API}/auth/mfa/ativar`, { codigo }, { headers });
      setCodigo('');
      setMsg('MFA ativado com sucesso. No próximo login será pedido o código.');
      setEtapa('status');
      onStatusChange && onStatusChange(true);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Código inválido');
    }
    setLoading(false);
  };

  const desativar = async (e) => {
    e.preventDefault();
    if (!codigo || codigo.length < 6) return setErro('Informe o código de 6 dígitos');
    if (!window.confirm('Tem certeza que deseja desativar o MFA? Sua conta ficará menos segura.')) return;
    setLoading(true);
    setErro('');
    try {
      await axios.put(`${API}/auth/mfa/desativar`, { codigo }, { headers });
      setCodigo('');
      setMsg('MFA desativado.');
      setEtapa('status');
      onStatusChange && onStatusChange(false);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao desativar MFA');
    }
    setLoading(false);
  };

  const mfaAtivo = usuario?.mfaAtivo;

  return (
    <div className="card mb-16">
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Segurança</h2>
      <p className="text-sm" style={{ color: '#64748b', marginBottom: 16 }}>
        Autenticação em 2 etapas protege sua conta mesmo que alguém descubra sua senha. Use um app como Google Authenticator, Authy ou Microsoft Authenticator.
      </p>

      {msg && <div className="alert-success mb-8">{msg}</div>}
      {erro && <div className="alert-error mb-8">{erro}</div>}

      {etapa === 'status' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span
            className={`badge ${mfaAtivo ? 'badge-success' : 'badge-muted'}`}
            style={{ padding: '4px 10px' }}
          >
            {mfaAtivo ? '🔐 MFA ativo' : '⚠️ MFA não configurado'}
          </span>
          {!mfaAtivo ? (
            <button className="btn-primary btn-sm" type="button" onClick={iniciarSetup} disabled={loading}>
              {loading ? 'Gerando...' : 'Ativar autenticador'}
            </button>
          ) : (
            <button
              className="btn-sm"
              type="button"
              onClick={() => { setErro(''); setMsg(''); setEtapa('desativar'); }}
              style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}
            >
              Desativar MFA
            </button>
          )}
        </div>
      )}

      {etapa === 'confirmar' && (
        <div>
          <p className="text-sm mb-8">1. Abra seu app autenticador e escaneie o QR code abaixo:</p>
          {qrCode && (
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <img src={qrCode} alt="QR code MFA" style={{ maxWidth: 220 }} />
              <div className="text-muted text-xs mt-8">
                Ou digite manualmente: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{secretPlain}</code>
              </div>
            </div>
          )}
          <p className="text-sm mb-8">2. Digite o código de 6 dígitos que aparece no app:</p>
          <form onSubmit={ativar}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center', fontWeight: 700, maxWidth: 200 }}
            />
            <div className="flex gap-8 mt-8">
              <button className="btn-primary btn-sm" type="submit" disabled={loading}>
                {loading ? 'Validando...' : 'Confirmar e ativar'}
              </button>
              <button type="button" onClick={() => { setEtapa('status'); setCodigo(''); setErro(''); }} className="btn-sm">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {etapa === 'desativar' && (
        <form onSubmit={desativar}>
          <p className="text-sm mb-8">Para desativar, informe o código atual do seu app autenticador:</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={codigo}
            onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            required
            style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center', fontWeight: 700, maxWidth: 200 }}
          />
          <div className="flex gap-8 mt-8">
            <button type="submit" disabled={loading} className="btn-sm" style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>
              {loading ? 'Desativando...' : 'Confirmar desativação'}
            </button>
            <button type="button" onClick={() => { setEtapa('status'); setCodigo(''); setErro(''); }} className="btn-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Configuracoes({ token, usuario }) {
  const [perfil, setPerfil] = useState({ nome: '', cnpj: '', email: '', municipio: '', cabecalho: '', logoBase64: '' });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [mfaAtivoLocal, setMfaAtivoLocal] = useState(usuario?.mfaAtivo || false);

  useEffect(() => {
    fetch(API + '/perfil/perfil', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => { setPerfil(d); setLoading(false); });
  }, [token]);

  useEffect(() => { setMfaAtivoLocal(usuario?.mfaAtivo || false); }, [usuario]);

  const handleLogo = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPerfil(p => ({ ...p, logoBase64: reader.result }));
    reader.readAsDataURL(file);
  };

  const salvar = async () => {
    setSalvando(true); setMsg('');
    try {
      const res = await fetch(API + '/perfil/perfil', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ municipio: perfil.municipio, cabecalho: perfil.cabecalho, logoBase64: perfil.logoBase64 })
      });
      if (res.ok) setMsg('Salvo com sucesso!'); else setMsg('Erro ao salvar.');
    } catch { setMsg('Erro ao salvar.'); }
    setSalvando(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>;

  return (
    <div>
      <SegurancaMFA
        token={token}
        usuario={{ ...usuario, mfaAtivo: mfaAtivoLocal }}
        onStatusChange={setMfaAtivoLocal}
      />

      <div className='card' style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Dados da Câmara</h2>
        <label>Nome</label><input value={perfil.nome || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} />
        <label>CNPJ</label><input value={perfil.cnpj || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} />
        <label>Email</label><input value={perfil.email || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} />
        <label>Município</label><input value={perfil.municipio || ''} onChange={e => setPerfil(p => ({ ...p, municipio: e.target.value }))} placeholder='Ex: Portão / RS' />
        <label>Cabeçalho do documento</label>
        <textarea value={perfil.cabecalho || ''} onChange={e => setPerfil(p => ({ ...p, cabecalho: e.target.value }))} rows={3} placeholder='Ex: Câmara Municipal de Portão' />
      </div>
      <div className='card' style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Logo da Câmara</h2>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>A logo aparecerá no cabeçalho do PDF.</p>
        {perfil.logoBase64 && (<div style={{ marginBottom: 12, textAlign: 'center' }}><img src={perfil.logoBase64} alt='Logo' style={{ maxHeight: 100, maxWidth: 200, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }} /><br /><button onClick={() => setPerfil(p => ({ ...p, logoBase64: '' }))} style={{ marginTop: 8, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Remover logo</button></div>)}
        <input type='file' accept='image/*' onChange={handleLogo} />
      </div>
      {msg && <p style={{ color: msg.includes('sucesso') ? '#16a34a' : '#dc2626', fontSize: 13, marginBottom: 12 }}>{msg}</p>}
      <button className='btn-primary' onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar configurações'}</button>
    </div>
  );
}
