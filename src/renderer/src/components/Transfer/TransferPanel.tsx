import { useTransferStore, Transfer } from '../../stores/transferStore'
import {
  ChevronDown,
  ChevronUp,
  X,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Trash2
} from 'lucide-react'

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return ''
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function TransferItem({ transfer }: { transfer: Transfer }): JSX.Element {
  const { removeTransfer } = useTransferStore()

  const icon =
    transfer.type === 'upload' ? (
      <Upload size={14} className="transfer-type-icon upload" />
    ) : (
      <Download size={14} className="transfer-type-icon download" />
    )

  const statusIcon =
    transfer.status === 'completed' ? (
      <CheckCircle2 size={14} className="transfer-status-icon completed" />
    ) : transfer.status === 'error' ? (
      <AlertCircle size={14} className="transfer-status-icon error" />
    ) : null

  return (
    <div className={`transfer-item ${transfer.status}`}>
      <div className="transfer-item-info">
        <div className="transfer-item-icon">{icon}</div>
        <div className="transfer-item-details">
          <div className="transfer-item-name" title={transfer.fileName}>
            {transfer.fileName}
          </div>
          <div className="transfer-item-meta">
            {transfer.status === 'active' && (
              <>
                <span>{transfer.progress}%</span>
                {transfer.speed > 0 && (
                  <>
                    <span className="transfer-meta-sep">·</span>
                    <span>{formatSpeed(transfer.speed)}</span>
                  </>
                )}
                {transfer.fileSize > 0 && (
                  <>
                    <span className="transfer-meta-sep">·</span>
                    <span>{formatSize(transfer.fileSize)}</span>
                  </>
                )}
              </>
            )}
            {transfer.status === 'completed' && <span className="transfer-done-text">Completed</span>}
            {transfer.status === 'error' && (
              <span className="transfer-error-text">{transfer.error || 'Failed'}</span>
            )}
          </div>
        </div>
        <div className="transfer-item-actions">
          {statusIcon}
          <button
            className="transfer-remove-btn"
            onClick={() => removeTransfer(transfer.id)}
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      {transfer.status === 'active' && (
        <div className="transfer-progress-bar">
          <div
            className="transfer-progress-fill"
            style={{ width: `${transfer.progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function TransferPanel(): JSX.Element | null {
  const { transfers, isExpanded, togglePanel, clearCompleted } = useTransferStore()

  if (transfers.length === 0) return null

  const activeCount = transfers.filter((t) => t.status === 'active').length
  const completedCount = transfers.filter((t) => t.status !== 'active').length

  // Calculate overall progress for active transfers
  const totalProgress =
    activeCount > 0
      ? Math.round(
          transfers
            .filter((t) => t.status === 'active')
            .reduce((sum, t) => sum + t.progress, 0) / activeCount
        )
      : 100

  return (
    <div className={`transfer-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="transfer-panel-header" onClick={togglePanel}>
        <div className="transfer-panel-header-left">
          {activeCount > 0 ? (
            <>
              <div className="transfer-spinner" />
              <span>
                {activeCount} transfer{activeCount !== 1 ? 's' : ''} in progress · {totalProgress}%
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="transfer-all-done-icon" />
              <span>All transfers completed</span>
            </>
          )}
        </div>
        <div className="transfer-panel-header-right">
          {completedCount > 0 && (
            <button
              className="transfer-clear-btn"
              onClick={(e) => {
                e.stopPropagation()
                clearCompleted()
              }}
              title="Clear completed"
            >
              <Trash2 size={12} />
            </button>
          )}
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </div>
      {isExpanded && (
        <div className="transfer-panel-body">
          {transfers.map((transfer) => (
            <TransferItem key={transfer.id} transfer={transfer} />
          ))}
        </div>
      )}
    </div>
  )
}
