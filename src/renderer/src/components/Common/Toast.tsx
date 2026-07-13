import { useUIStore } from '../../stores/uiStore'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export function ToastContainer(): JSX.Element {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return <></>

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={16} color="var(--success)" />}
          {toast.type === 'error' && <AlertCircle size={16} color="var(--error)" />}
          {toast.type === 'info' && <Info size={16} color="var(--info)" />}
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => removeToast(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
