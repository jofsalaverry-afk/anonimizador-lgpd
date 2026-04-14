import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

// Os 9 direitos do Art. 18 da LGPD (Lei 13.709/2018). OUTRO abre um
// campo livre para o titular descrever um direito especifico nao coberto
// pelos itens padrao — o texto e concatenado no inicio da descricao
// para o responsavel da camara ter contexto claro.
const TIPO_OPTIONS = [
  { value: 'CONFIRMACAO', label: 'Confirmação de existência de tratamento' },
  { value: 'ACESSO', label: 'Acesso aos dados' },
  { value: 'CORRECAO', label: 'Correção de dados incompletos, inexatos ou desatualizados' },
  { value: 'ANONIMIZACAO', label: 'Anonimização, bloqueio ou eliminação de dados desnecessários' },
  { value: 'PORTABILIDADE', label: 'Portabilidade dos dados' },
  { value: 'ELIMINACAO', label: 'Eliminação dos dados tratados com consentimento' },
  { value: 'INFORMACAO', label: 'Informação sobre compartilhamento com terceiros' },
  { value: 'REVOGACAO', label: 'Revogação do consentimento' },
  { value: 'OUTRO', label: 'Outro (descrever)' }
];

const SETORES_PESQUISA = ['Protocolo', 'RH', 'Financeiro', 'Juridico', 'Presidencia', 'Outro'];

// Render interno do formulario de pesquisa de satisfacao — usa o slug
// ja resolvido (org + OrgHeader) do componente pai e trata o proprio
// estado e submissao. Nao passa pelo fluxo de OTP.
function PesquisaSatisfacao({ slug, org, OrgHeader }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [avaliacao, setAvaliacao] = useState(0);
  const [setor, setSetor] = useState('');
  const [comentario, setComentario] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [enviada, setEnviada] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    if (!avaliacao) return setErro('Selecione uma avaliação de 1 a 5 estrelas');
    if (!setor) return setErro('Selecione o setor atendido');
    if (!comentario.trim()) return setErro('O comentário é obrigatório');
    setLoading(true);
    setErro('');
    try {
      await axios.post(`${API}/dsar/publico/pesquisa`, {
        slug,
        titularNome: nome,
        titularEmail: email,
        avaliacao,
        setor,
        comentario
      });
      setEnviada(true);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao enviar pesquisa. Tente novamente.');
    }
    setLoading(false);
  };

  if (enviada) {
    return (
      <div className="page-center">
        <div className="login-card">
          <OrgHeader />
          <div className="login-header">
            <div className="login-icon">💜</div>
            <h1 className="login-title">Obrigado!</h1>
            <p className="login-subtitle">Sua avaliação foi registrada com sucesso.</p>
          </div>
          <div className="alert-info">
            Sua opinião ajuda a {org?.nome || 'câmara'} a melhorar o atendimento ao cidadão. Obrigado por dedicar seu tempo.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-center">
      <div className="login-card">
        <OrgHeader />
        <div className="login-header">
          <div className="login-icon">⭐</div>
          <h1 className="login-title">Sua opinião importa</h1>
          <p className="login-subtitle">Ajude a melhorar os serviços da câmara</p>
        </div>

        {erro && <div className="alert-error">{erro}</div>}

        <form onSubmit={enviar}>
          <label>Nome (opcional)</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" maxLength={200} />

          <label>E-mail (opcional)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />

          <label>Avaliação geral *</label>
          <div style={{ display: 'flex', gap: 8, fontSize: 32, marginBottom: 16, userSelect: 'none' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                onClick={() => setAvaliacao(n)}
                style={{ cursor: 'pointer', color: n <= avaliacao ? '#f59e0b' : '#cbd5e1', transition: 'color 0.15s' }}
                role="button"
                aria-label={`${n} estrelas`}
              >
                ★
              </span>
            ))}
            {avaliacao > 0 && <span className="text-muted text-sm" style={{ alignSelf: 'center', marginLeft: 8 }}>{avaliacao}/5</span>}
          </div>

          <label>Setor atendido *</label>
          <select value={setor} onChange={e => setSetor(e.target.value)} required>
            <option value="">Selecione...</option>
            {SETORES_PESQUISA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label>Comentário *</label>
          <textarea
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            rows={5}
            placeholder="Conte sua experiência, sugestões de melhoria, elogios..."
            required
            maxLength={2000}
          />

          <button className="btn-primary mt-16" type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </form>

        <p className="text-muted text-xs text-center mt-16">
          Esta pesquisa não coleta dados sensíveis. Nome e email são opcionais e usados apenas para eventual retorno, caso você preencha.
        </p>
      </div>
    </div>
  );
}

