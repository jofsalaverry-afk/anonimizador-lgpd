import { useState, useEffect } from 'react';

// Aba aberta antes de um deploy continua rodando o JS antigo. A cada 5 min
// e ao voltar para a aba, compara o main.*.js do index.html publicado com o
// que esta carregado; se mudou, mostra a faixa para recarregar.
const INTERVALO_MS = 5 * 60 * 1000;
const RE_MAIN = /\/static\/js\/(main\.[a-z0-9]+\.js)/;

export function scriptCarregado(doc = document) {
  for (const s of doc.querySelectorAll('script[src]')) {
    const m = s.getAttribute('src').match(RE_MAIN);
    if (m) return m[1];
  }
  return null; // ambiente de desenvolvimento: nao ha main.<hash>.js
}

export async function scriptPublicado(buscar = fetch) {
  const r = await buscar(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return null;
  const m = (await r.text()).match(RE_MAIN);
  return m ? m[1] : null;
}

export default function AvisoNovaVersao() {
  const [novaVersao, setNovaVersao] = useState(false);

  useEffect(() => {
    const atual = scriptCarregado();
    if (!atual) return undefined;
    let parado = false;
    const conferir = async () => {
      try {
        const publicado = await scriptPublicado();
        if (!parado && publicado && publicado !== atual) setNovaVersao(true);
      } catch { /* sem rede: tenta de novo depois */ }
    };
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
    const id = setInterval(conferir, INTERVALO_MS);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      parado = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, []);

  if (!novaVersao) return null;
  return (
    <div role="status" style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#1e293b', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
      Nova versão disponível —{' '}
      <button onClick={() => window.location.reload()} style={{ background: 'none', border: 'none', color: '#93c5fd', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>recarregar</button>
    </div>
  );
}
