import { useEffect } from 'react';
import { useToastStore, type Toast as ToastType } from '../../stores/toastStore';
import './toast.css';

// Время автозакрытия для разных типов (мс)
const AUTO_DISMISS_MS = { success: 2000, info: 4000 } as const;

function Toast({ toast }: { toast: ToastType }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (toast.type === 'success' || toast.type === 'info') {
      const ms = AUTO_DISMISS_MS[toast.type];
      const timer = setTimeout(() => dismiss(toast.id), ms);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast.id, toast.type, dismiss]);

  return (
    <div className={`toast toast-${toast.type}`} role="status">
      {toast.type === 'loading' && <span className="toast-spinner" aria-hidden />}
      <span className="toast-message">{toast.message}</span>
      {(toast.type === 'error' || toast.type === 'loading') && (
        <button
          className="toast-close"
          onClick={() => dismiss(toast.id)}
          aria-label="Закрыть"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
