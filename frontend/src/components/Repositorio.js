import { useState, useEffect } from 'react';
import RepositorioList from './RepositorioList';
import DocumentoEditor from './DocumentoEditor';
import IncidenteList from './IncidenteList';
import IncidenteForm from './IncidenteForm';

export default function Repositorio({ token, subpagina }) {
  const [tela, setTela] = useState('list');
  const [itemId, setItemId] = useState(null);

  useEffect(() => {
    setTela('list');
    setItemId(null);
  }, [subpagina]);

  if (subpagina === 'documentos') {
    if (tela === 'novo') {
      return <DocumentoEditor token={token} onVoltar={() => setTela('list')} />;
    }
    if (tela === 'ver') {
      return (
        <DocumentoEditor
          token={token}
          documentoId={itemId}
          onVoltar={() => setTela('list')}
        />
      );
    }
    if (tela === 'editar') {
      return (
        <DocumentoEditor
          token={token}
          documentoId={itemId}
          onVoltar={() => setTela('list')}
        />
      );
    }
    return (
      <RepositorioList
        token={token}
        onNovo={() => setTela('novo')}
        onVer={(id) => { setItemId(id); setTela('ver'); }}
        onEditar={(id) => { setItemId(id); setTela('editar'); }}
      />
    );
  }

  if (subpagina === 'incidentes') {
    if (tela === 'novo') {
      return <IncidenteForm token={token} onVoltar={() => setTela('list')} />;
    }
    if (tela === 'ver') {
      return (
        <IncidenteForm
          token={token}
          incidenteId={itemId}
          onVoltar={() => setTela('list')}
        />
      );
    }
    return (
      <IncidenteList
        token={token}
        onNovo={() => setTela('novo')}
        onVer={(id) => { setItemId(id); setTela('ver'); }}
      />
    );
  }

  return <p className="text-muted">Selecione uma subpagina do repositorio.</p>;
}
