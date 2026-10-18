import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';
import CampoSenha from './CampoSenha';

export const SENHA_MIN = 10;

// Nova senha + confirmacao (primeiro acesso, link de recuperacao e troca).
export function CamposNovaSenha({ nova, setNova, confirma, setConfirma }) {
  return (
    <>
      <label>Nova senha (mínimo {SENHA_MIN} caracteres)</label>
      <CampoSenha value={nova} onChange={e => setNova(e.target.value)} required autoComplete="new-password" />
      <label>Repita a nova senha</label>
      <CampoSenha value={confirma} onChange={e => setConfirma(e.target.value)} required autoComplete="new-password" />
    </>
  );
}

export function erroLocalSenha(nova, confirma) {
  if (nova.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres`;
  if (nova !== confirma) return 'As duas senhas não são iguais';
  return '';
}

// Pagina publica #redefinir-senha/:token (link do e-mail, uso unico, 30 min)
export default function RedefinirSenha({ token }) {
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    const local = erroLocalSenha(nova, confirma);
    if (local) return setErro(local);
    setLoading(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/auth/senha/redefinir`, { token, novaSenha: nova });
      setOk(res.data.mensagem || 'Senha criada. Entre com a nova senha.');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Não foi possível redefinir a senha');
    }
    setLoading(false);
  };

  const irParaLogin = () => { window.location.hash = ''; };

  return (
    <div className="page-center">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo-complidata.png" alt="Complidata" width="240" className="login-logo" />
          <h1 className="login-title">Criar nova senha</h1>
        </div>
        {ok ? (
          <>
            <p className="text-success">{ok}</p>
            <button className="btn-primary" type="button" onClick={irParaLogin}>Ir para o login</button>
          </>
        ) : (
          <form onSubmit={enviar}>
            <CamposNovaSenha nova={nova} setNova={setNova} confirma={confirma} setConfirma={setConfirma} />
            {erro && <p className="text-error">{erro}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar nova senha'}</button>
          </form>
        )}
        {!ok && (
          <p className="text-center mt-16">
            <button type="button" onClick={irParaLogin} className="link-back">← Voltar ao login</button>
          </p>
        )}
      </div>
    </div>
  );
}
