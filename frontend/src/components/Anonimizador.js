import { useState } from 'react';
import axios from 'axios';
import { API } from '../config';

export default function Anonimizador({ token, onTokenInvalido }) {
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [erro, setErro] = useState('');

  const handleArquivo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setArquivo(file);
    setTexto('');
    setResultado(null);
    setErro('');
  };

  const removerArquivo = () => {
    setArquivo(null);
    setNomeArquivo('');
    setResultado(null);
    setErro('');
    const input = document.getElementById('arquivo-input');
    if (input) input.value = '';
  };

  // Header de autorizacao reutilizado em todas as chamadas autenticadas.
  // NAO incluir Content-Type aqui — axios gera automaticamente o
  // multipart/form-data com boundary correto ao enviar FormData.
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Extrai mensagem de erro de respostas blob (quando responseType e blob,
  // erros JSON do servidor chegam como Blob e precisam ser parseados)
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
      } catch { /* mantém msg padrão */ }
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
        // PDF pode retornar blob (PDF normal) ou JSON (PDF escaneado via OCR)
        const res = await axios.post(`${API}/documents/anonymize`, formData, {
          headers: authHeaders,
          responseType: 'blob',
          timeout: 180000
        });

        // Verificar se a resposta e JSON (OCR) ou blob PDF
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          const text = await res.data.text();
          const data = JSON.parse(text);
          setResultado(data);
        } else {
          const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = 'documento-anonimizado.pdf';
          a.click();
          setResultado({ pdf: true });
        }
      } else {
        const res = await axios.post(`${API}/documents/anonymize`, formData, {
          headers: authHeaders,
          timeout: 120000
        });
        setResultado(res.data);
      }
    } catch (err) {
      await tratarErro(err);
    }
    setLoading(false);
  };

  const baixarPDF = async () => {
    if (!arquivo || !arquivo.name.endsWith('.pdf')) {
      alert('Selecione um PDF original para gerar as tarjas');
      return;
    }
    setLoadingPDF(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      const res = await axios.post(`${API}/documents/download-pdf`, formData, {
        headers: authHeaders,
        responseType: 'blob',
        timeout: 120000
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'documento-anonimizado.pdf';
      a.click();
    } catch (err) {
      alert('Erro ao gerar PDF');
    }
    setLoadingPDF(false);
  };

  const baixarTXT = () => {
    const blob = new Blob([resultado.textoAnonimizado], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'documento-anonimizado.txt';
    a.click();
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Documento</h2>
        <label>Cole o texto ou faça upload de PDF/Word</label>
        <textarea value={texto} onChange={e => { setTexto(e.target.value); setArquivo(null); setNomeArquivo(''); setResultado(null); }} rows={8} placeholder="Cole aqui o contrato, ata, processo, folha de pagamento..." style={{ fontFamily: 'monospace', fontSize: 13 }} />
        <label>Ou selecione um arquivo (.pdf ou .docx)</label>
        <input id="arquivo-input" type="file" accept=".pdf,.docx,.doc" onChange={handleArquivo} style={{ marginBottom: 0 }} />
        {nomeArquivo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: '#1d4ed8' }}>📎 {nomeArquivo}</span>
            <button type="button" onClick={removerArquivo} title="Remover arquivo" style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #dc2626', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        )}
      </div>

      {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
      <button className="btn-primary" onClick={handleSubmit} disabled={loading} style={{ marginBottom: 24 }}>
        {loading ? '⏳ Processando... (pode levar até 1 minuto)' : 'Anonimizar documento'}
      </button>

      {resultado && resultado.pdf && (
        <div className="card" style={{ background: '#dcfce7', border: '1px solid #16a34a' }}>
          <p style={{ color: '#16a34a', fontWeight: 600, fontSize: 14 }}>PDF anonimizado com tarjas gerado e baixado com sucesso!</p>
          <p style={{ color: '#166534', fontSize: 12, marginTop: 4 }}>O arquivo foi salvo na sua pasta de downloads.</p>
        </div>
      )}

      {resultado && !resultado.pdf && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Resultado</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
              Tipo: {resultado.tipoDocumento}
            </span>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: 20, fontSize: 12 }}>
              {Object.values(resultado.stats).reduce((a, b) => a + b, 0)} dados mascarados
            </span>
            {resultado.ocrUsado && (
              <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                Lido via digitalizacao
              </span>
            )}
          </div>
          {resultado.stats && Object.values(resultado.stats).reduce((a, b) => a + b, 0) === 0 ? (
            <div style={{ background: '#f0f9ff', border: '1px solid #0ea5e9', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              <p style={{ color: '#0369a1', fontSize: 13, fontWeight: 500, margin: 0 }}>Documento processado. Nenhum dado pessoal identificado.</p>
            </div>
          ) : (
            <textarea value={resultado.textoAnonimizado} readOnly rows={10} style={{ fontFamily: 'monospace', fontSize: 13, background: '#f8fafc' }} />
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={baixarPDF} disabled={loadingPDF} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              {loadingPDF ? '⏳ Gerando...' : '⬇ Baixar PDF'}
            </button>
            <button onClick={baixarTXT} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #64748b', background: 'white', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>
              ⬇ Baixar TXT
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Fundamentação legal:</p>
            {resultado.leisAplicaveis?.map((l, i) => (
              <span key={i} style={{ display: 'inline-block', background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginRight: 4, marginBottom: 4 }}>{l}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
