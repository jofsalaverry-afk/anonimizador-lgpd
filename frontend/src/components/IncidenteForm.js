import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';

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

const ALL_DADOS = ['Nome', 'CPF', 'RG', 'E-mail', 'Telefone', 'Endereco', 'Dados Bancarios', 'Dados de Saude'];

export default function IncidenteForm({ token, incidenteId, onVoltar }) {
  const [form, setForm] = useState({
    titulo: '',
    tipoIncidente: '',
    dataOcorrencia: '',
    descricao: '',
    dadosAfetados: [],
    qtdTitulares: '',
    planoAcao: '',
    notificadoANPD: false,
    status: 'ABERTO'
  });
  const [loading, setLoading] = useState(false);
  const [loadingInc, setLoadingInc] = useState(!!incidenteId);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const carregarIncidente = useCallback(async () => {
    if (!incidenteId) return;
    try {
      const res = await axios.get(`${API}/repositorio/incidentes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const inc = res.data.find(i => i.id === incidenteId);
      if (inc) {
        setForm({
          titulo: inc.titulo || '',
          tipoIncidente: inc.tipoIncidente || '',
          dataOcorrencia: inc.dataOcorrencia ? inc.dataOcorrencia.substring(0, 10) : '',
          descricao: inc.descricao || '',
          dadosAfetados: inc.dadosAfetados || [],
          qtdTitulares: inc.qtdTitulares || '',
          planoAcao: inc.planoAcao || '',
          notificadoANPD: inc.notificadoANPD || false,
          status: inc.status || 'ABERTO'
        });
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
    if (!form.titulo || !form.tipoIncidente || !form.dataOcorrencia) {
      return setErro('Preencha título, tipo e data de ocorrência');
    }
    setLoading(true);
    setErro('');
    try {
      const payload = { ...form, qtdTitulares: form.qtdTitulares ? Number(form.qtdTitulares) : 0 };
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
          <label>Plano de ação</label>
          <textarea
            value={form.planoAcao}
            onChange={e => setForm({ ...form, planoAcao: e.target.value })}
            rows={3}
            placeholder="Descreva as ações corretivas..."
          />
        </div>

        <div className="form-grid mb-16">
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={form.notificadoANPD}
                onChange={e => setForm({ ...form, notificadoANPD: e.target.checked })}
              />
              {' '}Notificado à ANPD
            </label>
          </div>
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
    </div>
  );
}
