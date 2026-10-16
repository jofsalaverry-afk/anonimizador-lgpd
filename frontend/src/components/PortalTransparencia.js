import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

// Configuracao da pagina publica de transparencia: link, trecho HTML para
// o portal e FAQ editavel (Gestor/DPO).
export default function PortalTransparencia({ token, usuario }) {
  const [trecho, setTrecho] = useState(null);
  const [faq, setFaq] = useState([]);
  const [personalizado, setPersonalizado] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const podeEditar = ['GESTOR', 'ENCARREGADO_LGPD'].includes(usuario?.perfil);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/organizacao/trecho-portal`, { headers: h }).then(r => setTrecho(r.data)).catch(err => setErro(err.response?.data?.erro || ''));
    axios.get(`${API}/organizacao/faq`, { headers: h }).then(r => { setFaq(r.data.faq); setPersonalizado(r.data.personalizado); }).catch(() => {});
  }, [token]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(trecho.html);
      setMsg('Trecho HTML copiado. Cole no editor do portal no modo HTML/código-fonte.');
    } catch {
      setMsg('Não foi possível copiar automaticamente. Selecione o texto abaixo e copie.');
    }
  };

  const salvarFaq = async (lista) => {
    setErro(''); setMsg('');
    try {
      const r = await axios.put(`${API}/organizacao/faq`, { faq: lista }, { headers });
      setFaq(r.data.faq);
      setPersonalizado(r.data.personalizado);
      setMsg(lista === null ? 'FAQ padrão restaurado.' : 'FAQ salvo.');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar FAQ');
    }
  };

  const alterar = (i, campo, valor) => setFaq(faq.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  return (
    <div className="card mb-16">
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Página pública de transparência</h2>
      <p className="text-sm text-muted mb-12">Mostra ao cidadão os dados tratados, finalidades, bases legais, compartilhamentos, direitos e o contato do encarregado, a partir do ROPA. Nada interno (responsáveis, setores, riscos, anexos) aparece.</p>
      {erro && <div className="alert-error mb-8">{erro}</div>}
      {msg && <div className="alert-success mb-8">{msg}</div>}

      {trecho && (
        <>
          <div className="mb-8 text-sm">
            Página: <a href={trecho.urlTransparencia} target="_blank" rel="noopener noreferrer">{trecho.urlTransparencia}</a><br />
            Canal do titular: <a href={trecho.urlCanal} target="_blank" rel="noopener noreferrer">{trecho.urlCanal}</a>
          </div>
          <button className="btn-secondary btn-sm mb-8" onClick={copiar}>Copiar trecho HTML para o portal</button>
          <textarea readOnly rows={7} value={trecho.html} style={{ fontFamily: 'monospace', fontSize: 12 }} onFocus={e => e.target.select()} />
        </>
      )}

      <h3 className="mt-16 mb-8" style={{ fontSize: 14 }}>Perguntas frequentes {personalizado ? '(personalizadas)' : '(padrão)'}</h3>
      {faq.map((f, i) => (
        <div key={i} className="mb-12" style={{ borderTop: '1px solid #eef0f4', paddingTop: 8 }}>
          {podeEditar ? (
            <>
              <input value={f.pergunta} onChange={e => alterar(i, 'pergunta', e.target.value)} />
              <textarea rows={2} value={f.resposta} onChange={e => alterar(i, 'resposta', e.target.value)} />
              <button className="btn-ghost btn-sm" onClick={() => setFaq(faq.filter((_, j) => j !== i))}>Remover</button>
            </>
          ) : (
            <><strong>{f.pergunta}</strong><div className="text-sm">{f.resposta}</div></>
          )}
        </div>
      ))}
      {podeEditar && (
        <div className="btn-row">
          <button className="btn-ghost btn-sm" onClick={() => setFaq([...faq, { pergunta: '', resposta: '' }])}>+ Pergunta</button>
          <button className="btn-primary btn-sm" onClick={() => salvarFaq(faq)}>Salvar FAQ</button>
          {personalizado && <button className="btn-secondary btn-sm" onClick={() => salvarFaq(null)}>Restaurar padrão</button>}
        </div>
      )}
    </div>
  );
}
