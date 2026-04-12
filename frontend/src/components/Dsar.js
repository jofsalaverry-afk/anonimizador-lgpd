import { useState } from 'react';
import DsarList from './DsarList';
import DsarForm from './DsarForm';
import DsarDetail from './DsarDetail';

export default function Dsar({ token }) {
  const [tela, setTela] = useState('list');
  const [solicitacaoId, setSolicitacaoId] = useState(null);

  if (tela === 'nova') {
    return <DsarForm token={token} onVoltar={() => setTela('list')} />;
  }
  if (tela === 'ver') {
    return (
      <DsarDetail
        token={token}
        solicitacaoId={solicitacaoId}
        onVoltar={() => setTela('list')}
      />
    );
  }

  return (
    <DsarList
      token={token}
      onNova={() => setTela('nova')}
      onVer={(id) => { setSolicitacaoId(id); setTela('ver'); }}
    />
  );
}
