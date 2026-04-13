import { useState, useRef } from 'react';
import axios from 'axios';
import { API } from '../config';

// Opcoes de correcao oferecidas no modal. O valor deve bater com
// CLASSIFICACOES_VALIDAS no backend (documents.js).
const OPCOES_CORRECAO = [
  { valor: 'nao_pessoal', rotulo: 'Nao e dado pessoal' },
  { valor: 'cpf', rotulo: 'E CPF' },
  { valor: 'endereco', rotulo: 'E endereco' },
  { valor: 'nome', rotulo: 'E nome' },
  { valor: 'telefone', rotulo: 'E telefone' }
];

// Relatorio simplificado de devolutiva: mostra, em linguagem para leigo,
// o que foi tarjado (e por que) e o que foi preservado (e por que). Alimentado
// pela funcao gerarRelatorio do backend (tarjador.js).
function RelatorioDevolutiva({ relatorio, token, podeCorrigir }) {
  const { resumo, tarjados, naoTarjados } = relatorio || {};
  const [modalItem, setModalItem] = useState(null); // { trecho, categoria }
  const [salvando, setSalvando] = useState(false);
  const [corrigidos, setCorrigidos] = useState({}); // trecho -> classificacao escolhida
  if (!resumo) return null;
  const categorias = resumo.categoriasLegiveis || {};
  const temCategoria = Object.values(categorias).some(v => v > 0);

  const enviarCorrecao = async (classificacao) => {
    if (!modalItem) return;
    setSalvando(true);
    try {
      await axios.post(
        `${API}/documents/aprendizado`,
        {
          trecho: modalItem.trecho,
          classificacaoErrada: modalItem.classificacaoOriginal || null,
          classificacaoCorreta: classificacao
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCorrigidos(prev => ({ ...prev, [modalItem.trecho]: classificacao }));
      setModalItem(null);
    } catch (err) {
      alert('Erro ao salvar correcao: ' + (err.response?.data?.erro || err.message));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="card mt-16">
      <h2 className="card-header">Relatorio de devolutiva</h2>
      <p className="text-sm mb-16" style={{ color: '#64748b' }}>
        Resumo simples do que o sistema encontrou no documento, o que foi
        tarjado e o que foi preservado, com o motivo de cada decisao.
      </p>

      <div className="detail-label mb-8">Total encontrado por categoria</div>
      {temCategoria ? (
        <div className="badge-row mb-16">
          {Object.entries(categorias)
            .filter(([, v]) => v > 0)
            .map(([cat, v]) => (
              <span key={cat} className="badge badge-muted">{cat}: {v}</span>
            ))}
          <span className="badge badge-success">Total: {resumo.total}</span>
        </div>
      ) : (
        <div className="alert-info mb-16">Nenhum dado pessoal foi encontrado no documento.</div>
      )}

      {tarjados && tarjados.length > 0 && (
        <>
          <hr className="card-divider" />
          <div className="detail-label mb-8">O que foi tarjado — e por que</div>
          <p className="text-sm mb-16" style={{ color: '#64748b' }}>
            Itens protegidos pela LGPD (Lei Geral de Protecao de Dados).
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tarjados.slice(0, 20).map((t, i) => (
              <li key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span className="badge badge-success">{t.categoria}</span>
                  <code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{t.trecho}</code>
                  {podeCorrigir && (corrigidos[t.trecho] ? (
                    <span className="text-sm" style={{ color: '#059669' }}>correcao enviada</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setModalItem({ trecho: t.trecho, classificacaoOriginal: t.categoria })}
                      style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', color: '#475569' }}
                    >
                      Corrigir classificacao
                    </button>
                  ))}
                </div>
                <div className="text-sm" style={{ color: '#475569' }}>{t.motivo}</div>
              </li>
            ))}
          </ul>
          {tarjados.length > 20 && (
            <div className="text-sm mt-8" style={{ color: '#94a3b8' }}>
              + {tarjados.length - 20} itens adicionais tarjados no documento.
            </div>
          )}
        </>
      )}

      {modalItem && (
        <div
          onClick={() => !salvando && setModalItem(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Corrigir classificacao</h3>
            <p className="text-sm mb-16" style={{ color: '#64748b' }}>
              Trecho: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{modalItem.trecho}</code>
            </p>
            <p className="text-sm mb-16" style={{ color: '#64748b' }}>
              Sua correcao ajuda o sistema a classificar melhor em outros documentos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {OPCOES_CORRECAO.map(op => (
                <button
                  key={op.valor}
                  type="button"
                  disabled={salvando}
                  onClick={() => enviarCorrecao(op.valor)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', cursor: salvando ? 'wait' : 'pointer', textAlign: 'left' }}
                >
                  {op.rotulo}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={salvando}
              onClick={() => setModalItem(null)}
              style={{ marginTop: 12, padding: '6px 12px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {naoTarjados && naoTarjados.length > 0 && (
        <>
          <hr className="card-divider" />
          <div className="detail-label mb-8">O que NAO foi tarjado — e por que</div>
          <p className="text-sm mb-16" style={{ color: '#64748b' }}>
            Itens mantidos publicos pela LAI (Lei de Acesso a Informacao) ou
            que nao sao considerados dados pessoais pela LGPD.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {naoTarjados.slice(0, 20).map((t, i) => (
              <li key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span className="badge badge-muted">{t.categoria}</span>
                  <code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{t.trecho}</code>
                </div>
                <div className="text-sm" style={{ color: '#475569' }}>{t.motivo}</div>
              </li>
            ))}
          </ul>
          {naoTarjados.length > 20 && (
            <div className="text-sm mt-8" style={{ color: '#94a3b8' }}>
              + {naoTarjados.length - 20} itens adicionais preservados no documento.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Perfis autorizados a corrigir classificacoes no relatorio de devolutiva —
// so DPO (ENCARREGADO_LGPD) e admins podem treinar o aprendizado global,
// ja que a correcao afeta todas as organizacoes.
const PERFIS_CORRIGIR = ['ADMIN', 'SUPER_ADMIN', 'ENCARREGADO_LGPD'];

export default function Anonimizador({ token, usuario, onTokenInvalido }) {
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [erro, setErro] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const selecionarArquivo = (file) => {
    if (!file) return;
    setNomeArquivo(file.name);
    setArquivo(file);
    setTexto('');
    setResultado(null);
    setErro('');
  };

  const handleArquivo = (e) => selecionarArquivo(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.pdf') || file.name.endsWith('.docx') || file.name.endsWith('.doc'))) {
      selecionarArquivo(file);
    }
  };

  const removerArquivo = () => {
    setArquivo(null);
    setNomeArquivo('');
    setResultado(null);
    setErro('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const authHeaders = { Authorization: `Bearer ${token}` };

  const tratarErro = async (err) => {
    const status = err.response?.status;
    if (status === 401) {
      setErro('Sessao expirada. Faca login novamente.');
      if (onTokenInvalido) onTokenInvalido();
      return;
    }
    let msg = 'Erro ao processar';
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const json = JSON.parse(text);
        msg = json.erro || msg;
      } catch { /* keeps default */ }
    } else {
      msg = err.response?.data?.erro || msg;
    }
    setErro(msg);
  };

  const handleSubmit = async () => {
    if (!texto.trim() && !arquivo) return setErro('Cole um texto ou selecione um arquivo');
    setLoading(true);
    setErro('');
    try {
      const formData = new FormData();
      if (arquivo) formData.append('arquivo', arquivo);
      else formData.append('texto', texto);

      if (arquivo && arquivo.name.endsWith('.pdf')) {
        const res = await axios.post(`${API}/documents/anonymize`, formData, {
          headers: authHeaders, responseType: 'blob', timeout: 180000
        });
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          const text = await res.data.text();
          const json = JSON.parse(text);
          // Caminho novo: JSON com PDF tarjado em base64 + relatorio simplificado.
          // Decodifica o base64, dispara o download e guarda o relatorio no state.
          if (json.pdfBase64) {
            const bytes = Uint8Array.from(atob(json.pdfBase64), c => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url; a.download = 'documento-anonimizado.pdf'; a.click();
            setResultado({ pdf: true, ...json });
          } else {
            setResultado(json);
          }
        } else {
          const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
          const a = document.createElement('a');
          a.href = url; a.download = 'documento-anonimizado.pdf'; a.click();
          setResultado({ pdf: true });
        }
      } else {
        const res = await axios.post(`${API}/documents/anonymize`, formData, {
          headers: authHeaders, timeout: 120000
        });
        setResultado(res.data);
      }
    } catch (err) {
      await tratarErro(err);
    }
    setLoading(false);
  };

  const baixarPDF = async () => {
    if (!arquivo || !arquivo.name.endsWith('.pdf')) { alert('Selecione um PDF original para gerar as tarjas'); return; }
    setLoadingPDF(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      const res = await axios.post(`${API}/documents/download-pdf`, formData, {
        headers: authHeaders, responseType: 'blob', timeout: 120000
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'documento-anonimizado.pdf'; a.click();
    } catch (err) { alert('Erro ao gerar PDF'); }
    setLoadingPDF(false);
  };

  const baixarTXT = () => {
    const blob = new Blob([resultado.textoAnonimizado], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'documento-anonimizado.txt'; a.click();
  };

  return (
    <div>
      <div className="card mb-16">
        <h2 className="card-header">Documento</h2>
        <label>Cole o texto do documento</label>
        <textarea value={texto} onChange={e => { setTexto(e.target.value); setArquivo(null); setNomeArquivo(''); setResultado(null); }} rows={6} placeholder="Cole aqui o contrato, ata, processo, folha de pagamento..." style={{ fontFamily: 'monospace' }} />

        <label className="mb-8">Ou envie um arquivo</label>
        <div
          className={`upload-zone ${dragOver ? 'upload-zone-active' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <span className="upload-zone-icon">📁</span>
          <div className="upload-zone-text">Clique ou arraste um arquivo aqui</div>
          <div className="upload-zone-hint">PDF, DOCX — ate 10 MB</div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" onChange={handleArquivo} hidden />

        {nomeArquivo && (
          <div className="file-pill">
            <span>📎 {nomeArquivo}</span>
            <button type="button" className="file-remove" onClick={removerArquivo} title="Remover arquivo">×</button>
          </div>
        )}
      </div>

      {erro && <div className="alert-error">{erro}</div>}
      <button className="btn-primary mb-24" onClick={handleSubmit} disabled={loading}>
        {loading ? '⏳ Processando... (pode levar ate 1 minuto)' : 'Anonimizar documento'}
      </button>

      {resultado && resultado.pdf && (
        <>
          <div className="alert-success">
            <p><strong>PDF anonimizado com tarjas gerado e baixado com sucesso!</strong></p>
            <p className="text-sm">O arquivo foi salvo na sua pasta de downloads.</p>
          </div>
          {resultado.modoBasico && (
            <div
              role="alert"
              style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                color: '#78350f',
                borderRadius: 6,
                padding: '12px 16px',
                marginTop: 12,
                marginBottom: 12,
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start'
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
              <div>
                <strong>Modo basico ativado</strong>
                <div className="text-sm" style={{ marginTop: 4 }}>
                  {resultado.avisoIA || 'Processado em modo basico (IA indisponivel).'}
                </div>
              </div>
            </div>
          )}
          {resultado.relatorio && <RelatorioDevolutiva relatorio={resultado.relatorio} token={token} podeCorrigir={PERFIS_CORRIGIR.includes(usuario?.perfil)} />}
        </>
      )}

      {resultado && !resultado.pdf && (
        <div className="card">
          <h2 className="card-header">Resultado</h2>
          <div className="badge-row mb-16">
            <span className="badge badge-success">Tipo: {resultado.tipoDocumento}</span>
            <span className="badge badge-muted">{Object.values(resultado.stats).reduce((a, b) => a + b, 0)} dados mascarados</span>
            {resultado.ocrUsado && <span className="badge badge-warning">Lido via digitalizacao</span>}
          </div>
          {resultado.stats && Object.values(resultado.stats).reduce((a, b) => a + b, 0) === 0 ? (
            <div className="alert-info mb-16">Documento processado. Nenhum dado pessoal identificado.</div>
          ) : (
            <textarea value={resultado.textoAnonimizado} readOnly rows={10} style={{ fontFamily: 'monospace' }} />
          )}
          <div className="btn-row mt-16">
            <button className="btn-primary btn-sm" onClick={baixarPDF} disabled={loadingPDF}>
              {loadingPDF ? '⏳ Gerando...' : '⬇ Baixar PDF'}
            </button>
            <button className="btn-secondary btn-sm" onClick={baixarTXT}>⬇ Baixar TXT</button>
          </div>
          <hr className="card-divider" />
          <div className="detail-label mb-8">Fundamentacao legal</div>
          <div>{resultado.leisAplicaveis?.map((l, i) => <span key={i} className="badge-legal">{l}</span>)}</div>
        </div>
      )}
    </div>
  );
}
