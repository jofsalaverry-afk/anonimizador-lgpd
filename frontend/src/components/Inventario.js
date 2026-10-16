import { useState } from 'react';
import InventarioList from './InventarioList';
import InventarioForm from './InventarioForm';
import InventarioDetail from './InventarioDetail';

export default function Inventario({ token }) {
  const [tela, setTela] = useState('list');
  const [sistemaId, setSistemaId] = useState(null);

  if (tela === 'novo') return <InventarioForm token={token} onVoltar={() => setTela('list')} />;
  if (tela === 'editar') {
    return <InventarioForm token={token} sistemaId={sistemaId} onVoltar={() => setTela('ver')} />;
  }
  if (tela === 'ver') {
    return (
      <InventarioDetail
        token={token}
        sistemaId={sistemaId}
        onVoltar={() => setTela('list')}
        onEditar={() => setTela('editar')}
        onAbrir={(id) => setSistemaId(id)}
      />
    );
  }
  return (
    <InventarioList
      token={token}
      onNovo={() => setTela('novo')}
      onVer={(id) => { setSistemaId(id); setTela('ver'); }}
    />
  );
}
