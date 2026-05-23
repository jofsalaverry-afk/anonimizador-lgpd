import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import PesquisaMetricas from './PesquisaMetricas';

// Página pública de divulgação de métricas — linkada do portal Plone
// da câmara (PNTP TCE/RS 15.6 exige divulgação visível).
// Sem login, sem chrome de painel autenticado. Mobile-first.
export default function PesquisaResultadosPublicos({ slug }) {
  const [org, setOrg] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!slug) {
      setErro('Slug não informado');
      setCarregando(false);
      return;
    }
    (async () => {
      try {
        const res = await axios.get(`${API}/pesquisa/publico/org/${encodeURIComponent(slug)}`);
        setOrg(res.data);
      } catch (err) {
        setErro(err.response?.data?.erro || 'Organização não encontrada');
      }
      setCarregando(false);
    })();
  }, [slug]);

  if (carregando) {
    return (
      <div className="page-center">
        <div className="text-muted">Carregando...</div>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="page-center">
        <div className="login-card">
          <div className="alert-error">{erro}</div>
          <p className="text-muted text-center">Verifique o link recebido e tente novamente.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ textAlign: 'center', marginBottom: 24 }}>
        {org?.logoBase64 && (
          <img src={org.logoBase64} alt={org.nome} style={{ maxHeight: 72, marginBottom: 8 }} />
        )}
        <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>{org?.nome}</h1>
        {org?.municipio && <p className="text-muted" style={{ margin: 0 }}>{org.municipio}</p>}
        <h2 style={{ marginTop: 24, fontSize: 18, color: '#475569', fontWeight: 500 }}>
          Pesquisa de Satisfação — Resultados Públicos
        </h2>
        <p className="text-muted text-sm">PNTP TCE/RS item 15.6 — divulgação obrigatória</p>
      </header>

      <PesquisaMetricas slug={slug} publico hideHeader />

      <footer className="text-muted text-xs text-center mt-16" style={{ paddingTop: 24, borderTop: '1px solid #e2e8f0' }}>
        <p>Pesquisa anônima — sem coleta de nome, email ou identificação do respondente.</p>
        <p>Para enviar sua avaliação, acesse a <a href={`#pesquisa/${slug}`}>página da pesquisa</a>.</p>
      </footer>
    </div>
  );
}
