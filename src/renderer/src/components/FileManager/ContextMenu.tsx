import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { useAccountStore } from '../../stores/accountStore'
import { useTransferStore } from '../../stores/transferStore'
import { useEffect, useCallback, useState } from 'react'
import { Download, Trash2, Edit3, ExternalLink, Star, RotateCcw, XCircle, StarOff } from 'lucide-react'
import { ConfirmModal } from '../Common/ConfirmModal'

export function ContextMenu(): JSX.Element | null {
  const { contextMenu, setContextMenu, setRenaming, showToast } = useUIStore()
  const { files, removeFile, updateFile, driveViewMode, selectedFiles, clearSelection } = useFileStore()
  const { activeAccountId } = useAccountStore()
  const { addTransfer, updateProgress, completeTransfer, failTransfer } = useTransferStore()

  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'permanent-delete'
    targetIds: string[]
    fileNames: string[]
  } | null>(null)

  const close = useCallback(() => setContextMenu(null), [setContextMenu])

  useEffect(() => {
    const handler = (): void => close()
    window.addEventListener('click', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [close])

  if (!contextMenu && !confirmAction) return null

  const file = contextMenu ? files.find((f) => f.id === contextMenu.fileId) : null

  const handleDownload = async (): Promise<void> => {
    if (!activeAccountId || !file) return
    close()

    const transferId = `download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    addTransfer({
      id: transferId,
      fileName: file.name,
      fileSize: file.size,
      type: 'download',
      status: 'active',
      progress: 0
    })

    const progressHandler = (data: { fileId: string; progress: number }): void => {
      if (data.fileId === file.id) {
        updateProgress(transferId, data.progress)
      }
    }
    window.api.on('transfer:progress', progressHandler)

    try {
      const result = await window.api.storage.downloadFile(activeAccountId, file.id, file.name)
      window.api.off('transfer:progress', progressHandler)

      if (result.success) {
        completeTransfer(transferId)
        showToast(`Downloaded: ${file.name}`, 'success')
      } else {
        failTransfer(transferId, result.error || 'Download failed')
        showToast(result.error || 'Download failed', 'error')
      }
    } catch {
      window.api.off('transfer:progress', progressHandler)
      failTransfer(transferId, 'Download failed')
      showToast('Download failed', 'error')
    }
  }

  const handleDelete = (): void => {
    if (!activeAccountId || !file) return
    close()

    const targetIds = selectedFiles.has(file.id) ? Array.from(selectedFiles) : [file.id]
    const fileNames = targetIds
      .map((id) => files.find((f) => f.id === id)?.name || 'Unknown')

    setConfirmAction({ type: 'delete', targetIds, fileNames })
  }

  const executeDelete = async (targetIds: string[]): Promise<void> => {
    if (!activeAccountId) return

    const { currentFolderId } = useFileStore.getState()
    let successCount = 0
    let lastError = ''

    for (const id of targetIds) {
      try {
        // Pass parentFolderId so Mega can track where to restore the file
        const fileObj = files.find((f) => f.id === id)
        const parentFolderId = fileObj?.parentId || currentFolderId || undefined
        const result = await window.api.storage.deleteFile(activeAccountId, id, parentFolderId)
        if (result.success) {
          removeFile(id)
          successCount++
        } else {
          lastError = result.error || 'Delete failed'
        }
      } catch {
        lastError = 'Delete failed'
      }
    }

    if (successCount > 0) {
      showToast(`Moved ${successCount} item(s) to trash`, 'success')
      clearSelection()
    }
    if (lastError && successCount < targetIds.length) {
      showToast(lastError, 'error')
    }
  }

  const handleRestore = async (): Promise<void> => {
    if (!activeAccountId || !file) return
    close()

    const isMultiSelect = selectedFiles.has(file.id)
    const filesToRestore = isMultiSelect
      ? files.filter((f) => selectedFiles.has(f.id))
      : [file]

    try {
      let successCount = 0
      for (const f of filesToRestore) {
        const result = await window.api.storage.restoreFile(activeAccountId, f.id)
        if (result.success) {
          removeFile(f.id)
          successCount++
        }
      }

      if (successCount > 0) {
        clearSelection()
        showToast(`Restored ${successCount} item(s)`, 'success')
      } else {
        showToast('Restore failed', 'error')
      }
    } catch {
      showToast('Restore failed', 'error')
    }
  }

  const handlePermanentDelete = (): void => {
    if (!activeAccountId || !file) return
    close()

    const isMultiSelect = selectedFiles.has(file.id)
    const filesToDelete = isMultiSelect
      ? files.filter((f) => selectedFiles.has(f.id))
      : [file]

    const targetIds = filesToDelete.map((f) => f.id)
    const fileNames = filesToDelete.map((f) => f.name)

    setConfirmAction({ type: 'permanent-delete', targetIds, fileNames })
  }

  const executePermanentDelete = async (targetIds: string[]): Promise<void> => {
    if (!activeAccountId) return

    try {
      let successCount = 0
      for (const id of targetIds) {
        const result = await window.api.storage.permanentlyDelete(activeAccountId, id)
        if (result.success) {
          removeFile(id)
          successCount++
        }
      }

      if (successCount > 0) {
        clearSelection()
        showToast(`Permanently deleted ${successCount} item(s)`, 'success')
      } else {
        showToast('Delete failed', 'error')
      }
    } catch {
      showToast('Delete failed', 'error')
    }
  }

  const handleConfirm = async (): Promise<void> => {
    if (!confirmAction) return
    const { type, targetIds } = confirmAction
    setConfirmAction(null)

    if (type === 'delete') {
      await executeDelete(targetIds)
    } else {
      await executePermanentDelete(targetIds)
    }
  }

  const handleToggleStar = async (): Promise<void> => {
    if (!activeAccountId || !file) return
    close()
    try {
      const newStarredStatus = !file.starred
      const result = await window.api.storage.toggleStar(activeAccountId, file.id, newStarredStatus)
      if (result.success) {
        if (driveViewMode === 'starred' && !newStarredStatus) {
          removeFile(file.id)
        } else {
          updateFile(file.id, { starred: newStarredStatus })
        }
        showToast(newStarredStatus ? `Starred: ${file.name}` : `Unstarred: ${file.name}`, 'success')
      } else {
        showToast(result.error || 'Failed to update star', 'error')
      }
    } catch {
      showToast('Failed to update star', 'error')
    }
  }

  const handleRename = (): void => {
    if (!file) return
    close()
    setRenaming(file.id)
  }

  const handleOpenExternal = (): void => {
    if (!file) return
    close()
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank')
    }
  }

  // --- CONFIRM MODAL ---
  if (confirmAction) {
    const isPermanent = confirmAction.type === 'permanent-delete'
    const count = confirmAction.fileNames.length
    const nameList = count <= 3
      ? confirmAction.fileNames.join(', ')
      : `${confirmAction.fileNames.slice(0, 3).join(', ')} and ${count - 3} more`

    return (
      <ConfirmModal
        title={isPermanent ? 'Delete permanently?' : 'Move to trash?'}
        message={
          isPermanent
            ? `This will permanently delete ${count > 1 ? `${count} items` : `"${nameList}"`}. This action cannot be undone.`
            : `Move ${count > 1 ? `${count} items` : `"${nameList}"`} to trash?`
        }
        confirmLabel={isPermanent ? 'Delete permanently' : 'Move to trash'}
        variant={isPermanent ? 'danger' : 'default'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    )
  }

  if (!contextMenu || !file) return null

  const style: React.CSSProperties = {
    left: contextMenu.x,
    top: contextMenu.y
  }

  // --- TRASH VIEW MENU ---
  if (driveViewMode === 'trash') {
    return (
      <div className="context-menu" style={style} onClick={(e) => e.stopPropagation()}>
        <button className="context-menu-item" onClick={handleRestore}>
          <RotateCcw size={14} />
          Restore
        </button>
        <div className="context-menu-divider" />
        <button className="context-menu-item danger" onClick={handlePermanentDelete}>
          <XCircle size={14} />
          Delete permanently
        </button>
      </div>
    )
  }

  // --- NORMAL & STARRED VIEW MENU ---
  return (
    <div className="context-menu" style={style} onClick={(e) => e.stopPropagation()}>
      {!file.isFolder && (
        <button className="context-menu-item" onClick={handleDownload}>
          <Download size={14} />
          Download
        </button>
      )}
      <button className="context-menu-item" onClick={handleRename}>
        <Edit3 size={14} />
        Rename
      </button>
      <button className="context-menu-item" onClick={handleToggleStar}>
        {file.starred ? (
          <>
            <StarOff size={14} />
            Remove from starred
          </>
        ) : (
          <>
            <Star size={14} />
            Add to starred
          </>
        )}
      </button>
      {file.webViewLink && (
        <button className="context-menu-item" onClick={handleOpenExternal}>
          <ExternalLink size={14} />
          Open in browser
        </button>
      )}
      <div className="context-menu-divider" />
      <button className="context-menu-item danger" onClick={handleDelete}>
        <Trash2 size={14} />
        Move to trash
      </button>
    </div>
  )
}
