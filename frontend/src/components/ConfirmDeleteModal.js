import { useState } from 'react';

export default function ConfirmDeleteModal({ org, onConfirm, onCancel, loading }) {
  const [confirmText, setConfirmText] = useState('');
  const expected = `EXCLUIR ${org?.nome || ''}`;
  const canConfirm = confirmText === expected && !loading;

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Excluir organização</h3>

        <div className="modal-warn">
          <strong>Ação irreversível.</strong> Vai excluir permanentemente a organização <strong>{org?.nome}</strong>. Só é permitido quando a organização não tem dados vinculados.
        </div>

        <div className="modal-field">
          <div className="text-sm mb-8">Para confirmar, digite exatamente:</div>
          <code className="modal-code">{expected}</code>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expected}
            disabled={loading}
            autoFocus
          />
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(org.id)}
            className="btn-danger"
            disabled={!canConfirm}
          >
            {loading ? 'Excluindo...' : 'Excluir permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
}
