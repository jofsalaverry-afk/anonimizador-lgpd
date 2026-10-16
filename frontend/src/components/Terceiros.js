import { useState } from 'react';
import TerceiroList from './TerceiroList';
import TerceiroForm from './TerceiroForm';
import TerceiroDetail from './TerceiroDetail';

export default function Terceiros({ token, usuario }) {
  const [tela, setTela] = useState('list');
  const [terceiroId, setTerceiroId] = useState(null);

  if (tela === 'novo') {
    return <TerceiroForm token={token} onVoltar={() => setTela('list')} onSalvo={(id) => { setTerceiroId(id); setTela('ver'); }} />;
  }
  if (tela === 'editar') {
    return <TerceiroForm token={token} terceiroId={terceiroId} onVoltar={() => setTela('ver')} onSalvo={() => setTela('ver')} />;
  }
  if (tela === 'ver') {
    return <TerceiroDetail token={token} usuario={usuario} terceiroId={terceiroId} onVoltar={() => setTela('list')} onEditar={() => setTela('editar')} />;
  }
  return <TerceiroList token={token} onNovo={() => setTela('novo')} onVer={(id) => { setTerceiroId(id); setTela('ver'); }} />;
}
