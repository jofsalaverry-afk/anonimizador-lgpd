import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../config';

const TIPO_ICON = {
  DSAR_PRAZO: '⏰',
  CHECKLIST_REVISAO: '📋',
  INCIDENTE_ABERTO: '⚠️',
  ROPA_DESATUALIZADO: '📁'
};

const TIPO_LABEL = {
  DSAR_PRAZO: 'Prazo DSAR',
  CHECKLIST_REVISAO: 'Revisão de checklist',
  INCIDENTE_ABERTO: 'Incidente em aberto',
  ROPA_DESATUALIZADO: 'ROPA desatualizado'
};

const CRIT_BADGE = {
  ALTA: 'badge badge-danger',
  MEDIA: 'badge badge-warning',
  BAIXA: 'badge badge-info'
};

const CRIT_ORDER = { ALTA: 0, MEDIA: 1, BAIXA: 2 };

function AlertasCenter({ token }) {
  const [alertas, setAlertas] = useState([]);
  const [naoLidos, setNaoLidos] = useState(0);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`${API}/conformidade/alertas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setAlertas(data.alertas || []);
      setNaoLidos(data.naoLidos || 0);
    } catch (err) {
      // silencioso: nao quebrar o header caso backend esteja fora
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    carregar();
    const id = setInterval(carregar, 60000);
    return () => clearInterval(id);
  }, [token, carregar]);

  const marcarLido = async (id) => {
    try {
      const res = await fetch(`${API}/conformidade/alertas/${id}/ler`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      setAlertas((prev) =>
        prev.map((a) => (a.id === id ? { ...a, lido: true } : a))
      );
      setNaoLidos((prev) => Math.max(0, prev - 1));
    } catch (err) {
      // silencioso
    }
  };

  const formatarData = (iso) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

  const alertasOrdenados = [...alertas].sort((a, b) => {
    const critA = CRIT_ORDER[a.criticidade] ?? 99;
    const critB = CRIT_ORDER[b.criticidade] ?? 99;
    if (critA !== critB) return critA - critB;
    return new Date(b.criadoEm) - new Date(a.criadoEm);
  });

  return (
    <>
      <button
        type="button"
        className="alertas-bell"
        onClick={() => setAberto((v) => !v)}
        aria-label="Alertas de conformidade"
      >
        🔔
        {naoLidos > 0 && (
          <span className="alertas-bell-badge">{naoLidos}</span>
        )}
      </button>

      {aberto && (
        <>
          <div
            className="alertas-backdrop"
            onClick={() => setAberto(false)}
          />
          <aside className="alertas-drawer">
            <div className="alertas-drawer-header">
              <span className="alertas-drawer-title">
                Alertas de conformidade
              </span>
              <button
                type="button"
                className="alertas-drawer-close"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="alertas-drawer-body">
              {alertasOrdenados.length === 0 ? (
                <div className="empty-state">
                  <p>Nenhum alerta no momento</p>
                </div>
              ) : (
                alertasOrdenados.map((a) => (
                  <div
                    key={a.id}
                    className={`alerta-item${a.lido ? ' alerta-item-lido' : ''}`}
                  >
                    <div className="alerta-icon">
                      {TIPO_ICON[a.tipo] || '🔔'}
                    </div>
                    <div className="alerta-content">
                      <div className="alerta-tipo">
                        {TIPO_LABEL[a.tipo] || a.tipo}
                      </div>
                      <div className="alerta-msg">{a.mensagem}</div>
                      <div className="flex gap-8 flex-center">
                        <span className={CRIT_BADGE[a.criticidade] || 'badge badge-muted'}>
                          {a.criticidade}
                        </span>
                        <span className="alerta-date">
                          {formatarData(a.criadoEm)}
                        </span>
                      </div>
                      {!a.lido && (
                        <button
                          type="button"
                          className="alerta-mark-read"
                          onClick={() => marcarLido(a.id)}
                        >
                          Marcar como lido
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

export default AlertasCenter;
