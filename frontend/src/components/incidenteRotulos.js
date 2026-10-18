import { fmtData } from '../datas';

export const RISCO_LABEL_INC = { SIM: 'Sim', NAO: 'Não', EM_AVALIACAO: 'Em avaliação' };

// Selo da coluna "ANPD" da lista (e do detalhe). Simulado: N/A em cinza.
// Real: situacao do prazo de 3 dias uteis da ciencia (calculado no backend).
export function SeloANPD({ inc }) {
  if (inc.tipoRegistro === 'SIMULADO') return <span className="badge badge-muted" title="Simulado: não há comunicação">N/A</span>;
  const p = inc.prazoComunicacao;
  if (p?.comunicado || inc.dataComunicacaoANPD) {
    return <span className="badge badge-success" title="Comunicação à ANPD registrada">Comunicado{inc.dataComunicacaoANPD ? ` ${fmtData(inc.dataComunicacaoANPD)}` : ''}</span>;
  }
  if (p) {
    const urgente = ['VESPERA', 'HOJE', 'VENCIDO'].includes(p.situacao);
    return (
      <span className={urgente ? 'badge badge-danger' : 'badge badge-warning'} title="3 dias úteis da ciência (Res. CD/ANPD nº 15/2024)">
        {p.situacao === 'VENCIDO' ? `Vencido ${fmtData(p.prazo)}` : `Até ${fmtData(p.prazo)}`}
      </span>
    );
  }
  if (inc.riscoRelevante === 'NAO') return <span className="badge badge-muted" title="Sem risco ou dano relevante">Não exigida</span>;
  if (inc.riscoRelevante === 'EM_AVALIACAO') return <span className="badge badge-warning">Em avaliação</span>;
  if (inc.notificadoANPD) return <span className="badge badge-success">Sim</span>;
  return <span className="badge badge-muted" title="Informe a data de ciência e a avaliação de risco">Não avaliado</span>;
}
