import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';
import CampoSenha from './CampoSenha';
import { CamposNovaSenha, erroLocalSenha } from './RedefinirSenha';

export default function Login({ onLogin, aviso }) {
  const [etapa, setEtapa] = useState('senha'); // 'senha' | 'mfa' | 'mfa-setup' | 'troca' | 'esqueci'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secretPlain, setSecretPlain] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  // Etapa 7a: troca obrigatoria no primeiro acesso e "esqueci minha senha"
  const [trocaToken, setTrocaToken] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [msgEsqueci, setMsgEsqueci] = useState('');

  const voltar = () => {
    setEtapa('senha'); setCodigo(''); setTempToken(''); setSetupToken('');
    setQrCode(''); setSecretPlain(''); setErro('');
    setTrocaToken(''); setNova(''); setConfirma(''); setMsgEsqueci('');
  };

  // Segue o fluxo normal depois do login (MFA, MFA obrigatorio ou sessao)
  const seguirLogin = async (data) => {
    if (data.trocaSenhaObrigatoria) {
      setTrocaToken(data.trocaToken);
      setNova(''); setConfirma('');
      setEtapa('troca');
      return;
    }
    if (data.mfaPendente) {
      setTempToken(data.tempToken);
      setEtapa('mfa');
      return;
    }
    if (data.mfaSetupObrigatorio) {
      await iniciarSetupObrigatorio(data.setupToken);
      return;
    }
    onLogin(data.token);
  };

  const trocarPrimeiroAcesso = async (e) => {
    e.preventDefault();
    const local = erroLocalSenha(nova, confirma);
    if (local) return setErro(local);
    setLoading(true);
    setErro('');
    try {
      await axios.post(`${API}/auth/senha/primeiro-acesso`, { trocaToken, novaSenha: nova });
      // entra com a senha nova (passa pelo MFA, se houver)
      const res = await axios.post(`${API}/auth/login`, { email, senha: nova });
      setSenha('');
      await seguirLogin(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Não foi possível criar a senha');
    }
    setLoading(false);
  };

  const pedirLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setMsgEsqueci('');
    try {
      const res = await axios.post(`${API}/auth/senha/esqueci`, { email });
      setMsgEsqueci(res.data.mensagem);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Não foi possível enviar o link agora. Procure o Gestor da sua câmara.');
    }
    setLoading(false);
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
      await seguirLogin(res.data);
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

  if (etapa === 'troca') {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🔑</div>
            <h1 className="login-title">Crie a sua senha</h1>
            <p className="login-subtitle">Primeiro acesso: a senha que você recebeu serve só para entrar uma vez. Crie agora a sua senha pessoal.</p>
          </div>
          <form onSubmit={trocarPrimeiroAcesso}>
            <CamposNovaSenha nova={nova} setNova={setNova} confirma={confirma} setConfirma={setConfirma} />
            {erro && <p className="text-error">{erro}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar e entrar'}</button>
          </form>
          <p className="text-center mt-16">
            <button type="button" onClick={voltar} className="link-back">← Voltar</button>
          </p>
        </div>
      </div>
    );
  }

  if (etapa === 'esqueci') {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">✉️</div>
            <h1 className="login-title">Esqueci minha senha</h1>
            <p className="login-subtitle">Informe o seu e-mail de acesso. Enviaremos um link para criar uma nova senha.</p>
          </div>
          {msgEsqueci ? (
            <p className="text-success">{msgEsqueci}</p>
          ) : (
            <form onSubmit={pedirLink}>
              <label>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@camara.gov.br" required autoFocus />
              {erro && <p className="text-error">{erro}</p>}
              <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Enviar link'}</button>
            </form>
          )}
          <p className="text-center mt-16">
            <button type="button" onClick={voltar} className="link-back">← Voltar ao login</button>
          </p>
        </div>
      </div>
    );
  }

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
        {aviso && <p className="text-error" role="status">{aviso}</p>}
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
        <p className="text-center mt-16">
          <button type="button" className="link-back" onClick={() => { setErro(''); setEtapa('esqueci'); }}>Esqueci minha senha</button>
        </p>
      </div>
    </div>
  );
}
