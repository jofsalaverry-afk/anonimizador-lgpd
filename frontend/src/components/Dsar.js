import { useState } from 'react';
import DsarList from './DsarList';
import DsarForm from './DsarForm';
import DsarDetail from './DsarDetail';
import DsarModelos from './DsarModelos';

export default function Dsar({ token, usuario, filtroInicial }) {
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
  if (tela === 'modelos') {
    return (
      <div>
        <button onClick={() => setTela('list')} className="link-back mb-12">← Solicitações</button>
        <DsarModelos token={token} usuario={usuario} />
      </div>
    );
  }

  return (
    <div>
      <div className="btn-row mb-12" style={{ justifyContent: 'flex-end' }}>
        <button onClick={() => setTela('modelos')} className="btn-secondary btn-sm">Modelos de resposta</button>
      </div>
      <DsarList
        token={token}
        filtroInicial={filtroInicial}
        onNova={() => setTela('nova')}
        onVer={(id) => { setSolicitacaoId(id); setTela('ver'); }}
      />
    </div>
  );
}