export default function SolicitarDireitos({ slug, organizacaoId: organizacaoIdProp, modo = 'dsar' }) {
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
        if (!cancelado) setOrgErro(err.response?.data?.erro || 'Organização não encontrada');
      } finally {
        if (!cancelado) setCarregandoOrg(false);
      }
    })();
    return () => { cancelado = true; };
  }, [slug]);

  const solicitarOTP = async (e) => {
    e.preventDefault();
    if (!form.titularNome || !form.titularEmail || !form.tipoDireito || !form.descricao) {
      return setErro('Preencha todos os campos obrigatórios');
    }
    if (form.tipoDireito === 'OUTRO' && !direitoCustom.trim()) {
      return setErro('Descreva qual direito você deseja exercer');
    }
    if (!consentimento) {
      return setErro('Você precisa confirmar o consentimento LGPD para continuar');
    }
    if (!org?.id) {
      return setErro('Organização não identificada');
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
      setErro(err.response?.data?.erro || 'Erro ao solicitar código. Tente novamente.');
    }
    setLoading(false);
  };

  const confirmarOTP = async (e) => {
    e.preventDefault();
    if (!codigo || codigo.length < 6) {
      return setErro('Informe o código de 6 dígitos recebido por email');
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
      setErro(err.response?.data?.erro || 'Código inválido ou expirado.');
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

  // Modo pesquisa de satisfacao — renderiza um formulario totalmente
  // diferente, sem OTP e sem CPF. Ja temos o slug resolvido acima.
  if (modo === 'pesquisa') {
    return <PesquisaSatisfacao slug={slug} org={org} OrgHeader={OrgHeader} />;
  }

  // ========== Tela 3: sucesso ==========
  if (etapa === 'sucesso' && resultado) {
    return (
      <div className="page-center">
        <div className="login-card">
          <OrgHeader />
          <div className="login-header">
            <div className="login-icon">✓</div>
            <h1 className="login-title">Solicitação enviada</h1>
            <p className="login-subtitle">Sua solicitação foi registrada com sucesso</p>
          </div>
          <div className="card mb-16">
            <div className="detail-label">Protocolo</div>
            <div className="detail-value"><strong>{resultado.protocolo}</strong></div>
            <div className="detail-label">Prazo para resposta</div>
            <div className="detail-value">{new Date(resultado.dataLimite).toLocaleDateString('pt-BR')}</div>
          </div>
          <div className="alert-info">{resultado.mensagem}</div>
          <p className="text-muted text-center">Guarde o número de protocolo para acompanhamento. Uma cópia foi enviada ao seu email.</p>
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
            <h1 className="login-title">Verificação por email</h1>
            <p className="login-subtitle">Enviamos um código de 6 dígitos para {form.titularEmail}</p>
          </div>

          {erro && <div className="alert-error">{erro}</div>}

          <form onSubmit={confirmarOTP}>
            <label>Código de verificação</label>
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

            {otpInfo?.expiraEm && (
              <p className="text-muted text-xs text-center mb-16">
                O código expira em 10 minutos (até {new Date(otpInfo.expiraEm).toLocaleTimeString('pt-BR')})
              </p>
            )}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Confirmar e enviar solicitação'}
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
          <p className="login-subtitle">Lei Geral de Proteção de Dados — Art. 18</p>
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
              Autorizo o tratamento dos meus dados pessoais (nome, CPF e email) exclusivamente para análise e resposta a esta solicitação, nos termos da LGPD (Lei 13.709/2018, Art. 7, I e IX). *
            </span>
          </label>

          <button className="btn-primary mt-16" type="submit" disabled={loading || !consentimento}>
            {loading ? 'Enviando...' : 'Receber código de verificação'}
          </button>
        </form>

        <p className="text-muted text-xs text-center mt-16">
          Para sua segurança, enviaremos um código de 6 dígitos ao seu email antes de registrar a solicitação.
        </p>
      </div>
    </div>
  );
}
