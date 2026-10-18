import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { fmtDiaSP } from '../datas';

// Mesma identidade visual do certificado em PDF (services/certificado.js)
const AZUL = '#1f2a4d';
const DOURADO = '#b08d3c';
const SERIFA = "Georgia, 'Times New Roman', serif";

// Pagina publica #certificado/:codigo — confirma a autenticidade de um
// certificado de treinamento (nome, trilha, carga, data e camara emissora).
export default function VerificarCertificado({ codigo }) {
  const [estado, setEstado] = useState({ carregando: true });

  useEffect(() => {
    axios.get(`${API}/certificado/verificar/${encodeURIComponent(codigo)}`)
      .then(res => setEstado({ dados: res.data }))
      .catch(err => setEstado({ invalido: err.response?.status === 404, erro: err.response?.data?.erro }));
  }, [codigo]);

  const d = estado.dados;
  const org = d?.organizacao;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', maxWidth: 640, width: '100%', border: `1.5px solid ${AZUL}`, outline: `1px solid ${AZUL}`, outlineOffset: -8, padding: '40px 36px', textAlign: 'center', fontFamily: SERIFA, color: '#111827' }}>
        {org?.logo && <img src={org.logo} alt="" style={{ maxHeight: 64, maxWidth: 160, objectFit: 'contain', marginBottom: 10 }} />}
        <div style={{ fontVariant: 'small-caps', letterSpacing: 2, fontSize: 17, color: AZUL }}>{org?.nome || 'Verificação de certificado'}</div>
        <div style={{ fontSize: 14, color: '#4b5563', marginTop: 2 }}>Programa de Capacitação em Proteção de Dados Pessoais</div>
        <div style={{ width: 140, height: 1, background: DOURADO, margin: '18px auto' }} />

        {estado.carregando && <p style={{ color: '#6b7280' }}>Verificando...</p>}

        {d && (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 132, height: 132, borderRadius: '50%', border: '4px solid #15803d', outline: '1.5px solid #15803d', outlineOffset: 4, color: '#15803d', fontSize: 30, fontWeight: 700, letterSpacing: 2, margin: '6px 0 18px' }}>
              ✓ Válido
            </div>
            <div style={{ fontSize: 14, color: '#4b5563' }}>Certificamos que</div>
            <div style={{ fontSize: 28, fontStyle: 'italic', margin: '4px 0 8px' }}>{d.nome}</div>
            <div style={{ fontSize: 16, lineHeight: 1.5 }}>
              concluiu a trilha “{d.trilha}”{d.cargaHoraria ? `, com carga horária de ${d.cargaHoraria}` : ''}, em {fmtDiaSP(d.concluidoEm)}.
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#4b5563', marginTop: 14 }}>Código {d.codigo || codigo}</div>
            <p style={{ fontSize: 13, color: '#4b5563', marginTop: 18, lineHeight: 1.5 }}>
              Este certificado foi emitido pela plataforma Complidata e pode ser conferido a qualquer tempo por este endereço.
            </p>
          </>
        )}
        {estado.invalido && (
          <div style={{ color: '#b91c1c', fontSize: 16, marginTop: 12 }}>
            Certificado não encontrado (código {codigo}). Confira o código impresso no documento.
          </div>
        )}
        {!estado.carregando && !d && !estado.invalido && (
          <div style={{ color: '#b91c1c', marginTop: 12 }}>{estado.erro || 'Não foi possível verificar agora. Tente mais tarde.'}</div>
        )}
      </div>
    </div>
  );
}
