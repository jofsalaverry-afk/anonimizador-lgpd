import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import Anexos from './Anexos';
import Historico from './Historico';
import Descartes from './Descartes';
import { TIPO_SISTEMA_LABEL, BadgeRisco } from './rotulos';
import { rotuloBaseLegal, ROTULO_CAMPO_BASE_LEGAL, textoRetencao } from '../basesLegais';


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
  const [loading, setLoading] = useState(true);
  const [versaoHistorico, setVersaoHistorico] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const tRes = await axios.get(`${API}/ropa/tratamentos`, { headers: { Authorization: `Bearer ${token}` } });
        setTratamento(tRes.data.find(x => x.id === tratamentoId) || null);
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
            <Campo label={ROTULO_CAMPO_BASE_LEGAL} valor={rotuloBaseLegal(tratamento.baseLegal)} />
            <Campo label="Base legal para dados sensíveis (LGPD, art. 11)" valor={rotuloBaseLegal(tratamento.baseLegalSensivel)} />
            <Campo label="Responsável" valor={tratamento.responsavelNome || 'Não designado'} />
            <Campo label="Setor responsável" valor={tratamento.setor?.nome || 'Não informado'} />
            <Campo label="Retenção" valor={tratamento.retencaoDias ? textoRetencao(tratamento.retencaoDias) : null} />
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
            <div className="mb-8">
              <div className="detail-label">Sistemas utilizados</div>
              <div className="badge-row">
                {(tratamento.sistemas || []).map(v => (
                  <span key={v.sistemaId} className="badge badge-info" title={TIPO_SISTEMA_LABEL[v.sistema?.tipo]}>{v.sistema?.nome}</span>
                ))}
                {(tratamento.sistemas || []).length === 0 && <span className="text-muted">-</span>}
              </div>
            </div>
            <Campo label="Outros meios (físico, papel)" valor={tratamento.outrosMeios} />
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
                {c.terceiro && <span style={{ marginLeft: 6 }}><BadgeRisco risco={c.terceiro.risco} /></span>}
              </div>
            ))}
          </div>
        )}

        <div className="card-divider btn-row mt-16">
          <button onClick={() => onEditar(tratamento.id)} className="btn-primary btn-sm">Editar tratamento</button>
        </div>
      </div>

      <Descartes token={token} tratamentoId={tratamento.id} onRegistrado={() => setVersaoHistorico(v => v + 1)} />
      <Anexos token={token} entidade="TRATAMENTO" registroId={tratamento.id} onEnviado={() => setVersaoHistorico(v => v + 1)} />
      <Historico token={token} entidade="TRATAMENTO" registroId={tratamento.id} versao={versaoHistorico} />
    </div>
  );
}
