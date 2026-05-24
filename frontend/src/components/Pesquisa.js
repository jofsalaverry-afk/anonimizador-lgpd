import { useState } from 'react';
import PesquisaList from './PesquisaList';
import PesquisaDetail from './PesquisaDetail';
import PesquisaMetricas from './PesquisaMetricas';
import PesquisaConfig from './PesquisaConfig';

export default function Pesquisa({ token, usuario }) {
  const [tela, setTela] = useState('metricas'); // 'metricas' | 'list' | 'detail' | 'config'
  const [pesquisaId, setPesquisaId] = useState(null);

  if (tela === 'detail' && pesquisaId) {
    return (
      <PesquisaDetail
        token={token}
        pesquisaId={pesquisaId}
        onVoltar={() => setTela('list')}
      />
    );
  }
  if (tela === 'list') {
    return (
      <PesquisaList
        token={token}
        onVer={(id) => { setPesquisaId(id); setTela('detail'); }}
        onMetricas={() => setTela('metricas')}
        onConfig={() => setTela('config')}
      />
    );
  }
  if (tela === 'config') {
    return (
      <PesquisaConfig
        token={token}
        usuario={usuario}
        onVoltar={() => setTela('metricas')}
      />
    );
  }
  return (
    <PesquisaMetricas
      token={token}
      usuario={usuario}
      onLista={() => setTela('list')}
      onConfig={() => setTela('config')}
    />
  );
}
