import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';

const TIPO_OPTIONS = [
  { value: 'ACESSO', label: 'Quero acessar meus dados pessoais' },
  { value: 'CORRECAO', label: 'Quero corrigir dados incorretos' },
  { value: 'ELIMINACAO', label: 'Quero eliminar meus dados' },
  { value: 'PORTABILIDADE', label: 'Quero a portabilidade dos meus dados' },
  { value: 'OPOSICAO', label: 'Quero me opor ao tratamento' },
  { value: 'REVOGACAO', label: 'Quero revogar meu consentimento' },
  { value: 'INFORMACAO', label: 'Quero saber com quem meus dados foram compartilhados' },
  { value: 'PETICAO', label: 'Quero peticionar a ANPD' }
];

export default function SolicitarDireitos({ organizacaoId }) {
  const [form, setForm] = useState({ titularNome: '', titularEmail: '', titularCpf: '', tipoDireito: '', descricao: '' });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    if (!form.titularNome || !form.titularEmail || !form.tipoDireito || !form.descricao) {
      return setErro('Preencha todos os campos obrigatorios');
    }
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/dsar/publico/nova-solicitacao`, {
        ...form, organizacaoId
      });
      setResultado(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao enviar solicitacao. Tente novamente.');
    }
    setLoading(false);
  };

  if (resultado) {
    return (
      <div className="page-center">
        <div className="login-card">
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
          <p className="text-muted text-center">Guarde o numero de protocolo para acompanhamento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-center">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🔒</div>
          <h1 className="login-title">Exercer seus direitos</h1>
          <p className="login-subtitle">Lei Geral de Protecao de Dados — Art. 18</p>
        </div>

        {erro && <div className="alert-error">{erro}</div>}

        <form onSubmit={enviar}>
          <label>Nome completo *</label>
          <input value={form.titularNome} onChange={e => setForm({ ...form, titularNome: e.target.value })} placeholder="Seu nome completo" required />

          <label>E-mail *</label>
          <input type="email" value={form.titularEmail} onChange={e => setForm({ ...form, titularEmail: e.target.value })} placeholder="seu@email.com" required />

          <label>CPF (opcional)</label>
          <input value={form.titularCpf} onChange={e => setForm({ ...form, titularCpf: e.target.value })} placeholder="000.000.000-00" />

          <label>Qual direito deseja exercer? *</label>
          <select value={form.tipoDireito} onChange={e => setForm({ ...form, tipoDireito: e.target.value })} required>
            <option value="">Selecione...</option>
            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label>Descreva seu pedido *</label>
          <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={4} placeholder="Descreva com detalhes o que deseja..." required />

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar solicitacao'}
          </button>
        </form>

        <p className="text-muted text-xs text-center mt-16">
          Seus dados serao tratados exclusivamente para atender esta solicitacao, conforme a LGPD.
        </p>
      </div>
    </div>
  );
}
