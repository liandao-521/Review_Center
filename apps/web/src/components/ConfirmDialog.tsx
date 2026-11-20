import { useCallback, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PendingConfirm = ConfirmOptions & { resolve: (confirmed: boolean) => void };

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPending({ ...options, resolve });
  }), []);
  const close = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };
  const dialog = pending && <div className="modal-backdrop confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close(false)}>
    <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <button className="icon-button confirm-close" aria-label="关闭" onClick={() => close(false)}><X size={17} /></button>
      <div className={`confirm-dialog-icon ${pending.danger ? 'danger' : ''}`}><AlertTriangle size={20} /></div>
      <h2 id="confirm-dialog-title">{pending.title}</h2>
      <p id="confirm-dialog-message">{pending.message}</p>
      <footer><button className="button button-outline" onClick={() => close(false)}>{pending.cancelLabel ?? '取消'}</button><button className={`button ${pending.danger ? 'button-danger' : 'button-primary'}`} onClick={() => close(true)}>{pending.confirmLabel ?? '确认'}</button></footer>
    </section>
  </div>;
  return { confirm, dialog };
}
