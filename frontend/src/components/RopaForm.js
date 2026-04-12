import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

const BASE_LEGAL_OPTIONS = [
  { value: 'CONSENTIMENTO', label: 'Consentimento' },
  { value: 'OBRIGACAO_LEGAL', label: 'Obrigacao Legal' },
  { value: 'EXECUCAO_CONTRATO', label: 'Execucao de Contrato' },
  { value: 'INTERESSE_LEGITIMO', label: 'Interesse Legitimo' },
  { value: 'PROTECAO_VIDA', label: 'Protecao a Vida' },
  { value: 'TUTELA_SAUDE', label: 'Tutela da Saude' },
  { value: 'INTERESSE_PUBLICO', label: 'Interesse Publico' },
  { value: 'EXERCICIO_DIREITOS', label: 'Exercicio de Direitos' }
];

const CATEGORIAS_DADOS = ['Nome', 'CPF', 'RG', 'E-mail', 'Telefone', 'Endereco', 'Dados Bancarios', 'Dados de Saude', 'Outros'];
const CATEGORIAS_TITULARES = ['Servidores', 'Vereadores', 'Fornecedores', 'Cidadaos', 'Menores', 'Outros'];

const chipStyle = (ativo) => ({
  fontSize: 12, padding: '4px 12px', borderRadius: 16, border: '1px solid',
  cursor: 'pointer', transition: 'all 0.15s',
  background: ativo ? '#dbeafe' : '#f8fafc',
  borderColor: ativo ? '#3b82f6' : '#e2e8f0',
  color: ativo ? '#1d4ed8' : '#94a3b8'
});

const COMPARTILHAMENTO_VAZIO = { terceiroNome: '', terceiroCNPJ: '', finalidadeCompartilhamento: '', paisDestino: 'Brasil', baseLegalTransferencia: '' };

