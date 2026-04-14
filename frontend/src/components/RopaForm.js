import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

const BASE_LEGAL_OPTIONS = [
  { value: 'CONSENTIMENTO', label: 'Consentimento' },
  { value: 'OBRIGACAO_LEGAL', label: 'Obrigação Legal' },
  { value: 'EXECUCAO_CONTRATO', label: 'Execução de Contrato' },
  { value: 'INTERESSE_LEGITIMO', label: 'Interesse Legítimo' },
  { value: 'PROTECAO_VIDA', label: 'Proteção à Vida' },
  { value: 'TUTELA_SAUDE', label: 'Tutela da Saúde' },
  { value: 'INTERESSE_PUBLICO', label: 'Interesse Público' },
  { value: 'EXERCICIO_DIREITOS', label: 'Exercício de Direitos' }
];

const CATEGORIAS_DADOS = ['Nome', 'CPF', 'RG', 'E-mail', 'Telefone', 'Endereco', 'Dados Bancarios', 'Dados de Saude', 'Outros'];
const CATEGORIAS_TITULARES = ['Servidores', 'Vereadores', 'Fornecedores', 'Cidadaos', 'Menores', 'Outros'];

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

  if (loadingInit) return <p className="text-muted">Carregando...</p>;

  const stepIndicator = (
    <div className="steps mb-20">
      {[1, 2, 3, 4].map(n => (
        <button key={n} onClick={() => setPasso(n)} className={`step ${passo === n ? 'step-active' : ''}`}>
          {n}. {['Dados básicos', 'Categorias', 'Compartilhamentos', 'Retenção'][n - 1]}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="page-header mb-16">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{tratamentoId ? 'Editar tratamento' : 'Novo tratamento'}</h2>
      </div>

      <div className="card">
        {stepIndicator}

        {erro && <p className="alert-error mb-12">{erro}</p>}
        {sucesso && <p className="alert-success mb-12">{sucesso}</p>}

        {passo === 1 && (
          <div className="form-grid">
            <div className="form-group">
              <label>Nome do tratamento</label>
              <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Folha de pagamento de servidores" className="mb-12" />
            </div>
            <div className="form-group">
              <label>Finalidade</label>
              <textarea value={form.finalidade} onChange={e => setForm({ ...form, finalidade: e.target.value })} rows={3} placeholder="Descreva a finalidade do tratamento de dados" className="mb-12" />
            </div>
            <div className="form-group">
              <label>Base legal (LGPD Art. 7)</label>
              <select value={form.baseLegal} onChange={e => setForm({ ...form, baseLegal: e.target.value })} className="mb-12">
                <option value="">Selecione...</option>
                {BASE_LEGAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {passo === 2 && (
          <div>
            <label className="mb-8">Categorias de dados pessoais</label>
            <div className="chip-row mb-20">
              {CATEGORIAS_DADOS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, categoriasDados: toggleChip(form.categoriasDados, c) })} className={`chip ${form.categoriasDados.includes(c) ? 'chip-active' : ''}`}>{c}</button>
              ))}
            </div>
            <label className="mb-8">Categorias de titulares</label>
            <div className="chip-row">
              {CATEGORIAS_TITULARES.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, categoriasTitulares: toggleChip(form.categoriasTitulares, c) })} className={`chip ${form.categoriasTitulares.includes(c) ? 'chip-active' : ''}`}>{c}</button>
              ))}
            </div>
          </div>
        )}

        {passo === 3 && (
          <div>
            <div className="flex-between mb-12">
              <label>Compartilhamentos com terceiros</label>
              <button type="button" onClick={addCompartilhamento} className="btn-ghost btn-sm">+ Adicionar terceiro</button>
            </div>
            {form.compartilhamentos.length === 0 && (
              <p className="text-muted">Nenhum compartilhamento registrado.</p>
            )}
            {form.compartilhamentos.map((c, i) => (
              <div key={i} className="terceiro-card">
                <div className="terceiro-header">
                  <span className="terceiro-num">Terceiro {i + 1}</span>
                  <button type="button" onClick={() => removeCompartilhamento(i)} className="terceiro-remove">Remover</button>
                </div>
                <div className="grid-2 gap-8">
                  <div className="form-group">
                    <label>Nome</label>
                    <input value={c.terceiroNome} onChange={e => setCompartilhamento(i, 'terceiroNome', e.target.value)} placeholder="Nome da empresa/órgão" />
                  </div>
                  <div className="form-group">
                    <label>CNPJ</label>
                    <input value={c.terceiroCNPJ} onChange={e => setCompartilhamento(i, 'terceiroCNPJ', e.target.value)} placeholder="00.000.000/0001-00" />
                  </div>
                  <div className="form-group">
                    <label>Finalidade</label>
                    <input value={c.finalidadeCompartilhamento} onChange={e => setCompartilhamento(i, 'finalidadeCompartilhamento', e.target.value)} placeholder="Finalidade do compartilhamento" />
                  </div>
                  <div className="form-group">
                    <label>País destino</label>
                    <input value={c.paisDestino} onChange={e => setCompartilhamento(i, 'paisDestino', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {passo === 4 && (
          <div className="form-grid">
            <div className="form-group">
              <label>Retenção (dias)</label>
              <input type="number" value={form.retencaoDias} onChange={e => setForm({ ...form, retencaoDias: e.target.value })} placeholder="Ex: 1825 (5 anos)" className="mb-12" />
            </div>
            <div className="form-group">
              <label>Forma de descarte</label>
              <input value={form.formaDescarte} onChange={e => setForm({ ...form, formaDescarte: e.target.value })} placeholder="Ex: Eliminação segura, anonimização" className="mb-12" />
            </div>
            <div className="form-group">
              <label>Medidas de segurança</label>
              <textarea value={form.medidasSeguranca} onChange={e => setForm({ ...form, medidasSeguranca: e.target.value })} rows={3} placeholder="Ex: Criptografia em trânsito e em repouso, controle de acesso, backup" />
            </div>
          </div>
        )}

        <div className="btn-row-spread mt-20">
          <button onClick={() => setPasso(Math.max(1, passo - 1))} disabled={passo === 1} className="btn-secondary">
            Anterior
          </button>
          {passo < 4 ? (
            <button onClick={() => setPasso(passo + 1)} className="btn-primary">Próximo</button>
          ) : (
            <button onClick={salvar} disabled={loading} className="btn-primary">
              {loading ? 'Salvando...' : (tratamentoId ? 'Salvar alterações' : 'Criar tratamento')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
