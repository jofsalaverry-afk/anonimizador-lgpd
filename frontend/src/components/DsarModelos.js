import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import Historico from './Historico';

const TIPO_LABEL = {
  CONFIRMACAO: 'Confirmação de tratamento', ACESSO: 'Acesso aos dados', CORRECAO: 'Correção',
  ANONIMIZACAO: 'Anonimização/bloqueio/eliminação', PORTABILIDADE: 'Portabilidade', ELIMINACAO: 'Eliminação',
  INFORMACAO: 'Informação sobre compartilhamento', REVOGACAO: 'Revogação do consentimento',
  OPOSICAO: 'Oposição', PETICAO: 'Petição à ANPD', OUTRO: 'Outro'
};
const VAZIO = { tipoDireito: 'ACESSO', titulo: '', conteudo: '', padrao: false };

// CRUD dos modelos de resposta DSAR. Todos veem; Gestor/DPO editam.
export default function DsarModelos({ token, usuario }) {
  const [modelos, setModelos] = useState([]);
  const [form, setForm] = useState(null); // null = fechado; { id?, ...campos }
  const [historicoDe, setHistoricoDe] = useState(null);
  const [erro, setErro] = useState('');
  const podeEditar = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);
  const headers = { Authorization: `Bearer ${token}` };

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/dsar/modelos`, { headers: { Authorization: `Bearer ${token}` } });
      setModelos(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar modelos');
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    setErro('');
    try {
      const { id, ...corpo } = form;
      if (id) await axios.put(`${API}/dsar/modelos/${id}`, corpo, { headers });
      else await axios.post(`${API}/dsar/modelos`, corpo, { headers });
      setForm(null);
      await carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar modelo');
    }
  };

  const excluir = async (m) => {
    if (!window.confirm(`Excluir o modelo "${m.titulo}"? O texto fica guardado no histórico.`)) return;
    try {
      await axios.delete(`${API}/dsar/modelos/${m.id}`, { headers });
      await carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao excluir modelo');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Modelos de resposta</h2>
        {podeEditar && !form && <button className="btn-primary btn-sm" onClick={() => setForm(VAZIO)}>+ Novo modelo</button>}
      </div>
      {erro && <div className="alert-error mb-12">{erro}</div>}
      <div className="alert-info mb-16">
        Use as variáveis <code>{'{nome_titular}'}</code>, <code>{'{protocolo}'}</code> e <code>{'{nome_organizacao}'}</code>.
        Elas são trocadas automaticamente quando o modelo é usado em uma solicitação.
      </div>

      {form && (
        <div className="card mb-16">
          <div className="card-header">{form.id ? 'Editar modelo' : 'Novo modelo'}</div>
          <div className="form-grid mb-8">
            <div className="form-group">
              <label>Direito</label>
              <select value={form.tipoDireito} onChange={e => setForm({ ...form, tipoDireito: e.target.value })}>
                {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Título</label>
              <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
            </div>
          </div>
          <label>Texto</label>
          <textarea rows={8} value={form.conteudo} onChange={e => setForm({ ...form, conteudo: e.target.value })}
            placeholder={'Prezado(a) {nome_titular},\n\nEm atenção à solicitação de protocolo {protocolo}, a {nome_organizacao} informa...'} />
          <div className="btn-row mt-8">
            <button className="btn-primary btn-sm" onClick={salvar}>Salvar</button>
            <button className="btn-secondary btn-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {modelos.length === 0 ? (
        <div className="card empty-state"><p>Nenhum modelo cadastrado.</p></div>
      ) : modelos.map(m => (
        <div key={m.id} className="card mb-12">
          <div className="flex-between mb-8">
            <div>
              <strong>{m.titulo}</strong> <span className="badge badge-purple">{TIPO_LABEL[m.tipoDireito] || m.tipoDireito}</span>
            </div>
            <div className="btn-row">
              {podeEditar && <button className="btn-ghost btn-sm" onClick={() => setForm({ id: m.id, tipoDireito: m.tipoDireito, titulo: m.titulo, conteudo: m.conteudo, padrao: m.padrao })}>Editar</button>}
              {podeEditar && <button className="btn-danger btn-sm" onClick={() => excluir(m)}>Excluir</button>}
              <button className="btn-ghost btn-sm" onClick={() => setHistoricoDe(historicoDe === m.id ? null : m.id)}>Histórico</button>
            </div>
          </div>
          <div className="text-sm" style={{ whiteSpace: 'pre-wrap', color: '#475569' }}>{m.conteudo}</div>
          {historicoDe === m.id && <div className="mt-8"><Historico token={token} entidade="MODELO_DSAR" registroId={m.id} /></div>}
        </div>
      ))}
    </div>
  );
}