export default function RopaForm({ token, tratamentoId, onVoltar }) {
  const [passo, setPasso] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingInit, setLoadingInit] = useState(!!tratamentoId);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [form, setForm] = useState({
    nome: '', finalidade: '', baseLegal: '',
    categoriasDados: [], categoriasTitulares: [],
    compartilhamentos: [],
    retencaoDias: '', formaDescarte: '', medidasSeguranca: ''
  });

  useEffect(() => {
    if (!tratamentoId) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/ropa/tratamentos`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const t = res.data.find(x => x.id === tratamentoId);
        if (t) {
          setForm({
            nome: t.nome || '', finalidade: t.finalidade || '', baseLegal: t.baseLegal || '',
            categoriasDados: t.categoriasDados || [], categoriasTitulares: t.categoriasTitulares || [],
            compartilhamentos: (t.compartilhamentos || []).map(c => ({
              terceiroNome: c.terceiroNome, terceiroCNPJ: c.terceiroCNPJ || '',
              finalidadeCompartilhamento: c.finalidadeCompartilhamento,
              paisDestino: c.paisDestino || 'Brasil', baseLegalTransferencia: c.baseLegalTransferencia || ''
            })),
            retencaoDias: t.retencaoDias != null ? String(t.retencaoDias) : '',
            formaDescarte: t.formaDescarte || '', medidasSeguranca: t.medidasSeguranca || ''
          });
        }
      } catch (err) {
        setErro('Erro ao carregar tratamento');
      }
      setLoadingInit(false);
    })();
  }, [tratamentoId, token]);

  const toggleChip = (arr, item) => {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
  };

  const setCompartilhamento = (idx, campo, valor) => {
    const novos = [...form.compartilhamentos];
    novos[idx] = { ...novos[idx], [campo]: valor };
    setForm({ ...form, compartilhamentos: novos });
  };

  const addCompartilhamento = () => {
    setForm({ ...form, compartilhamentos: [...form.compartilhamentos, { ...COMPARTILHAMENTO_VAZIO }] });
  };

  const removeCompartilhamento = (idx) => {
    setForm({ ...form, compartilhamentos: form.compartilhamentos.filter((_, i) => i !== idx) });
  };

  const salvar = async () => {
    if (!form.nome || !form.finalidade || !form.baseLegal) {
      setErro('Preencha nome, finalidade e base legal (Passo 1)');
      setPasso(1);
      return;
    }
    setLoading(true);
    setErro('');
    try {
      const payload = {
        ...form,
        retencaoDias: form.retencaoDias ? parseInt(form.retencaoDias, 10) : null,
        compartilhamentos: form.compartilhamentos.filter(c => c.terceiroNome.trim())
      };
      if (tratamentoId) {
        await axios.put(`${API}/ropa/tratamentos/${tratamentoId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post(`${API}/ropa/tratamentos`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setSucesso(tratamentoId ? 'Tratamento atualizado!' : 'Tratamento criado!');
      setTimeout(() => onVoltar(), 800);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar');
    }
    setLoading(false);
  };

  if (loadingInit) return <p style={{ color: '#64748b', fontSize: 13 }}>Carregando...</p>;

  const stepIndicator = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
      {[1, 2, 3, 4].map(n => (
        <button key={n} onClick={() => setPasso(n)} style={{
          flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          border: passo === n ? '2px solid #3b82f6' : '1px solid #e2e8f0',
          background: passo === n ? '#eff6ff' : 'white',
          color: passo === n ? '#1d4ed8' : '#94a3b8'
        }}>
          {n}. {['Dados basicos', 'Categorias', 'Compartilhamentos', 'Retencao'][n - 1]}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onVoltar} style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8' }}>← Voltar</button>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{tratamentoId ? 'Editar tratamento' : 'Novo tratamento'}</h2>
      </div>

      <div className="card">
        {stepIndicator}

        {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
        {sucesso && <p style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>{sucesso}</p>}

        {passo === 1 && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Nome do tratamento</label>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Folha de pagamento de servidores" style={{ marginBottom: 12 }} />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Finalidade</label>
            <textarea value={form.finalidade} onChange={e => setForm({ ...form, finalidade: e.target.value })} rows={3} placeholder="Descreva a finalidade do tratamento de dados" style={{ marginBottom: 12, fontFamily: 'inherit' }} />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Base legal (LGPD Art. 7)</label>
            <select value={form.baseLegal} onChange={e => setForm({ ...form, baseLegal: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12, fontSize: 13 }}>
              <option value="">Selecione...</option>
              {BASE_LEGAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {passo === 2 && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'block' }}>Categorias de dados pessoais</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {CATEGORIAS_DADOS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, categoriasDados: toggleChip(form.categoriasDados, c) })} style={chipStyle(form.categoriasDados.includes(c))}>{c}</button>
              ))}
            </div>
            <label style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'block' }}>Categorias de titulares</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIAS_TITULARES.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, categoriasTitulares: toggleChip(form.categoriasTitulares, c) })} style={chipStyle(form.categoriasTitulares.includes(c))}>{c}</button>
              ))}
            </div>
          </div>
        )}

        {passo === 3 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>Compartilhamentos com terceiros</label>
              <button type="button" onClick={addCompartilhamento} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#1d4ed8' }}>+ Adicionar terceiro</button>
            </div>
            {form.compartilhamentos.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Nenhum compartilhamento registrado.</p>
            )}
            {form.compartilhamentos.map((c, i) => (
              <div key={i} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Terceiro {i + 1}</span>
                  <button type="button" onClick={() => removeCompartilhamento(i)} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Remover</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b' }}>Nome</label>
                    <input value={c.terceiroNome} onChange={e => setCompartilhamento(i, 'terceiroNome', e.target.value)} placeholder="Nome da empresa/orgao" style={{ fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b' }}>CNPJ</label>
                    <input value={c.terceiroCNPJ} onChange={e => setCompartilhamento(i, 'terceiroCNPJ', e.target.value)} placeholder="00.000.000/0001-00" style={{ fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b' }}>Finalidade</label>
                    <input value={c.finalidadeCompartilhamento} onChange={e => setCompartilhamento(i, 'finalidadeCompartilhamento', e.target.value)} placeholder="Finalidade do compartilhamento" style={{ fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b' }}>Pais destino</label>
                    <input value={c.paisDestino} onChange={e => setCompartilhamento(i, 'paisDestino', e.target.value)} style={{ fontSize: 12 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {passo === 4 && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Retencao (dias)</label>
            <input type="number" value={form.retencaoDias} onChange={e => setForm({ ...form, retencaoDias: e.target.value })} placeholder="Ex: 1825 (5 anos)" style={{ marginBottom: 12 }} />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Forma de descarte</label>
            <input value={form.formaDescarte} onChange={e => setForm({ ...form, formaDescarte: e.target.value })} placeholder="Ex: Eliminacao segura, anonimizacao" style={{ marginBottom: 12 }} />
            <label style={{ fontSize: 13, fontWeight: 500 }}>Medidas de seguranca</label>
            <textarea value={form.medidasSeguranca} onChange={e => setForm({ ...form, medidasSeguranca: e.target.value })} rows={3} placeholder="Ex: Criptografia em transito e em repouso, controle de acesso, backup" style={{ fontFamily: 'inherit' }} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button onClick={() => setPasso(Math.max(1, passo - 1))} disabled={passo === 1}
            style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: passo === 1 ? 'default' : 'pointer', color: passo === 1 ? '#cbd5e1' : '#475569' }}>
            Anterior
          </button>
          {passo < 4 ? (
            <button onClick={() => setPasso(passo + 1)} className="btn-primary" style={{ fontSize: 13, padding: '8px 20px' }}>Proximo</button>
          ) : (
            <button onClick={salvar} disabled={loading} className="btn-primary" style={{ fontSize: 13, padding: '8px 20px' }}>
              {loading ? 'Salvando...' : (tratamentoId ? 'Salvar alteracoes' : 'Criar tratamento')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
