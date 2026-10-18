import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import Providencias from './Providencias';
import Anexos from './Anexos';
import Historico from './Historico';
import { fmtData, fmtDataHora } from '../datas';
import { normalizarCategorias } from '../basesLegais';
import { TIPO_INCIDENTE_LABEL, NIVEL_LABEL, STATUS_LABEL } from './rotulos';
import { SeloANPD, RISCO_LABEL_INC } from './incidenteRotulos';

function Campo({ rotulo, children }) {
  return (
    <div className="mb-8">
      <div className="detail-label">{rotulo}</div>
      <div className="detail-value">{children || '—'}</div>
    </div>
  );
}

// Tela de leitura do incidente (item 25). Editar abre o formulario.
export default function IncidenteDetail({ token, incidenteId, onVoltar, onEditar }) {
  const [inc, setInc] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/repositorio/incidentes/${incidenteId}`, { headers: { Authorization: `Bearer ${token}` } });
      setInc(res.data);
      setVersao(v => v + 1);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar incidente');
    }
  }, [token, incidenteId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div className="alert-error">{erro}</div>;
  if (!inc) return <p className="text-muted">Carregando...</p>;
  const simulado = inc.tipoRegistro === 'SIMULADO';
  const p = inc.prazoComunicacao;

  return (
    <div>
      <div className="page-header mb-16">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <div className="btn-row">
          <button onClick={() => onEditar(inc.id)} className="btn-primary btn-sm acao-escrita">Editar</button>
        </div>
      </div>

      <div className="card mb-16">
        <div className="flex-between mb-12">
          <h3 className="card-header" style={{ marginBottom: 0 }}>
            {inc.titulo}
            {simulado && <span className="badge badge-info" style={{ marginLeft: 8 }}>simulado</span>}
          </h3>
          <span className="badge badge-muted">{STATUS_LABEL[inc.status] || inc.status}</span>
        </div>
        <div className="form-grid">
          <Campo rotulo="Tipo">{TIPO_INCIDENTE_LABEL[inc.tipoIncidente]}</Campo>
          <Campo rotulo="Severidade">{inc.severidade ? NIVEL_LABEL[inc.severidade] : 'Não classificada'}</Campo>
          <Campo rotulo="Data da ocorrência">{fmtData(inc.dataOcorrencia)}</Campo>
          <Campo rotulo="Registrado no sistema em">{fmtDataHora(inc.dataDescoberta || inc.criadoEm)}</Campo>
          <Campo rotulo="Titulares afetados">{String(inc.qtdTitulares || 0)}</Campo>
          <Campo rotulo="Responsável">{inc.responsavel?.nome}</Campo>
        </div>
        <Campo rotulo="Dados pessoais afetados">{normalizarCategorias(inc.dadosAfetados).join(', ')}</Campo>
        <Campo rotulo="Descrição"><span style={{ whiteSpace: 'pre-wrap' }}>{inc.descricao}</span></Campo>
        <Campo rotulo="Medidas para evitar recorrência"><span style={{ whiteSpace: 'pre-wrap' }}>{inc.planoAcao}</span></Campo>
      </div>

      <div className="card mb-16">
        <div className="card-header">Comunicação à ANPD e aos titulares</div>
        {simulado ? (
          <p className="text-muted">Não se aplica: exercício simulado.</p>
        ) : (
          <>
            <div className="form-grid">
              <Campo rotulo="Data em que a Câmara tomou ciência">{fmtData(inc.dataCiencia)}</Campo>
              <Campo rotulo="Pode acarretar risco ou dano relevante aos titulares?">{RISCO_LABEL_INC[inc.riscoRelevante] || 'Não avaliado'}</Campo>
              <Campo rotulo="Comunicação à ANPD">{fmtData(inc.dataComunicacaoANPD) || (inc.notificadoANPD ? 'Sim (sem data registrada)' : '')}</Campo>
              <Campo rotulo="Comunicação aos titulares">{fmtData(inc.dataComunicacaoTitulares)}</Campo>
            </div>
            {p && !p.comunicado && (
              <div className={['HOJE', 'VENCIDO', 'VESPERA'].includes(p.situacao) ? 'alert-error' : 'alert-info'}>
                {p.situacao === 'VENCIDO' ? 'Prazo vencido: comunicar à ANPD e aos titulares (prazo era ' : 'Comunicar à ANPD e aos titulares até '}
                <strong>{fmtData(p.prazo)}</strong>{p.situacao === 'VENCIDO' ? ')' : ''} — 3 dias úteis contados da ciência (art. 6º da Resolução CD/ANPD nº 15/2024).
              </div>
            )}
            {p?.comunicado && <SeloANPD inc={inc} />}
          </>
        )}
      </div>

      <Providencias token={token} incidenteId={inc.id} providencias={inc.providencias || []} onAdicionada={carregar} />
      <Anexos token={token} entidade="INCIDENTE" registroId={inc.id} titulo="Evidências anexadas" onEnviado={() => setVersao(v => v + 1)} />
      <Historico token={token} entidade="INCIDENTE" registroId={inc.id} versao={versao} />
    </div>
  );
}
