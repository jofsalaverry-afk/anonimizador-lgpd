import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import Anexos from './Anexos';
import Historico from './Historico';
import { TIPO_SISTEMA_LABEL, HOSPEDAGEM_LABEL } from './rotulos';
import { normalizarCategorias } from '../basesLegais';

function Campo({ label, children }) {
  return (
    <div className="mb-8">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children || '—'}</div>
    </div>
  );
}

export default function InventarioDetail({ token, sistemaId, onVoltar, onEditar, onAbrir }) {
  const [s, setS] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    setS(null);
    axios.get(`${API}/inventario/sistemas/${sistemaId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setS(res.data))
      .catch(err => setErro(err.response?.data?.erro || 'Erro ao carregar sistema'));
  }, [token, sistemaId]);

  if (erro) return <div className="alert-error">{erro}</div>;
  if (!s) return <p className="text-muted">Carregando...</p>;

  const hospedagem = [s.tipoHospedagem && HOSPEDAGEM_LABEL[s.tipoHospedagem], s.paisHospedagem, s.regiaoHospedagem].filter(Boolean).join(' · ');

  return (
    <div>
      <div className="page-header mb-16">
        <button onClick={onVoltar} className="link-back">← Voltar</button>
        <h2 className="page-title">{s.nome}</h2>
        <span className="badge badge-purple">{TIPO_SISTEMA_LABEL[s.tipo]}</span>
        {!s.ativo && <span className="badge badge-muted">desativado</span>}
      </div>

      <div className="card mb-16">
        <div className="grid-2">
          <div>
            <Campo label="Finalidade">{s.finalidade}</Campo>
            <Campo label="Responsável">{s.responsavel?.nome}</Campo>
            <Campo label="Fornecedor">{s.terceiro?.razaoSocial}</Campo>
            <Campo label="Local de hospedagem">{hospedagem}</Campo>
          </div>
          <div>
            <Campo label="Categorias de dados">
              {(s.categoriasDados || []).length > 0 && (
                <div className="badge-row">{normalizarCategorias(s.categoriasDados).map(c => <span key={c} className="badge badge-purple">{c}</span>)}</div>
              )}
            </Campo>
            <Campo label="Compartilhamento">{s.formasCompartilhamento}</Campo>
            <Campo label="Integrações">
              {(s.integracoes || []).length > 0 && (
                <div className="badge-row">
                  {s.integracoes.map(i => (
                    <button key={i.id} type="button" className="badge badge-info" style={{ cursor: 'pointer' }} onClick={() => onAbrir(i.id)}>{i.nome}</button>
                  ))}
                </div>
              )}
            </Campo>
          </div>
        </div>
        <div className="card-divider btn-row mt-16">
          <button onClick={onEditar} className="btn-primary btn-sm">Editar sistema</button>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-header">Tratamentos do ROPA que usam este sistema ({s.tratamentos.length})</div>
        {s.tratamentos.length === 0 ? (
          <p className="text-muted">Nenhum tratamento vinculado. Vincule pelo formulário do ROPA.</p>
        ) : (
          s.tratamentos.map(t => (
            <div key={t.id} className="comp-item">
              <span className="comp-name">{t.nome}</span>
              <span className="comp-detail"> — {t.finalidade}</span>
              {!t.ativo && <span className="badge badge-muted" style={{ marginLeft: 6 }}>inativo</span>}
            </div>
          ))
        )}
      </div>

      <Anexos token={token} entidade="SISTEMA" registroId={s.id} onEnviado={() => setVersao(v => v + 1)} />
      <Historico token={token} entidade="SISTEMA" registroId={s.id} versao={versao} />
    </div>
  );
}
