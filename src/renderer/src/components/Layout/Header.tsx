import { useFileStore } from '../../stores/fileStore'
import { useUIStore } from '../../stores/uiStore'
import { useAccountStore } from '../../stores/accountStore'
import { useTransferStore } from '../../stores/transferStore'
import { Search, Grid3X3, List, Upload, FolderPlus, ChevronRight } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

export function Header(): JSX.Element {
  const { breadcrumb, navigateTo, currentFolderId, setSearchQuery, driveViewMode } = useFileStore()
  const { viewMode, setViewMode, showToast, setCreatingFolder } = useUIStore()
  const { activeAccountId } = useAccountStore()
  const { addTransfer, updateProgress, completeTransfer, failTransfer } = useTransferStore()
  const searchRef = useRef<HTMLInputElement>(null)
  const [localSearch, setLocalSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleSearch = useCallback(
    (value: string) => {
      setLocalSearch(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value)
      }, 350)
    },
    [setSearchQuery]
  )

  const handleUpload = async (): Promise<void> => {
    if (!activeAccountId) {
      showToast('Please connect an account first', 'error')
      return
    }

    try {
      const result = await window.api.app.selectFiles()
      if (result.success && result.data.length > 0) {
        const folderId = currentFolderId || 'root'

        // Create transfer items for each file
        const transferIds: string[] = []
        for (const filePath of result.data) {
          const fileName = filePath.split(/[/\\]/).pop() || 'Unknown'
          const transferId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          transferIds.push(transferId)
          addTransfer({
            id: transferId,
            fileName,
            fileSize: 0,
            type: 'upload',
            status: 'active',
            progress: 0
          })
        }

        // Listen for progress events
        const progressHandler = (data: { filePath: string; progress: number }): void => {
          const fileName = data.filePath.split(/[/\\]/).pop() || ''
          const idx = result.data.findIndex((p) => p.endsWith(fileName))
          if (idx >= 0 && transferIds[idx]) {
            updateProgress(transferIds[idx], data.progress)
          }
        }
        window.api.on('transfer:progress', progressHandler)

        const uploadResult = await window.api.storage.uploadFile(
          activeAccountId,
          folderId,
          result.data
        )

        window.api.off('transfer:progress', progressHandler)

        if (uploadResult.success) {
          for (const file of uploadResult.data) {
            useFileStore.getState().addFile(file)
          }
          // Mark all transfers as completed
          transferIds.forEach((id) => completeTransfer(id))
          showToast(`Uploaded ${uploadResult.data.length} file(s) successfully!`, 'success')
        } else {
          transferIds.forEach((id) => failTransfer(id, uploadResult.error || 'Upload failed'))
          showToast(uploadResult.error || 'Upload failed', 'error')
        }
      }
    } catch (err) {
      showToast('Upload failed', 'error')
    }
  }


  return (
    <header className="header">
      {/* Breadcrumb */}
      <nav className="breadcrumb">
        {breadcrumb.map((item, index) => (
          <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {index > 0 && <ChevronRight size={12} className="breadcrumb-sep" />}
            <span
              className={`breadcrumb-item ${index === breadcrumb.length - 1 ? 'active' : ''}`}
              onClick={() => navigateTo(index)}
            >
              {item.name}
            </span>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="search-container">
        <Search className="search-icon" />
        <input
          ref={searchRef}
          className="search-input"
          type="text"
          placeholder="Search files..."
          value={localSearch}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="header-actions">
        <button
          className={`icon-btn ${viewMode === 'grid' ? 'active' : ''}`}
          onClick={() => setViewMode('grid')}
          title="Grid view"
        >
          <Grid3X3 size={16} />
        </button>
        <button
          className={`icon-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
          title="List view"
        >
          <List size={16} />
        </button>
        <div className="header-actions-right">
          {driveViewMode === 'drive' && (
            <>
              <button className="btn-secondary" onClick={() => setCreatingFolder(true)}>
                <FolderPlus size={16} />
                New Folder
              </button>
              <button className="btn-primary" onClick={handleUpload}>
                <Upload size={16} />
                Upload
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
