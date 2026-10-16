import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import CampoSenha from './CampoSenha';
import Historico from './Historico';

export const PERFIS = [
  ['ENCARREGADO_LGPD', 'DPO (Encarregado)'],
  ['GESTOR', 'Gestor'],
  ['OPERADOR', 'Operador'],
  ['AUDITOR', 'Auditor (somente leitura)'],
  ['TREINANDO', 'Treinando (só treinamentos)']
];
const VAZIO = { nome: '', email: '', senha: '', perfil: 'OPERADOR' };

// Gestao de usuarios da propria organizacao (Gestor/DPO).
export default function UsuariosOrganizacao({ token, usuario }) {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState(null);
  const [historicoDe, setHistoricoDe] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/usuarios/gestao`, { headers: { Authorization: `Bearer ${token}` } });
      setUsuarios(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar usuários');
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (fn, sucesso) => {
    setErro(''); setMsg('');
    try { await fn(); setMsg(sucesso); await carregar(); return true; } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar'); return false; }
  };

  const criar = async () => {
    if (await executar(() => axios.post(`${API}/usuarios`, form, { headers }), `Usuário ${form.email} criado. Informe a senha inicial a ele por um canal seguro.`)) setForm(null);
  };

  return (
    <div>
      <div className="page-header">
        {!form && <button className="btn-primary btn-sm" onClick={() => setForm(VAZIO)}>+ Novo usuário</button>}
      </div>
      {erro && <div className="alert-error mb-12">{erro}</div>}
      {msg && <div className="alert-success mb-12">{msg}</div>}

      {form && (
        <div className="card mb-16">
          <div className="card-header">Novo usuário</div>
          <div className="form-grid mb-8">
            <div className="form-group"><label>Nome</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="form-group"><label>E-mail</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-group"><label>Senha inicial (mín. 8)</label><CampoSenha value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} /></div>
            <div className="form-group">
              <label>Perfil</label>
              <select value={form.perfil} onChange={e => setForm({ ...form, perfil: e.target.value })}>
                {PERFIS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn-primary btn-sm" onClick={criar}>Criar</button>
            <button className="btn-secondary btn-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card card-flush">
        <table className="table">
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>MFA</th><th>Último acesso</th><th>Situação</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {usuarios.map(u => {
              const eu = u.id === usuario?.id;
              return [
                <tr key={u.id}>
                  <td>{u.nome}{eu && <span className="badge badge-info" style={{ marginLeft: 6 }}>você</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.perfil} disabled={eu} style={{ width: 'auto', marginBottom: 0 }}
                      onChange={e => executar(() => axios.patch(`${API}/usuarios/${u.id}/perfil`, { perfil: e.target.value }, { headers }), 'Perfil alterado.')}>
                      {PERFIS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td><span className={u.mfaAtivo ? 'badge badge-success' : 'badge badge-muted'}>{u.mfaAtivo ? 'ativo' : 'não'}</span></td>
                  <td className="text-xs">{u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString('pt-BR') : 'nunca'}</td>
                  <td><span className={u.ativo ? 'badge badge-success' : 'badge badge-danger'}>{u.ativo ? 'ativo' : 'desativado'}</span></td>
                  <td>
                    <div className="btn-row">
                      {!eu && (
                        <button className={u.ativo ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                          onClick={() => executar(() => axios.patch(`${API}/usuarios/${u.id}/ativo`, { ativo: !u.ativo }, { headers }), u.ativo ? 'Usuário desativado.' : 'Usuário reativado.')}>
                          {u.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                      )}
                      <button className="btn-ghost btn-sm" onClick={() => setHistoricoDe(historicoDe === u.id ? null : u.id)}>Histórico</button>
                    </div>
                  </td>
                </tr>,
                historicoDe === u.id && (
                  <tr key={`${u.id}-h`}><td colSpan={7}><Historico token={token} entidade="USUARIO" registroId={u.id} /></td></tr>
                )
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-8">Usuário desativado não consegue mais entrar; uma sessão já aberta expira em até 8 horas.</p>
    </div>
  );
}
