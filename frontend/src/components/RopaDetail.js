import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

const BASE_LEGAL_LABEL = {
  CONSENTIMENTO: 'Consentimento',
  OBRIGACAO_LEGAL: 'Obrigação Legal',
  EXECUCAO_CONTRATO: 'Execução de Contrato',
  INTERESSE_LEGITIMO: 'Interesse Legítimo',
  PROTECAO_VIDA: 'Proteção à Vida',
  TUTELA_SAUDE: 'Tutela da Saúde',
  INTERESSE_PUBLICO: 'Interesse Público',
  EXERCICIO_DIREITOS: 'Exercício de Direitos'
};

function Campo({ label, valor }) {
  if (!valor && valor !== 0) return null;
  return (
    <div className="mb-8">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{valor}</div>
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

  if (loading) return <p className="text-muted">Carregando...</p>;
  if (!tratamento) return <p className="text-error">Tratamento não encontrado.</p>;

  return (
    <div>
      <div className="page-header mb-16">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{tratamento.nome}</h2>
        <span className={tratamento.ativo ? 'badge badge-success' : 'badge badge-danger'}>
          {tratamento.ativo ? 'ativo' : 'inativo'}
        </span>
      </div>

      <div className="card mb-16">
        <div className="grid-2">
          <div>
            <Campo label="Finalidade" valor={tratamento.finalidade} />
            <Campo label="Base legal" valor={BASE_LEGAL_LABEL[tratamento.baseLegal] || tratamento.baseLegal} />
            <Campo label="Retenção" valor={tratamento.retencaoDias ? `${tratamento.retencaoDias} dias` : null} />
            <Campo label="Forma de descarte" valor={tratamento.formaDescarte} />
          </div>
          <div>
            <Campo label="Medidas de segurança" valor={tratamento.medidasSeguranca} />
            <div className="mb-8">
              <div className="detail-label">Categorias de dados</div>
              <div className="badge-row">
                {(tratamento.categoriasDados || []).map(c => (
                  <span key={c} className="badge badge-purple">{c}</span>
                ))}
                {(tratamento.categoriasDados || []).length === 0 && <span className="text-muted">-</span>}
              </div>
            </div>
            <div className="mb-8">
              <div className="detail-label">Categorias de titulares</div>
              <div className="badge-row">
                {(tratamento.categoriasTitulares || []).map(c => (
                  <span key={c} className="badge badge-success">{c}</span>
                ))}
                {(tratamento.categoriasTitulares || []).length === 0 && <span className="text-muted">-</span>}
              </div>
            </div>
          </div>
        </div>

        {(tratamento.compartilhamentos || []).length > 0 && (
          <div className="card-divider mt-16">
            <div className="detail-label mb-8">Compartilhamentos com terceiros</div>
            {tratamento.compartilhamentos.map((c, i) => (
              <div key={i} className="comp-item">
                <span className="comp-name">{c.terceiroNome}</span>
                {c.terceiroCNPJ && <span className="comp-detail"> ({c.terceiroCNPJ})</span>}
                <span className="comp-detail"> — {c.finalidadeCompartilhamento}</span>
                <span className="comp-country"> [{c.paisDestino}]</span>
              </div>
            ))}
          </div>
        )}

        <div className="card-divider btn-row mt-16">
          <button onClick={() => onEditar(tratamento.id)} className="btn-primary btn-sm">Editar tratamento</button>
          <button onClick={() => setMostrarHistorico(!mostrarHistorico)} className="btn-secondary btn-sm">
            {mostrarHistorico ? 'Ocultar histórico' : `Histórico (${historico.length})`}
          </button>
        </div>
      </div>

      {mostrarHistorico && (
        <div className="card">
          <h3 className="mb-12">Histórico de alterações</h3>
          {historico.length === 0 ? (
            <p className="text-muted">Nenhum histórico registrado.</p>
          ) : (
            <div className="timeline">
              {historico.map((h, i) => {
                const snap = h.snapshot || {};
                return (
                  <div key={h.id} className="timeline-item">
                    <div className={`timeline-dot ${i === 0 ? 'timeline-dot-active' : ''}`} />
                    <div className="timeline-date">
                      {new Date(h.criadoEm).toLocaleString('pt-BR')} — por {h.alteradoPor}
                    </div>
                    <div className="timeline-content">
                      <span className="comp-name">{snap.nome || '?'}</span>
                      {' — '}
                      <span>{BASE_LEGAL_LABEL[snap.baseLegal] || snap.baseLegal || '?'}</span>
                      {snap.categoriasDados && <span className="text-muted"> [{snap.categoriasDados.join(', ')}]</span>}
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
