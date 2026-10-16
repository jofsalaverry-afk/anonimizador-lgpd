import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import Historico from './Historico';

const CAMPOS = [
  ['encarregadoNome', 'Nome do encarregado (DPO)'],
  ['encarregadoEmail', 'E-mail público do encarregado'],
  ['encarregadoTelefone', 'Telefone'],
  ['enderecoSede', 'Endereço da sede'],
  ['municipio', 'Município'],
  ['uf', 'UF']
];

// Dados do encarregado e da sede: aparecem na pagina publica e nas minutas.
export default function DadosEncarregado({ token, usuario }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [versao, setVersao] = useState(0);
  const [mostrarHist, setMostrarHist] = useState(false);
  const podeEditar = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);

  useEffect(() => {
    axios.get(`${API}/organizacao/dados`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setDados(r.data)).catch(err => setErro(err.response?.data?.erro || 'Erro ao carregar dados'));
  }, [token]);

  const salvar = async () => {
    setErro(''); setMsg('');
    try {
      const corpo = Object.fromEntries(CAMPOS.map(([c]) => [c, dados[c] || '']));
      const r = await axios.put(`${API}/organizacao/dados`, corpo, { headers: { Authorization: `Bearer ${token}` } });
      setDados(r.data);
      setVersao(v => v + 1);
      setMsg('Dados salvos.');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar');
    }
  };

  if (!dados) return erro ? <div className="alert-error mb-16">{erro}</div> : null;

  return (
    <div className="card mb-16">
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Encarregado e dados públicos</h2>
      <p className="text-sm text-muted mb-12">Usados na página pública de transparência e nas minutas geradas (art. 41 da LGPD: identidade e contato do encarregado divulgados publicamente).</p>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      {msg && <div className="alert-success mb-8">{msg}</div>}
      <div className="form-grid">
        {CAMPOS.map(([c, rotulo]) => (
          <div key={c} className="form-group">
            <label>{rotulo}</label>
            <input value={dados[c] || ''} disabled={!podeEditar} maxLength={c === 'uf' ? 2 : undefined}
              onChange={e => setDados({ ...dados, [c]: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="btn-row mt-8">
        {podeEditar && <button className="btn-primary btn-sm" onClick={salvar}>Salvar</button>}
        <button className="btn-ghost btn-sm" onClick={() => setMostrarHist(!mostrarHist)}>{mostrarHist ? 'Ocultar histórico' : 'Histórico'}</button>
      </div>
      {mostrarHist && <div className="mt-8"><Historico token={token} entidade="ORGANIZACAO" registroId={usuario.organizacaoId} versao={versao} /></div>}
    </div>
  );
}
