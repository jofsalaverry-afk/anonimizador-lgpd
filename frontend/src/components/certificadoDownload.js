import axios from 'axios';
import { API } from '../config';

// Baixa o PDF do certificado (rota autenticada).
export async function baixarCertificado(token, codigo) {
  const res = await axios.get(`${API}/treinamento/certificados/${codigo}/pdf`, {
    headers: { Authorization: `Bearer ${token}` }, responseType: 'blob'
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificado-${codigo}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
