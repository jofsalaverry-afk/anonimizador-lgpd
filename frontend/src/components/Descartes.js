import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import SeletorResponsavel from './SeletorResponsavel';
import Anexos from './Anexos';
import Historico from './Historico';

const VAZIO = { dataDescarte: '', descricao: '', quantidade: '', metodo: '', responsavelId: '' };
const fmt = d => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

// Secao "Descartes" do detalhe do ROPA: situacao do prazo de retencao,
// registro de descarte e lista (cada um com evidencias e historico).
export default function Descartes({ token, tratamentoId, onRegistrado }) {
  const [dados, setDados] = useState({ descartes: [], retencao: null });
  const [form, setForm] = useState(VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [aberto, setAberto] = useState(null);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/ropa/tratamentos/${tratamentoId}/descartes`, { headers: { Authorization: `Bearer ${token}` } });
      setDados(res.data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao carregar descartes');
    }
  }, [token, tratamentoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    if (!form.dataDescarte || !form.descricao.trim() || !form.metodo.trim()) return setErro('Preencha data, descrição e método');
    setSalvando(true);
    setErro('');
    try {
      const res = await axios.post(`${API}/ropa/tratamentos/${tratamentoId}/descartes`,
        { ...form, quantidade: form.quantidade === '' ? null : Number(form.quantidade) },
        { headers: { Authorization: `Bearer ${token}` } });
      setForm(VAZIO);
      setMostrarForm(false);
      setAberto(res.data.id);
      await carregar();
      onRegistrado && onRegistrado();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao registrar descarte');
    }
    setSalvando(false);
  };

  const r = dados.retencao;

  return (
    <div className="card mb-16">
      <div className="flex-between mb-12">
        <div className="card-header" style={{ marginBottom: 0 }}>Retenção e descartes ({dados.descartes.length})</div>
        <button className="btn-secondary btn-sm acao-escrita" onClick={() => setMostrarForm(!mostrarForm)}>{mostrarForm ? 'Cancelar' : '+ Registrar descarte'}</button>
      </div>
      {erro && <div className="alert-error mb-8">{erro}</div>}

      {r ? (
        <p className={r.vencido ? 'alert-error mb-12' : 'text-sm mb-12'}>
          Retenção de {r.retencaoDias} dias, contada {r.origem === 'ULTIMO_DESCARTE' ? 'do último descarte' : 'da criação do tratamento'} ({fmt(r.contadoDesde)}).
          {' '}{r.vencido ? `Prazo VENCIDO em ${fmt(r.venceEm)} — registre o descarte.` : `Vence em ${fmt(r.venceEm)} (${r.diasRestantes} dia(s)).`}
        </p>
      ) : (
        <p className="text-muted text-sm mb-12">Sem prazo de retenção definido neste tratamento.</p>
      )}

      {mostrarForm && (
        <div className="mb-16">
          <div className="form-grid mb-8">
            <div className="form-group">
              <label>Data do descarte</label>
              <input type="date" value={form.dataDescarte} onChange={e => setForm({ ...form, dataDescarte: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Quantidade de registros (opcional)</label>
              <input type="number" min="0" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Método</label>
              <input value={form.metodo} onChange={e => setForm({ ...form, metodo: e.target.value })} placeholder="Ex: trituração, exclusão definitiva, anonimização" />
            </div>
            <div className="form-group">
              <label>Responsável</label>
              <SeletorResponsavel token={token} value={form.responsavelId} onChange={v => setForm({ ...form, responsavelId: v })} />
            </div>
          </div>
          <label>Descrição</label>
          <textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="O que foi descartado e de qual período" />
          <button className="btn-primary btn-sm mt-8" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Registrar descarte'}</button>
          <p className="text-muted text-xs mt-8">Depois de registrar, anexe a evidência (termo, fotos, relatório de exclusão).</p>
        </div>
      )}

      {dados.descartes.map(d => (
        <div key={d.id} style={{ borderTop: '1px solid #eef0f4', padding: '8px 0' }}>
          <div className="flex-between">
            <div>
              <strong>{fmt(d.dataDescarte)}</strong> — {d.metodo}{d.quantidade != null ? ` — ${d.quantidade} registro(s)` : ''}
              <div className="text-sm">{d.descricao}</div>
              <div className="text-muted text-xs">Responsável: {d.responsavel?.nome || '—'}</div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setAberto(aberto === d.id ? null : d.id)}>{aberto === d.id ? 'Fechar' : 'Evidências e histórico'}</button>
          </div>
          {aberto === d.id && (
            <div className="mt-8">
              <Anexos token={token} entidade="DESCARTE" registroId={d.id} titulo="Evidências do descarte" onEnviado={() => setVersao(v => v + 1)} />
              <Historico token={token} entidade="DESCARTE" registroId={d.id} versao={versao} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
