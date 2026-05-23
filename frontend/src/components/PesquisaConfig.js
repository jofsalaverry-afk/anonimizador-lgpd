import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

export default function PesquisaConfig({ token, usuario, onVoltar }) {
  const [setores, setSetores] = useState([]);
  const [novoSetor, setNovoSetor] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const podeEditar = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/pesquisa/setores`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSetores(res.data.setores || []);
      } catch (err) {
        setErro(err.response?.data?.erro || 'Erro ao carregar setores');
      }
      setLoading(false);
    })();
  }, [token]);

  const adicionar = () => {
    const s = novoSetor.trim();
    if (!s) return;
    if (setores.includes(s)) {
      setErro('Esse setor já existe');
      return;
    }
    if (s.length > 80) {
      setErro('Setor deve ter no máximo 80 caracteres');
      return;
    }
    setSetores([...setores, s]);
    setNovoSetor('');
    setErro('');
  };

  const remover = (s) => {
    setSetores(setores.filter(x => x !== s));
  };

  const salvar = async () => {
    if (setores.length === 0) {
      setErro('Informe ao menos um setor');
      return;
    }
    setSalvando(true);
    setErro('');
    setMsg('');
    try {
      const res = await axios.put(`${API}/pesquisa/setores`, { setores }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSetores(res.data.setores);
      setMsg('Setores atualizados.');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar');
    }
    setSalvando(false);
  };

  if (loading) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Setores da pesquisa</h2>
        <button onClick={onVoltar} className="btn-ghost btn-sm">← Voltar</button>
      </div>

      <p className="text-muted">
        Estes setores aparecem no formulário público que o cidadão preenche. Personalize para refletir a estrutura da sua organização.
      </p>

      {erro && <div className="alert-error">{erro}</div>}
      {msg && <div className="alert-info">{msg}</div>}

      <div className="card mb-16">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {setores.map(s => (
            <li key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span>{s}</span>
              {podeEditar && (
                <button onClick={() => remover(s)} className="btn-ghost btn-sm" title="Remover">✕</button>
              )}
            </li>
          ))}
          {setores.length === 0 && <li className="text-muted">Nenhum setor cadastrado.</li>}
        </ul>
      </div>

      {podeEditar ? (
        <>
          <div className="filters">
            <input
              value={novoSetor}
              onChange={e => setNovoSetor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionar()}
              placeholder="Ex: Tesouraria"
              maxLength={80}
              style={{ flex: 1 }}
            />
            <button onClick={adicionar} className="btn-ghost btn-sm">+ Adicionar</button>
          </div>
          <button onClick={salvar} className="btn-primary mt-16" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </>
      ) : (
        <p className="text-muted text-sm">
          Apenas Gestor ou DPO podem editar a lista de setores.
        </p>
      )}
    </div>
  );
}
