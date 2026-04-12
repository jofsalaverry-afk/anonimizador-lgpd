import { useState } from 'react';
import RopaList from './RopaList';
import RopaForm from './RopaForm';
import RopaDetail from './RopaDetail';

export default function Ropa({ token }) {
  const [tela, setTela] = useState('list');
  const [tratamentoId, setTratamentoId] = useState(null);

  if (tela === 'novo') {
    return <RopaForm token={token} onVoltar={() => setTela('list')} />;
  }
  if (tela === 'editar') {
    return <RopaForm token={token} tratamentoId={tratamentoId} onVoltar={() => setTela('list')} />;
  }
  if (tela === 'ver') {
    return (
      <RopaDetail
        token={token}
        tratamentoId={tratamentoId}
        onVoltar={() => setTela('list')}
        onEditar={(id) => { setTratamentoId(id); setTela('editar'); }}
      />
    );
  }

  return (
    <RopaList
      token={token}
      onNovo={() => setTela('novo')}
      onVer={(id) => { setTratamentoId(id); setTela('ver'); }}
      onEditar={(id) => { setTratamentoId(id); setTela('editar'); }}
    />
  );
}
