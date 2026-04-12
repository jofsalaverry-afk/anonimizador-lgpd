import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

const BASE_LEGAL_LABEL = {
  CONSENTIMENTO: 'Consentimento',
  OBRIGACAO_LEGAL: 'Obrigacao Legal',
  EXECUCAO_CONTRATO: 'Execucao de Contrato',
  INTERESSE_LEGITIMO: 'Interesse Legitimo',
  PROTECAO_VIDA: 'Protecao a Vida',
  TUTELA_SAUDE: 'Tutela da Saude',
  INTERESSE_PUBLICO: 'Interesse Publico',
  EXERCICIO_DIREITOS: 'Exercicio de Direitos'
};

function Campo({ label, valor }) {
  if (!valor && valor !== 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1e293b' }}>{valor}</div>
    </div>
  );
}

export default function RopaDetail({ token, tratamentoId, onVoltar, onEditar }) {
  const [tratamento, setTratamento] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, hRes] = await Promise.all([
          axios.get(`${API}/ropa/tratamentos`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API}/ropa/tratamentos/${tratamentoId}/historico`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const t = tRes.data.find(x => x.id === tratamentoId);
        setTratamento(t || null);
        setHistorico(hRes.data);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, [tratamentoId, token]);

  if (loading) return <p style={{ color: '#64748b', fontSize: 13 }}>Carregando...</p>;
  if (!tratamento) return <p style={{ color: '#dc2626', fontSize: 13 }}>Tratamento nao encontrado.</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onVoltar} style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8' }}>← Voltar</button>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{tratamento.nome}</h2>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: tratamento.ativo ? '#dcfce7' : '#fee2e2', color: tratamento.ativo ? '#16a34a' : '#dc2626' }}>
          {tratamento.ativo ? 'ativo' : 'inativo'}
        </span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Campo label="Finalidade" valor={tratamento.finalidade} />
            <Campo label="Base legal" valor={BASE_LEGAL_LABEL[tratamento.baseLegal] || tratamento.baseLegal} />
            <Campo label="Retencao" valor={tratamento.retencaoDias ? `${tratamento.retencaoDias} dias` : null} />
            <Campo label="Forma de descarte" valor={tratamento.formaDescarte} />
          </div>
          <div>
            <Campo label="Medidas de seguranca" valor={tratamento.medidasSeguranca} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>Categorias de dados</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(tratamento.categoriasDados || []).map(c => (
                  <span key={c} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#dbeafe', color: '#1d4ed8' }}>{c}</span>
                ))}
                {(tratamento.categoriasDados || []).length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>-</span>}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>Categorias de titulares</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(tratamento.categoriasTitulares || []).map(c => (
                  <span key={c} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>{c}</span>
                ))}
                {(tratamento.categoriasTitulares || []).length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>-</span>}
              </div>
            </div>
          </div>
        </div>

        {(tratamento.compartilhamentos || []).length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Compartilhamentos com terceiros</div>
            {tratamento.compartilhamentos.map((c, i) => (
              <div key={i} style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                <span style={{ fontWeight: 500 }}>{c.terceiroNome}</span>
                {c.terceiroCNPJ && <span style={{ color: '#64748b' }}> ({c.terceiroCNPJ})</span>}
                <span style={{ color: '#64748b' }}> — {c.finalidadeCompartilhamento}</span>
                <span style={{ color: '#94a3b8' }}> [{c.paisDestino}]</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
          <button onClick={() => onEditar(tratamento.id)} className="btn-primary" style={{ fontSize: 12, padding: '6px 16px' }}>Editar tratamento</button>
          <button onClick={() => setMostrarHistorico(!mostrarHistorico)} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>
            {mostrarHistorico ? 'Ocultar historico' : `Historico (${historico.length})`}
          </button>
        </div>
      </div>

      {mostrarHistorico && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Historico de alteracoes</h3>
          {historico.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>Nenhum historico registrado.</p>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 2, background: '#e2e8f0' }} />
              {historico.map((h, i) => {
                const snap = h.snapshot || {};
                return (
                  <div key={h.id} style={{ marginBottom: 16, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%', background: i === 0 ? '#3b82f6' : '#cbd5e1', border: '2px solid white' }} />
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                      {new Date(h.criadoEm).toLocaleString('pt-BR')} — por {h.alteradoPor}
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', padding: 8, borderRadius: 6 }}>
                      <span style={{ fontWeight: 500 }}>{snap.nome || '?'}</span>
                      {' — '}
                      <span>{BASE_LEGAL_LABEL[snap.baseLegal] || snap.baseLegal || '?'}</span>
                      {snap.categoriasDados && <span style={{ color: '#94a3b8' }}> [{snap.categoriasDados.join(', ')}]</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
