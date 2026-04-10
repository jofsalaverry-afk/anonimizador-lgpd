import { useState } from 'react';
import axios from 'axios';

const API = 'https://anonimizador-lgpd-production.up.railway.app';

export default function Anonimizador({ token }) {
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [mascara, setMascara] = useState('asterisk');
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

  const handleSubmit = async () => {
    if (!texto.trim() && !arquivo) return setErro('Cole um texto ou selecione um arquivo');
    setLoading(true);
    setErro('');
    try {
      const formData = new FormData();
      if (arquivo) formData.append('arquivo', arquivo);
      else formData.append('texto', texto);
      formData.append('mascara', mascara);

      if (arquivo && arquivo.name.endsWith('.pdf')) {
        const res = await axios.post(`${API}/documents/anonymize`, formData, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
          responseType: 'blob',
          timeout: 120000
        });
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'documento-anonimizado.pdf';
        a.click();
        setResultado({ pdf: true });
      } else {
        const res = await axios.post(`${API}/documents/anonymize`, formData, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
          timeout: 120000
        });
        setResultado(res.data);
      }
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao processar');
    }
    setLoading(false);
  };

  const baixarPDF = async () => {
    setLoadingPDF(true);
    try {
      const res = await axios.post(`${API}/documents/download-pdf`, {
        textoAnonimizado: resultado.textoAnonimizado,
        tipoDocumento: resultado.tipoDocumento,
        leisAplicaveis: resultado.leisAplicaveis
      }, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
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
        <input type="file" accept=".pdf,.docx,.doc" onChange={handleArquivo} style={{ marginBottom: 0 }} />
        {nomeArquivo && <p style={{ fontSize: 12, color: '#1d4ed8', marginTop: 4 }}>📎 {nomeArquivo}</p>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ marginBottom: 8 }}>Formato da máscara</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: 'asterisk', label: '●●●●● asteriscos' },
            { key: 'tarjeta', label: '████ tarjeta' },
            { key: 'etiqueta', label: '[CPF] etiqueta' }
          ].map(m => (
            <button key={m.key} onClick={() => setMascara(m.key)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 13, background: mascara === m.key ? '#dbeafe' : 'white', borderColor: mascara === m.key ? '#1d4ed8' : '#e2e8f0', color: mascara === m.key ? '#1d4ed8' : '#64748b', fontWeight: mascara === m.key ? 500 : 400 }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {erro && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
      <button className="btn-primary" onClick={handleSubmit} disabled={loading} style={{ marginBottom: 24 }}>
        {loading ? '⏳ Processando... (pode levar até 1 minuto)' : 'Anonimizar documento'}
      </button>

      {resultado && resultado.pdf && (
        <div className="card" style={{ background: '#dcfce7', border: '1px solid #16a34a' }}>
          <p style={{ color: '#16a34a', fontWeight: 600, fontSize: 14 }}>✅ PDF anonimizado com tarjas gerado e baixado com sucesso!</p>
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
          </div>
          <textarea value={resultado.textoAnonimizado} readOnly rows={10} style={{ fontFamily: 'monospace', fontSize: 13, background: '#f8fafc' }} />
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
