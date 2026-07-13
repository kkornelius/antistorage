import { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { useAccountStore } from '../../stores/accountStore'

export function CreateFolderModal(): JSX.Element | null {
  const { isCreatingFolder, setCreatingFolder, showToast } = useUIStore()
  const { currentFolderId, addFile } = useFileStore()
  const { activeAccountId } = useAccountStore()
  const [name, setName] = useState('New Folder')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreatingFolder && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isCreatingFolder])

  if (!isCreatingFolder) return null

  const handleCreate = async (): Promise<void> => {
    if (!activeAccountId || !name.trim()) return

    try {
      const parentId = currentFolderId || 'root'
      const result = await window.api.storage.createFolder(activeAccountId, parentId, name.trim())
      if (result.success) {
        addFile(result.data)
        showToast(`Created folder: ${name.trim()}`, 'success')
      } else {
        showToast(result.error || 'Failed to create folder', 'error')
      }
    } catch {
      showToast('Failed to create folder', 'error')
    }

    setCreatingFolder(false)
    setName('New Folder')
  }

  return (
    <div className="modal-overlay" onClick={() => setCreatingFolder(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Create New Folder</h3>
        <input
          ref={inputRef}
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
            if (e.key === 'Escape') setCreatingFolder(false)
          }}
          placeholder="Folder name"
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setCreatingFolder(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
