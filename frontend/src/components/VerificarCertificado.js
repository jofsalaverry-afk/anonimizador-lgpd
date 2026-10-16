import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

// Pagina publica #certificado/:codigo — confirma a autenticidade de um
// certificado de treinamento (so nome, trilha e data).
export default function VerificarCertificado({ codigo }) {
  const [estado, setEstado] = useState({ carregando: true });

  useEffect(() => {
    axios.get(`${API}/certificado/verificar/${encodeURIComponent(codigo)}`)
      .then(res => setEstado({ dados: res.data }))
      .catch(err => setEstado({ invalido: err.response?.status === 404, erro: err.response?.data?.erro }));
  }, [codigo]);

  return (
    <div className="page-center">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🎓</div>
          <h1 className="login-title">Verificação de certificado</h1>
          <p className="login-subtitle">Código {codigo}</p>
        </div>
        {estado.carregando && <p className="text-muted">Verificando...</p>}
        {estado.dados && (
          <div className="alert-success">
            <strong>Certificado válido.</strong>
            <div className="mt-8">{estado.dados.nome} concluiu a trilha "{estado.dados.trilha}" em {new Date(estado.dados.concluidoEm).toLocaleDateString('pt-BR')}.</div>
          </div>
        )}
        {estado.invalido && <div className="alert-error">Certificado não encontrado. Confira o código impresso no documento.</div>}
        {!estado.carregando && !estado.dados && !estado.invalido && <div className="alert-error">{estado.erro || 'Não foi possível verificar agora. Tente mais tarde.'}</div>}
      </div>
    </div>
  );
}
