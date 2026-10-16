import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';
import CampoSenha from './CampoSenha';

export default function Login({ onLogin }) {
  const [etapa, setEtapa] = useState('senha'); // 'senha' | 'mfa' | 'mfa-setup'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secretPlain, setSecretPlain] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const voltar = () => {
    setEtapa('senha'); setCodigo(''); setTempToken(''); setSetupToken('');
    setQrCode(''); setSecretPlain(''); setErro('');
  };

  // Organizacao exige MFA e o usuario nao tem: gera o QR code com o
  // setupToken (so vale para configurar/ativar). A sessao vem do ativar.
  const iniciarSetupObrigatorio = async (token) => {
    const res = await axios.post(`${API}/auth/mfa/configurar`, {}, { headers: { Authorization: `Bearer ${token}` } });
    setSetupToken(token);
    setQrCode(res.data.qrCode);
    setSecretPlain(res.data.secret);
    setEtapa('mfa-setup');
  };

  const ativarSetupObrigatorio = async (e) => {
    e.preventDefault();
    if (!codigo || codigo.length < 6) return setErro('Informe o código de 6 dígitos');
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/auth/mfa/ativar`, { codigo }, { headers: { Authorization: `Bearer ${setupToken}` } });
      onLogin(res.data.token);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Código inválido ou sessão expirada');
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/auth/login`, { email, senha });
      // Se o usuario tem MFA ativo, o backend nao emite o token final:
      // ele devolve { mfaPendente, tempToken } e passamos para a etapa
      // de desafio MFA. O token real so vira depois do POST verificar.
      if (res.data.mfaPendente) {
        setTempToken(res.data.tempToken);
        setEtapa('mfa');
        setLoading(false);
        return;
      }
      if (res.data.mfaSetupObrigatorio) {
        await iniciarSetupObrigatorio(res.data.setupToken);
        setLoading(false);
        return;
      }
      onLogin(res.data.token);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao fazer login');
    }
    setLoading(false);
  };

  const verificarMfa = async (e) => {
    e.preventDefault();
    if (!codigo || codigo.length < 6) {
      return setErro('Informe o código de 6 dígitos');
    }
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/auth/mfa/verificar`, { tempToken, codigo });
      onLogin(res.data.token);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Código inválido ou expirado');
    }
    setLoading(false);
  };

  if (etapa === 'mfa') {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🔐</div>
            <h1 className="login-title">Autenticação em 2 etapas</h1>
            <p className="login-subtitle">Abra seu app autenticador e informe o código de 6 dígitos</p>
          </div>
          <form onSubmit={verificarMfa}>
            <label>Código</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              required
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 26, letterSpacing: 10, textAlign: 'center', fontWeight: 600 }}
            />
            {erro && <p className="text-error">{erro}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Verificar código'}
            </button>
          </form>
          <p className="text-center mt-16">
            <button
              type="button"
              onClick={voltar}
              className="link-back"
            >
              ← Voltar
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (etapa === 'mfa-setup') {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🔐</div>
            <h1 className="login-title">Configure a autenticação em 2 etapas</h1>
            <p className="login-subtitle">Sua organização exige MFA. Configure o autenticador para entrar.</p>
          </div>
          <p className="text-sm mb-8">1. Escaneie o QR code com Google Authenticator, Authy ou Microsoft Authenticator:</p>
          {qrCode && (
            <div style={{ textAlign: 'center', margin: '12px 0' }}>
              <img src={qrCode} alt="QR code MFA" style={{ maxWidth: 200 }} />
              <div className="text-muted text-xs mt-8">
                Ou digite manualmente: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{secretPlain}</code>
              </div>
            </div>
          )}
          <form onSubmit={ativarSetupObrigatorio}>
            <label>2. Código de 6 dígitos</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              required
              style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 26, letterSpacing: 10, textAlign: 'center', fontWeight: 600 }}
            />
            {erro && <p className="text-error">{erro}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Validando...' : 'Ativar e entrar'}
            </button>
          </form>
          <p className="text-center mt-16">
            <button type="button" onClick={voltar} className="link-back">← Voltar</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-center">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo-complidata.png" alt="Complidata" width="240" className="login-logo" />
          <p className="login-subtitle">LGPD · Poder Público</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@camara.gov.br" required />
          <label>Senha</label>
          <CampoSenha value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" required />
          {erro && <p className="text-error">{erro}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
