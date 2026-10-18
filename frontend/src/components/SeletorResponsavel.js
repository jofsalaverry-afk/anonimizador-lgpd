import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

// Select com os usuarios ativos da organizacao (GET /usuarios).
// value/onChange trabalham com o id; '' = sem responsavel.
export default function SeletorResponsavel({ token, value, onChange, className = '' }) {
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    let cancelado = false;
    axios.get(`${API}/usuarios`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (!cancelado) setUsuarios(res.data); })
      .catch(() => { if (!cancelado) setUsuarios([]); });
    return () => { cancelado = true; };
  }, [token]);

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Sem responsável designado</option>
      {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
    </select>
  );
}
