import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import SeletorResponsavel from './SeletorResponsavel';
import Anexos from './Anexos';
import Historico from './Historico';
import Providencias from './Providencias';
import { paraInputData, fmtData, hojeInput } from '../datas';
import { CATEGORIAS_DADOS, CATEGORIAS_SENSIVEIS, normalizarCategorias } from '../basesLegais';

const SEVERIDADE_OPTIONS = [
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'BAIXA', label: 'Baixa' }
];

const TIPO_INC_OPTIONS = [
  { value: 'VAZAMENTO', label: 'Vazamento' },
  { value: 'ACESSO_INDEVIDO', label: 'Acesso indevido' },
  { value: 'PERDA', label: 'Perda' },
  { value: 'ALTERACAO', label: 'Alteração' },
  { value: 'OUTRO', label: 'Outro' }
];

const STATUS_INC_OPTIONS = [
  { value: 'ABERTO', label: 'Aberto' },
  { value: 'EM_INVESTIGACAO', label: 'Em investigação' },
  { value: 'RESOLVIDO', label: 'Resolvido' },
  { value: 'ENCERRADO', label: 'Encerrado' }
];

// Mesma lista do ROPA (com acento), incluindo os dados sensiveis
const ALL_DADOS = [...CATEGORIAS_DADOS, ...CATEGORIAS_SENSIVEIS];

