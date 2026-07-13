import { useFileStore } from '../../stores/fileStore'
import { useUIStore } from '../../stores/uiStore'
import { useAccountStore } from '../../stores/accountStore'
import { getFileIcon, formatBytes, formatDate } from '../../lib/utils'
import { useState, useRef, useEffect, useCallback } from 'react'
import { CloudOff, HardDrive, Upload, FolderPlus } from 'lucide-react'

export function FileList(): JSX.Element {
  const { files, isLoading, currentFolderId, setCurrentFolder, selectedFiles, toggleSelect, searchQuery, driveViewMode } = useFileStore()
  const { viewMode, setContextMenu, isRenaming, setRenaming, showToast, setPreviewFile } = useUIStore()
  const { activeAccountId } = useAccountStore()
  const [renamingValue, setRenamingValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      const file = files.find(f => f.id === isRenaming)
      if (file && renameInputRef.current) {
        setRenamingValue(file.name)
        // Need a tiny delay for React to update the input value before selecting
        setTimeout(() => {
          if (renameInputRef.current) {
            renameInputRef.current.focus()
            const name = file.name
            const lastDot = name.lastIndexOf('.')
            // Select without extension if it has one and is not a folder
            if (!file.isFolder && lastDot > 0) {
              renameInputRef.current.setSelectionRange(0, lastDot)
            } else {
              renameInputRef.current.select()
            }
          }
        }, 10)
      }
    }
  }, [isRenaming, files])

  const handleDoubleClick = useCallback(
    (file: { id: string; name: string; isFolder: boolean }) => {
      if (file.isFolder) {
        if (driveViewMode === 'trash') {
          showToast('Cannot open folder in Trash', 'info')
          return
        }
        setCurrentFolder(file.id, file.name)
      } else {
        setPreviewFile(file.id)
      }
    },
    [setCurrentFolder, setPreviewFile, driveViewMode, showToast]
  )

  const handleFileClick = useCallback(
    (e: React.MouseEvent, fileId: string) => {
      e.stopPropagation()
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(fileId)
      } else {
        useFileStore.getState().selectOnly(fileId)
      }
    },
    [toggleSelect]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, fileId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, fileId })
    },
    [setContextMenu]
  )

  const handleRenameSubmit = useCallback(
    async (fileId: string) => {
      if (!activeAccountId || !renamingValue.trim()) {
        setRenaming(null)
        return
      }
      try {
        const result = await window.api.storage.renameFile(activeAccountId, fileId, renamingValue.trim())
        if (result.success) {
          useFileStore.getState().updateFile(fileId, { name: renamingValue.trim() })
          showToast('File renamed', 'success')
        } else {
          showToast(result.error || 'Rename failed', 'error')
        }
      } catch {
        showToast('Rename failed', 'error')
      }
      setRenaming(null)
    },
    [activeAccountId, renamingValue, setRenaming, showToast]
  )

  const startRename = useCallback(
    (fileId: string, currentName: string) => {
      setRenamingValue(currentName)
      setRenaming(fileId)
    },
    [setRenaming]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>Loading files...</span>
      </div>
    )
  }

  // No account state
  if (!activeAccountId) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <CloudOff size={36} />
        </div>
        <h3>No Account Connected</h3>
        <p>Connect a Google Drive account from the sidebar to start managing your files.</p>
      </div>
    )
  }

  // Empty state
  if (files.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <HardDrive size={36} />
        </div>
        <h3>{searchQuery ? 'No results found' : 'This folder is empty'}</h3>
        <p>
          {searchQuery
            ? `No files matching "${searchQuery}"`
            : 'Upload files or create a new folder to get started.'}
        </p>
      </div>
    )
  }

  // Grid view
  if (viewMode === 'grid') {
    return (
      <div className="file-grid" onClick={() => useFileStore.getState().clearSelection()}>
        {files.map((file) => (
          <div
            key={file.id}
            className={`file-card ${selectedFiles.has(file.id) ? 'selected' : ''}`}
            onClick={(e) => handleFileClick(e, file.id)}
            onDoubleClick={() => handleDoubleClick(file)}
            onContextMenu={(e) => handleContextMenu(e, file.id)}
          >
            <div className="file-card-icon">{getFileIcon(file.mimeType, 24)}</div>
            {isRenaming === file.id ? (
              <input
                ref={renameInputRef}
                className="rename-input"
                value={renamingValue}
                onChange={(e) => setRenamingValue(e.target.value)}
                onBlur={() => handleRenameSubmit(file.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(file.id)
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <div className="file-card-name" title={file.name}>
                {file.name}
              </div>
            )}
            <div className="file-card-meta">
              {file.isFolder ? formatDate(file.modifiedTime) : formatBytes(file.size)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // List view
  return (
    <div className="file-list" onClick={() => useFileStore.getState().clearSelection()}>
      <div className="file-list-header">
        <span>Name</span>
        <span>Size</span>
        <span>Modified</span>
        <span>Type</span>
      </div>
      {files.map((file) => (
        <div
          key={file.id}
          className={`file-list-item ${selectedFiles.has(file.id) ? 'selected' : ''}`}
          onClick={(e) => handleFileClick(e, file.id)}
          onDoubleClick={() => handleDoubleClick(file)}
          onContextMenu={(e) => handleContextMenu(e, file.id)}
        >
          <div className="file-list-item-name">
            {getFileIcon(file.mimeType, 18)}
            {isRenaming === file.id ? (
              <input
                ref={renameInputRef}
                className="rename-input"
                value={renamingValue}
                onChange={(e) => setRenamingValue(e.target.value)}
                onBlur={() => handleRenameSubmit(file.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(file.id)
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span title={file.name}>{file.name}</span>
            )}
          </div>
          <span className="file-list-item-size">
            {file.isFolder ? '-' : formatBytes(file.size)}
          </span>
          <span className="file-list-item-date">{formatDate(file.modifiedTime)}</span>
          <span className="file-list-item-size">
            {file.isFolder ? 'Folder' : file.mimeType.split('/').pop()?.split('.').pop()?.toUpperCase() || 'File'}
          </span>
        </div>
      ))}
    </div>
  )
}

// Re-export helper for context menu
export { startRenameHelper }

function startRenameHelper(fileId: string): void {
  const file = useFileStore.getState().files.find((f) => f.id === fileId)
  if (file) {
    useUIStore.getState().setRenaming(fileId)
  }
}
