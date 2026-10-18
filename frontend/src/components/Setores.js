import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import Historico from './Historico';

// Cadastro de setores da organizacao (usado no ROPA). Edicao so para
// Gestor/DPO; os demais perfis veem a lista.
export default function Setores({ token, usuario }) {
  const [setores, setSetores] = useState([]);
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome }
  const [historicoDe, setHistoricoDe] = useState(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState('');
  const podeEditar = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/setores`, { headers: { Authorization: `Bearer ${token}` } });
      setSetores(res.data);
      setVersao(v => v + 1);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar setores');
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const executar = async (fn) => {
    setErro('');
    try { await fn(); await carregar(); return true; } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar setor'); return false; }
  };
  const headers = { Authorization: `Bearer ${token}` };

  const criar = async () => {
    if (!novo.trim()) return;
    if (await executar(() => axios.post(`${API}/setores`, { nome: novo }, { headers }))) setNovo('');
  };
  const renomear = async () => {
    if (await executar(() => axios.put(`${API}/setores/${editando.id}`, { nome: editando.nome }, { headers }))) setEditando(null);
  };
  const alternarAtivo = (s) => executar(() => axios.put(`${API}/setores/${s.id}`, { ativo: !s.ativo }, { headers }));

  return (
    <div className="card mb-16">
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Setores</h2>
      <p className="text-sm text-muted mb-12">Setores responsáveis pelos tratamentos do ROPA.</p>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      {setores.length === 0 && <p className="text-muted mb-12">Nenhum setor cadastrado.</p>}
      {setores.map(s => (
        <div key={s.id} style={{ borderTop: '1px solid #eef0f4', padding: '8px 0' }}>
          <div className="flex-between">
            {editando?.id === s.id ? (
              <div className="flex-center gap-8" style={{ flex: 1 }}>
                <input value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} style={{ marginBottom: 0 }} />
                <button className="btn-primary btn-sm" onClick={renomear}>Salvar</button>
                <button className="btn-secondary btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            ) : (
              <span>{s.nome} {!s.ativo && <span className="badge badge-muted">inativo</span>}</span>
            )}
            {editando?.id !== s.id && (
              <div className="btn-row">
                {podeEditar && <button className="btn-ghost btn-sm" onClick={() => setEditando({ id: s.id, nome: s.nome })}>Renomear</button>}
                {podeEditar && <button className="btn-ghost btn-sm" onClick={() => alternarAtivo(s)}>{s.ativo ? 'Desativar' : 'Reativar'}</button>}
                <button className="btn-ghost btn-sm" onClick={() => setHistoricoDe(historicoDe === s.id ? null : s.id)}>Histórico</button>
              </div>
            )}
          </div>
          {historicoDe === s.id && <div className="mt-8"><Historico token={token} entidade="SETOR" registroId={s.id} versao={versao} /></div>}
        </div>
      ))}
      {podeEditar && (
        <div className="flex-center gap-8 mt-8">
          <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Ex: Recursos Humanos" style={{ marginBottom: 0 }}
            onKeyDown={e => { if (e.key === 'Enter') criar(); }} />
          <button className="btn-primary btn-sm" onClick={criar}>+ Adicionar</button>
        </div>
      )}
    </div>
  );
}
