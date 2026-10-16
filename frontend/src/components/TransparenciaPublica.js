import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

// Pagina publica #transparencia/:slug — informacao ao titular (art. 9 e
// 23 da LGPD) puxada do ROPA e dos dados do encarregado.
export default function TransparenciaPublica({ slug }) {
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    axios.get(`${API}/transparencia/publico/${encodeURIComponent(slug)}`)
      .then(r => setP(r.data))
      .catch(err => setErro(err.response?.status === 404 ? 'Página não encontrada.' : 'Não foi possível carregar a página agora.'));
  }, [slug]);

  if (erro) return <div className="page-center"><div className="alert-error">{erro}</div></div>;
  if (!p) return <div className="page-center"><p className="text-muted">Carregando...</p></div>;

  const { organizacao: org, encarregado: enc } = p;
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px' }}>
      <header className="mb-24" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {org.logoBase64 && <img src={org.logoBase64} alt="" style={{ maxHeight: 64 }} />}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{org.nome}</h1>
          <div className="text-muted">Proteção de dados pessoais (LGPD){org.municipio ? ` · ${org.municipio}${org.uf ? '/' + org.uf : ''}` : ''}</div>
        </div>
      </header>

      <section className="card mb-16">
        <h2 className="card-header">Encarregado pelo tratamento de dados pessoais</h2>
        {enc.nome ? (
          <p>
            <strong>{enc.nome}</strong><br />
            {enc.email && <>E-mail: <a href={`mailto:${enc.email}`}>{enc.email}</a><br /></>}
            {enc.telefone && <>Telefone: {enc.telefone}<br /></>}
            {p.enderecoSede && <>Endereço: {p.enderecoSede}</>}
          </p>
        ) : <p className="text-muted">Informação em atualização.</p>}
        {p.canalSolicitacao && (
          <a href={p.canalSolicitacao} className="btn-primary btn-sm" style={{ display: 'inline-block', marginTop: 8 }}>Exercer meus direitos como titular</a>
        )}
      </section>

      <section className="card mb-16">
        <h2 className="card-header">Quais dados tratamos e por quê</h2>
        {p.tratamentos.length === 0 ? <p className="text-muted">Informação em atualização.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Atividade</th><th>Finalidade</th><th>Base legal</th><th>Dados</th><th>Titulares</th></tr></thead>
              <tbody>
                {p.tratamentos.map(t => (
                  <tr key={t.nome}>
                    <td><strong>{t.nome}</strong></td>
                    <td>{t.finalidade}</td>
                    <td>{t.baseLegal}</td>
                    <td>{(t.categoriasDados || []).join(', ') || '—'}</td>
                    <td>{(t.categoriasTitulares || []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mb-16">
        <h2 className="card-header">Com quem compartilhamos</h2>
        {p.tratamentos.every(t => t.compartilhamentos.length === 0) ? <p>Não há compartilhamento de dados pessoais registrado.</p> : (
          <ul>
            {p.tratamentos.flatMap(t => t.compartilhamentos.map((c, i) => (
              <li key={`${t.nome}-${i}`} className="mb-8">
                <strong>{c.destinatario}</strong> — {c.finalidade} ({t.nome})
                {c.transferenciaInternacional && <span className="badge badge-warning" style={{ marginLeft: 6 }}>transferência internacional: {c.pais}</span>}
              </li>
            )))}
          </ul>
        )}
      </section>

      <section className="card mb-16">
        <h2 className="card-header">Seus direitos (art. 18 da LGPD)</h2>
        <ul>{p.direitos.map(d => <li key={d}>{d}</li>)}</ul>
      </section>

      <section className="card mb-16">
        <h2 className="card-header">Perguntas frequentes</h2>
        {p.faq.map(f => (
          <details key={f.pergunta} className="mb-8">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{f.pergunta}</summary>
            <p className="mt-8">{f.resposta}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
