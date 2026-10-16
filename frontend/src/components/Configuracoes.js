import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import Setores from './Setores';
import DadosEncarregado from './DadosEncarregado';
import PortalTransparencia from './PortalTransparencia';

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
          ) : usuario?.mfaObrigatorioOrg ? (
            <span className="text-muted text-sm">Obrigatório pela sua organização</span>
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

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// "Salvo" some depois de alguns segundos
function useAviso() {
  const [aviso, setAviso] = useState(null); // { ok, texto }
  useEffect(() => {
    if (!aviso?.ok) return undefined;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  return [aviso, setAviso];
}
const Aviso = ({ aviso }) => aviso && <span className={aviso.ok ? 'text-success text-sm' : 'text-error text-sm'} style={{ marginLeft: 8 }}>{aviso.texto}</span>;

// Dados da Camara: municipio/UF/endereco num lugar so (usados no
// encarregado, nas minutas, no certificado e na pagina publica).
function DadosCamara({ token, podeEditar }) {
  const [d, setD] = useState(null);
  const [aviso, setAviso] = useAviso();
  const h = { Authorization: 'Bearer ' + token };
  useEffect(() => {
    Promise.all([axios.get(API + '/organizacao/dados', { headers: h }), axios.get(API + '/perfil/perfil', { headers: h })])
      .then(([a, b]) => setD({ nome: a.data.nome, cnpj: a.data.cnpj, municipio: a.data.municipio || '', uf: a.data.uf || '', enderecoSede: a.data.enderecoSede || '', cabecalho: b.data.cabecalho || '' }))
      .catch(() => setAviso({ ok: false, texto: 'Erro ao carregar os dados da Câmara' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const salvar = async () => {
    try {
      await axios.put(API + '/organizacao/dados', { municipio: d.municipio, uf: d.uf, enderecoSede: d.enderecoSede }, { headers: h });
      await axios.put(API + '/perfil/perfil', { cabecalho: d.cabecalho }, { headers: h });
      setAviso({ ok: true, texto: 'Salvo' });
    } catch (err) {
      setAviso({ ok: false, texto: err.response?.data?.erro || 'Erro ao salvar' });
    }
  };
  if (!d) return aviso ? <div className="alert-error mb-16">{aviso.texto}</div> : null;
  const campo = (c, rotulo, extra = {}) => (
    <div className="form-group">
      <label>{rotulo}</label>
      <input value={d[c]} disabled={!podeEditar} onChange={e => setD({ ...d, [c]: e.target.value })} {...extra} />
    </div>
  );
  return (
    <div className='card' style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Dados da Câmara</h2>
      <div className="form-grid">
        <div className="form-group"><label>Nome</label><input value={d.nome || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} /></div>
        <div className="form-group"><label>CNPJ</label><input value={d.cnpj || ''} readOnly style={{ background: '#f1f5f9', color: '#888' }} /></div>
        {campo('municipio', 'Município', { placeholder: 'Ex.: Viamão' })}
        <div className="form-group">
          <label>UF</label>
          <select value={d.uf} disabled={!podeEditar} onChange={e => setD({ ...d, uf: e.target.value })}>
            <option value="">—</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      {campo('enderecoSede', 'Endereço da sede')}
      <label>Cabeçalho do documento</label>
      <textarea value={d.cabecalho} disabled={!podeEditar} onChange={e => setD({ ...d, cabecalho: e.target.value })} rows={3} placeholder='Ex: Câmara Municipal de Viamão' />
      <p className="text-xs text-muted">Município e UF aparecem no certificado, nas minutas e na página de transparência. Nome e CNPJ são alterados pelo administrador da plataforma.</p>
      {podeEditar && <div className="mt-8"><button className='btn-primary btn-sm' onClick={salvar}>Salvar dados da Câmara</button><Aviso aviso={aviso} /></div>}
    </div>
  );
}

// Logo: cabecalho dos PDFs, certificado e pagina de transparencia
function LogoCamara({ token, podeEditar }) {
  const [logo, setLogo] = useState(null);
  const [aviso, setAviso] = useAviso();
  const h = { Authorization: 'Bearer ' + token };
  useEffect(() => {
    axios.get(API + '/perfil/perfil', { headers: h }).then(r => setLogo(r.data.logoBase64 || '')).catch(() => setLogo(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const escolher = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { setAviso({ ok: false, texto: 'Use PNG ou JPG (o certificado em PDF aceita só esses formatos)' }); return; }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  };
  const salvar = async () => {
    try {
      await axios.put(API + '/perfil/perfil', { logoBase64: logo || null }, { headers: h });
      setAviso({ ok: true, texto: 'Salvo' });
    } catch (err) {
      setAviso({ ok: false, texto: err.response?.data?.erro || 'Erro ao salvar' });
    }
  };
  if (logo === null) return null;
  return (
    <div className='card' style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Logo da Câmara</h2>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Aparece no cabeçalho dos PDFs, no certificado de treinamento e na página pública de transparência.</p>
      {logo && (<div style={{ marginBottom: 12, textAlign: 'center' }}><img src={logo} alt='Logo' style={{ maxHeight: 100, maxWidth: 200, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }} /><br />{podeEditar && <button onClick={() => setLogo('')} style={{ marginTop: 8, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Remover logo</button>}</div>)}
      {podeEditar && <input type='file' accept='image/png,image/jpeg' onChange={escolher} />}
      {podeEditar && <div className="mt-8"><button className='btn-primary btn-sm' onClick={salvar}>Salvar logo</button><Aviso aviso={aviso} /></div>}
    </div>
  );
}

export default function Configuracoes({ token, usuario }) {
  const [mfaAtivoLocal, setMfaAtivoLocal] = useState(usuario?.mfaAtivo || false);
  const podeEditar = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);

  useEffect(() => { setMfaAtivoLocal(usuario?.mfaAtivo || false); }, [usuario]);

  // Cada bloco salva o proprio conteudo e mostra "Salvo" (sem botao geral)
  return (
    <div>
      <SegurancaMFA
        token={token}
        usuario={{ ...usuario, mfaAtivo: mfaAtivoLocal }}
        onStatusChange={setMfaAtivoLocal}
      />

      <DadosCamara token={token} podeEditar={podeEditar} />
      <DadosEncarregado token={token} usuario={usuario} />
      <LogoCamara token={token} podeEditar={podeEditar} />
      <PortalTransparencia token={token} usuario={usuario} />
      <Setores token={token} usuario={usuario} />
    </div>
  );
}
