import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { baixarCertificado } from './certificadoDownload';
import { fmtDiaSP } from '../datas';

const SITUACAO = {
  NAO_INICIADA: ['badge badge-muted', 'Não iniciada'],
  EM_ANDAMENTO: ['badge badge-warning', 'Em andamento'],
  CONCLUIDA: ['badge badge-success', 'Concluída']
};

// Relatorio usuarios x trilhas (Gestor/DPO), com filtro e exportacao.
export default function TreinamentoRelatorio({ token, trilhas, trilhaInicial = '', situacaoInicial = '' }) {
  const [linhas, setLinhas] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [trilhaId, setTrilhaId] = useState(trilhaInicial);
  const [situacao, setSituacao] = useState(situacaoInicial);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const params = { ...(trilhaId && { trilhaId }), ...(situacao && { situacao }) };

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/treinamento/relatorio`, { params: { resumo: 1, ...(trilhaId && { trilhaId }), ...(situacao && { situacao }) }, headers: { Authorization: `Bearer ${token}` } })
      .then(res => { setLinhas(res.data.linhas); setResumo(res.data.resumo); })
      .catch(err => setErro(err.response?.data?.erro || 'Erro ao carregar relatório'))
      .finally(() => setLoading(false));
  }, [token, trilhaId, situacao]);

  const exportar = async (formato) => {
    try {
      const res = await axios.get(`${API}/treinamento/relatorio`, {
        params: { ...params, formato }, headers: { Authorization: `Bearer ${token}` },
        responseType: formato === 'csv' ? 'blob' : 'json'
      });
      const blob = formato === 'csv'
        ? new Blob([res.data], { type: 'text/csv;charset=utf-8' })
        : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-treinamento.${formato}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setErro('Erro ao exportar');
    }
  };


  return (
    <div>
      {erro && <div className="alert-error mb-12">{erro}</div>}
      <div className="flex-between mb-16">
        <div className="filters" style={{ marginBottom: 0 }}>
          <select value={trilhaId} onChange={e => setTrilhaId(e.target.value)}>
            <option value="">Todas as trilhas</option>
            {trilhas.map(t => <option key={t.id} value={t.id}>{t.titulo}</option>)}
          </select>
          <select value={situacao} onChange={e => setSituacao(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(SITUACAO).map(([k, [, v]]) => <option key={k} value={k}>{v}</option>)}
            <option value="NAO_CONCLUIDA">Não concluída (não iniciada + em andamento)</option>
          </select>
        </div>
        <div className="btn-row">
          <button className="btn-secondary btn-sm" onClick={() => exportar('csv')}>Exportar CSV</button>
          <button className="btn-secondary btn-sm" onClick={() => exportar('json')}>Exportar JSON</button>
        </div>
      </div>
      {resumo && (
        <p className="mb-12">
          <strong>{resumo.concluiramObrigatoria} de {resumo.servidores}</strong> servidores concluíram a trilha obrigatória
          {resumo.trilhaObrigatoria ? ` (${resumo.trilhaObrigatoria})` : ''} · <strong>{resumo.trilhasConcluidas} de {resumo.trilhasTotal}</strong> trilhas concluídas
        </p>
      )}
      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead>
              <tr>
                <th>Servidor</th>
                <th>Trilha</th>
                <th>Módulos</th>
                <th>Situação</th>
                <th>Conclusão</th>
                <th>Certificado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={`${l.usuarioId}-${l.trilhaId}`}>
                  <td>{l.usuarioNome}</td>
                  <td>{l.trilhaTitulo}</td>
                  <td>{l.modulosConcluidos}/{l.totalModulos}</td>
                  <td><span className={SITUACAO[l.situacao][0]}>{SITUACAO[l.situacao][1]}</span></td>
                  <td>{l.concluidoEm ? fmtDiaSP(l.concluidoEm) : '-'}</td>
                  <td>
                    {l.certificadoCodigo
                      ? <button className="btn-ghost btn-sm" onClick={() => baixarCertificado(token, l.certificadoCodigo).catch(() => setErro('Erro ao baixar certificado'))}>{l.certificadoCodigo}</button>
                      : '-'}
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && <tr><td colSpan={6} className="text-muted">Nenhum resultado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
