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
      <div className="card mb-16">
        <h2 className="card-header">Documento</h2>
        <label>Cole o texto ou faça upload de PDF/Word</label>
        <textarea value={texto} onChange={e => { setTexto(e.target.value); setArquivo(null); setNomeArquivo(''); setResultado(null); }} rows={8} placeholder="Cole aqui o contrato, ata, processo, folha de pagamento..." style={{ fontFamily: 'monospace' }} />
        <label>Ou selecione um arquivo (.pdf ou .docx)</label>
        <input id="arquivo-input" type="file" accept=".pdf,.docx,.doc" onChange={handleArquivo} />
        {nomeArquivo && (
          <div className="file-pill">
            <span>📎 {nomeArquivo}</span>
            <button type="button" className="file-remove" onClick={removerArquivo} title="Remover arquivo">×</button>
          </div>
        )}
      </div>

      {erro && <p className="text-error mb-16">{erro}</p>}
      <button className="btn-primary mb-24" onClick={handleSubmit} disabled={loading}>
        {loading ? '⏳ Processando... (pode levar até 1 minuto)' : 'Anonimizar documento'}
      </button>

      {resultado && resultado.pdf && (
        <div className="alert-success">
          <p><strong>PDF anonimizado com tarjas gerado e baixado com sucesso!</strong></p>
          <p>O arquivo foi salvo na sua pasta de downloads.</p>
        </div>
      )}

      {resultado && !resultado.pdf && (
        <div className="card">
          <h2 className="card-header">Resultado</h2>
          <div className="badge-row mb-16">
            <span className="badge-success">
              Tipo: {resultado.tipoDocumento}
            </span>
            <span className="badge-muted">
              {Object.values(resultado.stats).reduce((a, b) => a + b, 0)} dados mascarados
            </span>
            {resultado.ocrUsado && (
              <span className="badge-warning">
                Lido via digitalizacao
              </span>
            )}
          </div>
          {resultado.stats && Object.values(resultado.stats).reduce((a, b) => a + b, 0) === 0 ? (
            <div className="alert-info mb-16">
              <p>Documento processado. Nenhum dado pessoal identificado.</p>
            </div>
          ) : (
            <textarea value={resultado.textoAnonimizado} readOnly rows={10} style={{ fontFamily: 'monospace' }} />
          )}
          <div className="btn-row">
            <button className="btn-primary" onClick={baixarPDF} disabled={loadingPDF}>
              {loadingPDF ? '⏳ Gerando...' : '⬇ Baixar PDF'}
            </button>
            <button className="btn-secondary" onClick={baixarTXT}>
              ⬇ Baixar TXT
            </button>
          </div>
          <div className="mb-16">
            <p className="badge-muted mb-16"><strong>Fundamentação legal:</strong></p>
            {resultado.leisAplicaveis?.map((l, i) => (
              <span key={i} className="badge-legal">{l}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