export default function IncidenteForm({ token, incidenteId, onVoltar }) {
  const [form, setForm] = useState({
    titulo: '',
    tipoIncidente: '',
    dataOcorrencia: '',
    descricao: '',
    dadosAfetados: [],
    qtdTitulares: '',
    planoAcao: '',
    status: 'ABERTO',
    dataCiencia: '',
    riscoRelevante: '',
    dataComunicacaoANPD: '',
    dataComunicacaoTitulares: '',
    responsavelId: '',
    severidade: '',
    tipoRegistro: 'REAL'
  });
  const [providencias, setProvidencias] = useState([]);
  const [prazo, setPrazo] = useState(null); // prazoComunicacao calculado no backend
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingInc, setLoadingInc] = useState(!!incidenteId);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const carregarIncidente = useCallback(async () => {
    if (!incidenteId) return;
    try {
      const res = await axios.get(`${API}/repositorio/incidentes/${incidenteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const inc = res.data;
      if (inc) {
        setForm({
          titulo: inc.titulo || '',
          tipoIncidente: inc.tipoIncidente || '',
          dataOcorrencia: paraInputData(inc.dataOcorrencia),
          descricao: inc.descricao || '',
          dadosAfetados: normalizarCategorias(inc.dadosAfetados),
          qtdTitulares: inc.qtdTitulares || '',
          planoAcao: inc.planoAcao || '',
          status: inc.status || 'ABERTO',
          dataCiencia: paraInputData(inc.dataCiencia),
          riscoRelevante: inc.riscoRelevante || '',
          dataComunicacaoANPD: paraInputData(inc.dataComunicacaoANPD),
          dataComunicacaoTitulares: paraInputData(inc.dataComunicacaoTitulares),
          responsavelId: inc.responsavelId || '',
          severidade: inc.severidade || '',
          tipoRegistro: inc.tipoRegistro || 'REAL'
        });
        setProvidencias(inc.providencias || []);
        setPrazo(inc.prazoComunicacao || null);
        setVersaoHistorico(v => v + 1);
      } else {
        setErro('Incidente não encontrado');
      }
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar incidente');
    }
    setLoadingInc(false);
  }, [token, incidenteId]);

  useEffect(() => { carregarIncidente(); }, [carregarIncidente]);

  const toggleDado = (dado) => {
    setForm(prev => ({
      ...prev,
      dadosAfetados: prev.dadosAfetados.includes(dado)
        ? prev.dadosAfetados.filter(d => d !== dado)
        : [...prev.dadosAfetados, dado]
    }));
  };

  const salvar = async () => {
    // Etapa 7b: datas e numeros (o servidor confere de novo)
    const hoje = hojeInput();
    if (form.dataOcorrencia > hoje) return setErro('A data de ocorrência não pode ser futura');
    if (form.dataCiencia && form.dataCiencia > hoje) return setErro('A data de ciência não pode ser futura');
    if (form.dataCiencia && form.dataOcorrencia && form.dataCiencia < form.dataOcorrencia) return setErro('A data de ciência não pode ser anterior à data da ocorrência');
    if (form.qtdTitulares !== '' && (!/^\d+$/.test(String(form.qtdTitulares)))) return setErro('Titulares afetados: informe um número inteiro, zero ou maior');
    if (!form.titulo || !form.tipoIncidente || !form.dataOcorrencia) {
      return setErro('Preencha título, tipo e data de ocorrência');
    }
    setLoading(true);
    setErro('');
    try {
      const real = form.tipoRegistro === 'REAL';
      const payload = {
        ...form,
        qtdTitulares: form.qtdTitulares ? Number(form.qtdTitulares) : 0,
        // simulado nao tem comunicacao
        dataCiencia: real ? form.dataCiencia || null : null,
        riscoRelevante: real ? form.riscoRelevante || null : null,
        dataComunicacaoANPD: real ? form.dataComunicacaoANPD || null : null,
        dataComunicacaoTitulares: real ? form.dataComunicacaoTitulares || null : null
      };
      if (incidenteId) {
        await axios.put(`${API}/repositorio/incidentes/${incidenteId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSucesso('Incidente atualizado com sucesso');
      } else {
        await axios.post(`${API}/repositorio/incidentes`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSucesso('Incidente registrado com sucesso');
      }
      setTimeout(() => onVoltar(), 1200);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar incidente');
    }
    setLoading(false);
  };

  if (loadingInc) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <div className="flex-center gap-8 mb-20">
        <button onClick={onVoltar} className="link-back">&#8592; Voltar</button>
        <h2 className="page-title">{incidenteId ? 'Editar incidente' : 'Novo incidente'}</h2>
      </div>

      <div className="card">
        {erro && <div className="alert-error">{erro}</div>}
        {sucesso && <div className="alert-success">{sucesso}</div>}

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>Título</label>
            <input
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
              placeholder="Título do incidente"
            />
          </div>
          <div className="form-group">
            <label>Tipo de incidente</label>
            <select value={form.tipoIncidente} onChange={e => setForm({ ...form, tipoIncidente: e.target.value })}>
              <option value="">Selecione...</option>
              {TIPO_INC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>Data da ocorrência</label>
            <input
              type="date"
              max={hojeInput()}
              value={form.dataOcorrencia}
              onChange={e => setForm({ ...form, dataOcorrencia: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Quantidade de titulares afetados</label>
            <input
              type="number"
              value={form.qtdTitulares}
              onChange={e => setForm({ ...form, qtdTitulares: e.target.value })}
              placeholder="0"
              min="0"
            />
          </div>
        </div>

        <div className="form-group mb-16">
          <label>Descrição</label>
          <textarea
            value={form.descricao}
            onChange={e => setForm({ ...form, descricao: e.target.value })}
            rows={4}
            placeholder="Descreva o incidente..."
          />
        </div>

        <div className="form-group mb-16">
          <label>Dados pessoais afetados</label>
          <div className="chip-row">
            {ALL_DADOS.map(dado => (
              <button
                key={dado}
                type="button"
                className={form.dadosAfetados.includes(dado) ? 'chip chip-active' : 'chip'}
                onClick={() => toggleDado(dado)}
              >
                {dado}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group mb-16">
          <label>Medidas para evitar recorrência</label>
          <textarea
            value={form.planoAcao}
            onChange={e => setForm({ ...form, planoAcao: e.target.value })}
            rows={3}
            placeholder="O que será feito para que o incidente não se repita"
          />
        </div>

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>Severidade</label>
            <select value={form.severidade} onChange={e => setForm({ ...form, severidade: e.target.value })}>
              <option value="">Não classificada</option>
              {SEVERIDADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Registro</label>
            <select value={form.tipoRegistro} onChange={e => setForm({ ...form, tipoRegistro: e.target.value })}>
              <option value="REAL">Incidente real</option>
              <option value="SIMULADO">Simulado (exercício de resposta)</option>
            </select>
          </div>
        </div>

        <div className="form-group mb-16">
          <label>Responsável</label>
          <SeletorResponsavel token={token} value={form.responsavelId} onChange={v => setForm({ ...form, responsavelId: v })} />
        </div>

        {form.tipoRegistro === 'REAL' ? (
          <div className="card-flush mb-16" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <div className="detail-label mb-8">Comunicação à ANPD e aos titulares</div>
            <div className="form-grid">
              <div className="form-group">
                <label>Data em que a Câmara tomou ciência</label>
                <input type="date" min={form.dataOcorrencia || undefined} max={hojeInput()} value={form.dataCiencia} onChange={e => setForm({ ...form, dataCiencia: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Pode acarretar risco ou dano relevante aos titulares?</label>
                <select value={form.riscoRelevante} onChange={e => setForm({ ...form, riscoRelevante: e.target.value })}>
                  <option value="">Não avaliado</option>
                  <option value="SIM">Sim</option>
                  <option value="NAO">Não</option>
                  <option value="EM_AVALIACAO">Em avaliação</option>
                </select>
              </div>
            </div>
            {form.riscoRelevante === 'SIM' && (
              prazo && !prazo.comunicado ? (
                <div className={['VESPERA', 'HOJE', 'VENCIDO'].includes(prazo.situacao) ? 'alert-error mb-8' : 'alert-info mb-8'}>
                  Comunicar à ANPD e aos titulares até <strong>{fmtData(prazo.prazo)}</strong> (3 dias úteis contados da ciência — art. 6º da Resolução CD/ANPD nº 15/2024).
                </div>
              ) : !prazo && (
                <p className="text-xs text-muted mb-8">Informe a data de ciência e salve: o sistema mostra o prazo de comunicação (3 dias úteis) e avisa 1 dia útil antes e no dia.</p>
              )
            )}
            <div className="form-grid">
              <div className="form-group">
                <label>Data da comunicação à ANPD</label>
                <input type="date" value={form.dataComunicacaoANPD} onChange={e => setForm({ ...form, dataComunicacaoANPD: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Data da comunicação aos titulares</label>
                <input type="date" value={form.dataComunicacaoTitulares} onChange={e => setForm({ ...form, dataComunicacaoTitulares: e.target.value })} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted mb-16">Comunicação à ANPD: não se aplica (exercício simulado).</p>
        )}

        <div className="form-grid mb-16">
          {incidenteId && (
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUS_INC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="btn-row-spread mt-20">
          <button onClick={onVoltar} className="btn-secondary btn-sm">Cancelar</button>
          <button onClick={salvar} disabled={loading} className="btn-primary btn-sm">
            {loading ? 'Salvando...' : (incidenteId ? 'Atualizar incidente' : 'Registrar incidente')}
          </button>
        </div>
      </div>

      {incidenteId && (
        <div className="mt-20">
          <Providencias token={token} incidenteId={incidenteId} providencias={providencias} onAdicionada={carregarIncidente} />
          <Anexos token={token} entidade="INCIDENTE" registroId={incidenteId} titulo="Evidências anexadas" onEnviado={() => setVersaoHistorico(v => v + 1)} />
          <Historico token={token} entidade="INCIDENTE" registroId={incidenteId} versao={versaoHistorico} />
        </div>
      )}
    </div>
  );
}
