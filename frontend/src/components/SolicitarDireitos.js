import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

// Os 9 direitos do Art. 18 da LGPD (Lei 13.709/2018). OUTRO abre um
// campo livre para o titular descrever um direito especifico nao coberto
// pelos itens padrao — o texto e concatenado no inicio da descricao
// para o responsavel da camara ter contexto claro.
const TIPO_OPTIONS = [
  { value: 'CONFIRMACAO', label: 'Confirmacao de existencia de tratamento' },
  { value: 'ACESSO', label: 'Acesso aos dados' },
  { value: 'CORRECAO', label: 'Correcao de dados incompletos, inexatos ou desatualizados' },
  { value: 'ANONIMIZACAO', label: 'Anonimizacao, bloqueio ou eliminacao de dados desnecessarios' },
  { value: 'PORTABILIDADE', label: 'Portabilidade dos dados' },
  { value: 'ELIMINACAO', label: 'Eliminacao dos dados tratados com consentimento' },
  { value: 'INFORMACAO', label: 'Informacao sobre compartilhamento com terceiros' },
  { value: 'REVOGACAO', label: 'Revogacao do consentimento' },
  { value: 'OUTRO', label: 'Outro (descrever)' }
];

export default function SolicitarDireitos({ slug, organizacaoId: organizacaoIdProp }) {
  const [etapa, setEtapa] = useState('form'); // 'form' | 'otp' | 'sucesso'
  const [form, setForm] = useState({ titularNome: '', titularEmail: '', titularCpf: '', tipoDireito: '', descricao: '' });
  // Texto livre so usado quando tipoDireito === 'OUTRO'. Concatenado na
  // descricao no momento do envio para ficar visivel ao atendente.
  const [direitoCustom, setDireitoCustom] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);
  const [otpInfo, setOtpInfo] = useState(null);
  // Org resolvida a partir do slug. Quando vem pelo fluxo legado
  // (organizacaoIdProp), so guardamos o id — sem nome/municipio ate o form.
  const [org, setOrg] = useState(organizacaoIdProp ? { id: organizacaoIdProp, nome: null } : null);
  const [carregandoOrg, setCarregandoOrg] = useState(!!slug);
  const [orgErro, setOrgErro] = useState('');

  // Resolve o slug para id + nome + municipio no mount.
  useEffect(() => {
    if (!slug) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/dsar/publico/org/${encodeURIComponent(slug)}`);
        if (!cancelado) setOrg(res.data);
      } catch (err) {
        if (!cancelado) setOrgErro(err.response?.data?.erro || 'Organizacao nao encontrada');
      } finally {
        if (!cancelado) setCarregandoOrg(false);
      }
    })();
    return () => { cancelado = true; };
  }, [slug]);

  const solicitarOTP = async (e) => {
    e.preventDefault();
    if (!form.titularNome || !form.titularEmail || !form.tipoDireito || !form.descricao) {
      return setErro('Preencha todos os campos obrigatorios');
    }
    if (form.tipoDireito === 'OUTRO' && !direitoCustom.trim()) {
      return setErro('Descreva qual direito voce deseja exercer');
    }
    if (!consentimento) {
      return setErro('Voce precisa confirmar o consentimento LGPD para continuar');
    }
    if (!org?.id) {
      return setErro('Organizacao nao identificada');
    }
    setLoading(true);
    setErro('');
    try {
      // Quando o titular escolhe "Outro", prependa o direito descrito na
      // descricao para dar contexto claro ao responsavel da organizacao.
      const descricaoFinal = form.tipoDireito === 'OUTRO'
        ? `[Direito: ${direitoCustom.trim()}]\n\n${form.descricao}`
        : form.descricao;
      const res = await axios.post(`${API}/dsar/publico/solicitar-otp`, {
        ...form, descricao: descricaoFinal, organizacaoId: org.id
      });
      setOtpInfo(res.data);
      setEtapa('otp');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao solicitar codigo. Tente novamente.');
    }
    setLoading(false);
  };

  const confirmarOTP = async (e) => {
    e.preventDefault();
    if (!codigo || codigo.length < 6) {
      return setErro('Informe o codigo de 6 digitos recebido por email');
    }
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/dsar/publico/confirmar-otp`, {
        titularEmail: form.titularEmail,
        codigo
      });
      setResultado(res.data);
      setEtapa('sucesso');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Codigo invalido ou expirado.');
    }
    setLoading(false);
  };

  // Header com nome + (opcional) logo/municipio da camara. So aparece
  // quando temos o nome resolvido (slug); no fluxo legado (organizacaoId)
  // fica sem header especifico da org.
  const OrgHeader = () => {
    if (!org?.nome) return null;
    return (
      <div className="login-header">
        {org.logoBase64 && (
          <img src={org.logoBase64} alt={org.nome} style={{ maxHeight: 64, marginBottom: 8 }} />
        )}
        <h1 className="login-title">{org.nome}</h1>
        {org.municipio && <p className="login-subtitle">{org.municipio}</p>}
      </div>
    );
  };

  // Loading / erro ao resolver slug
  if (carregandoOrg) {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="text-muted text-center">Carregando...</div>
        </div>
      </div>
    );
  }
  if (slug && orgErro) {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="alert-error">{orgErro}</div>
          <p className="text-muted text-center">Verifique o link recebido e tente novamente.</p>
        </div>
      </div>
    );
  }

  // ========== Tela 3: sucesso ==========
  if (etapa === 'sucesso' && resultado) {
    return (
      <div className="page-center">
        <div className="login-card">
          <OrgHeader />
          <div className="login-header">
            <div className="login-icon">✓</div>
            <h1 className="login-title">Solicitacao enviada</h1>
            <p className="login-subtitle">Sua solicitacao foi registrada com sucesso</p>
          </div>
          <div className="card mb-16">
            <div className="detail-label">Protocolo</div>
            <div className="detail-value"><strong>{resultado.protocolo}</strong></div>
            <div className="detail-label">Prazo para resposta</div>
            <div className="detail-value">{new Date(resultado.dataLimite).toLocaleDateString('pt-BR')}</div>
          </div>
          <div className="alert-info">{resultado.mensagem}</div>
          <p className="text-muted text-center">Guarde o numero de protocolo para acompanhamento. Uma copia foi enviada ao seu email.</p>
        </div>
      </div>
    );
  }

  // ========== Tela 2: OTP ==========
  if (etapa === 'otp') {
    return (
      <div className="page-center">
        <div className="login-card">
          <OrgHeader />
          <div className="login-header">
            <div className="login-icon">📧</div>
            <h1 className="login-title">Verificacao por email</h1>
            <p className="login-subtitle">Enviamos um codigo de 6 digitos para {form.titularEmail}</p>
          </div>

          {erro && <div className="alert-error">{erro}</div>}

          <form onSubmit={confirmarOTP}>
            <label>Codigo de verificacao</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              required
              style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: 700 }}
            />

            {otpInfo?.expiraEm && (
              <p className="text-muted text-xs text-center mb-16">
                O codigo expira em 10 minutos (ate {new Date(otpInfo.expiraEm).toLocaleTimeString('pt-BR')})
              </p>
            )}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Confirmar e enviar solicitacao'}
            </button>
          </form>

          <p className="text-center mt-16">
            <button
              type="button"
              onClick={() => { setEtapa('form'); setCodigo(''); setErro(''); }}
              className="link-back"
            >
              ← Voltar e corrigir dados
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ========== Tela 1: formulario ==========
  return (
    <div className="page-center">
      <div className="login-card">
        <OrgHeader />
        <div className="login-header">
          <div className="login-icon">🔒</div>
          <h1 className="login-title">Exercer seus direitos</h1>
          <p className="login-subtitle">Lei Geral de Protecao de Dados — Art. 18</p>
        </div>

        {erro && <div className="alert-error">{erro}</div>}

        <form onSubmit={solicitarOTP}>
          <label>Nome completo *</label>
          <input value={form.titularNome} onChange={e => setForm({ ...form, titularNome: e.target.value })} placeholder="Seu nome completo" required />

          <label>CPF *</label>
          <input value={form.titularCpf} onChange={e => setForm({ ...form, titularCpf: e.target.value })} placeholder="000.000.000-00" required />

          <label>E-mail *</label>
          <input type="email" value={form.titularEmail} onChange={e => setForm({ ...form, titularEmail: e.target.value })} placeholder="seu@email.com" required />

          <label>Qual direito deseja exercer? *</label>
          <select value={form.tipoDireito} onChange={e => setForm({ ...form, tipoDireito: e.target.value })} required>
            <option value="">Selecione...</option>
            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {form.tipoDireito === 'OUTRO' && (
            <>
              <label>Descreva o direito que deseja exercer *</label>
              <input
                value={direitoCustom}
                onChange={e => setDireitoCustom(e.target.value)}
                placeholder="Ex: consulta sobre base legal do tratamento"
                maxLength={200}
                required
              />
            </>
          )}

          <label>Descreva seu pedido *</label>
          <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={4} placeholder="Descreva com detalhes o que deseja..." required />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontWeight: 'normal', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={consentimento}
              onChange={e => setConsentimento(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span className="text-sm">
              Autorizo o tratamento dos meus dados pessoais (nome, CPF e email) exclusivamente para analise e resposta a esta solicitacao, nos termos da LGPD (Lei 13.709/2018, Art. 7, I e IX). *
            </span>
          </label>

          <button className="btn-primary mt-16" type="submit" disabled={loading || !consentimento}>
            {loading ? 'Enviando...' : 'Receber codigo de verificacao'}
          </button>
        </form>

        <p className="text-muted text-xs text-center mt-16">
          Para sua seguranca, enviaremos um codigo de 6 digitos ao seu email antes de registrar a solicitacao.
        </p>
      </div>
    </div>
  );
}
