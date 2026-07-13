import './index.css'
import { useEffect, useCallback, useState } from 'react'
import { Sidebar } from './components/Layout/Sidebar'
import { Header } from './components/Layout/Header'
import { StatusBar } from './components/Layout/StatusBar'
import { FileList } from './components/FileManager/FileList'
import { ContextMenu } from './components/FileManager/ContextMenu'
import { ToastContainer } from './components/Common/Toast'
import { DropZoneOverlay } from './components/Common/DropZone'
import { CreateFolderModal } from './components/Common/CreateFolderModal'
import { TransferPanel } from './components/Transfer/TransferPanel'
import { FilePreview } from './components/FileManager/FilePreview'
import { SettingsPage } from './components/Settings/SettingsPage'
import { ConfirmModal } from './components/Common/ConfirmModal'
import { useAccountStore } from './stores/accountStore'
import { useFileStore } from './stores/fileStore'
import { useUIStore } from './stores/uiStore'
import { useSettingsStore } from './stores/settingsStore'

function App(): JSX.Element {
  const { activeAccountId, setAccounts } = useAccountStore()
  const { theme } = useSettingsStore()
  const {
    setFiles,
    currentFolderId,
    searchQuery,
    setLoading,
    driveViewMode
  } = useFileStore()
  const { setDraggingOver, showToast, setContextMenu } = useUIStore()

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'trash' | 'permanent'
    fileIds: string[]
    fileNames: string[]
  } | null>(null)

  // Apply theme to document
  useEffect(() => {
    if (theme === 'light' || (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)) {
      document.documentElement.classList.add('theme-light')
    } else {
      document.documentElement.classList.remove('theme-light')
    }
  }, [theme])

  // Load accounts on mount
  useEffect(() => {
    const loadAccounts = async (): Promise<void> => {
      try {
        const result = await window.api.auth.getAccounts()
        if (result.success) {
          setAccounts(result.data)
        }
      } catch (err) {
        console.error('Failed to load accounts:', err)
      }
    }
    loadAccounts()
  }, [setAccounts])

  // Load settings on mount
  useEffect(() => {
    useSettingsStore.getState().loadSettings()
  }, [])

  // Load files when account or folder changes
  useEffect(() => {
    if (!activeAccountId) {
      setFiles([])
      return
    }

    const loadFiles = async (): Promise<void> => {
      setLoading(true)
      try {
        let result
        if (searchQuery) {
          result = await window.api.storage.search(activeAccountId, searchQuery)
        } else if (driveViewMode === 'trash') {
          result = await window.api.storage.listTrash(activeAccountId)
        } else if (driveViewMode === 'starred') {
          result = await window.api.storage.listStarred(activeAccountId)
        } else {
          result = await window.api.storage.listFiles(
            activeAccountId,
            currentFolderId || undefined
          )
        }

        if (result.success) {
          setFiles(result.data)
        } else {
          showToast(result.error || 'Failed to load files', 'error')
          setFiles([])
        }
      } catch (err) {
        console.error('Failed to load files:', err)
        showToast('Failed to load files', 'error')
        setFiles([])
      } finally {
        setLoading(false)
      }
    }

    loadFiles()
  }, [activeAccountId, currentFolderId, searchQuery, setFiles, setLoading, showToast, driveViewMode])

  // Drag & drop handlers
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.types.includes('Files')) {
        setDraggingOver(true)
      }
    },
    [setDraggingOver]
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Only hide when leaving the window
      if (e.currentTarget === e.target || !e.relatedTarget) {
        setDraggingOver(false)
      }
    },
    [setDraggingOver]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDraggingOver(false)

      if (!activeAccountId) {
        showToast('Please connect an account first', 'error')
        return
      }

      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length === 0) return

      const filePaths = droppedFiles.map((f) => f.path).filter(Boolean)
      if (filePaths.length === 0) return

      showToast(`Uploading ${filePaths.length} file(s)...`, 'info')

      try {
        const folderId = currentFolderId || 'root'
        const result = await window.api.storage.uploadFile(activeAccountId, folderId, filePaths)

        if (result.success) {
          for (const file of result.data) {
            useFileStore.getState().addFile(file)
          }
          showToast(`Uploaded ${result.data.length} file(s) successfully!`, 'success')
        } else {
          showToast(result.error || 'Upload failed', 'error')
        }
      } catch {
        showToast('Upload failed', 'error')
      }
    },
    [activeAccountId, currentFolderId, setDraggingOver, showToast]
  )

  // Global click to close context menu
  const handleGlobalClick = useCallback(() => {
    setContextMenu(null)
  }, [setContextMenu])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Delete key - delete selected files
      if (e.key === 'Delete') {
        const { selectedFiles, files, driveViewMode: viewMode } = useFileStore.getState()
        const { activeAccountId: accId } = useAccountStore.getState()
        if (selectedFiles.size > 0 && accId) {
          const fileIds = Array.from(selectedFiles)
          const fileNames = fileIds.map((id) => files.find((f) => f.id === id)?.name || 'Unknown')
          setDeleteConfirm({
            type: viewMode === 'trash' ? 'permanent' : 'trash',
            fileIds,
            fileNames
          })
        }
      }

      // Ctrl+A - select all
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault()
        useFileStore.getState().selectAll()
      }

      // Escape - clear selection
      if (e.key === 'Escape') {
        useFileStore.getState().clearSelection()
        setContextMenu(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setContextMenu, showToast])

  return (
    <div
      className="app-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleGlobalClick}
    >
      <div className="app-body">
        <Sidebar />
        <main className="main-content">
          <Header />
          <div className="file-area">
            <FileList />
          </div>
        </main>
      </div>
      <StatusBar />
      <TransferPanel />

      {/* Overlays */}
      <ContextMenu />
      <ToastContainer />
      <DropZoneOverlay />
      <CreateFolderModal />
      <FilePreview />
      <SettingsPage />
      {deleteConfirm && (
        <ConfirmModal
          title={deleteConfirm.type === 'permanent' ? 'Delete permanently?' : 'Move to trash?'}
          message={
            deleteConfirm.type === 'permanent'
              ? `This will permanently delete ${deleteConfirm.fileNames.length > 1 ? `${deleteConfirm.fileNames.length} items` : `"${deleteConfirm.fileNames[0]}"`}. This action cannot be undone.`
              : `Move ${deleteConfirm.fileNames.length > 1 ? `${deleteConfirm.fileNames.length} items` : `"${deleteConfirm.fileNames[0]}"`} to trash?`
          }
          confirmLabel={deleteConfirm.type === 'permanent' ? 'Delete permanently' : 'Move to trash'}
          variant={deleteConfirm.type === 'permanent' ? 'danger' : 'default'}
          onConfirm={async () => {
            const { type, fileIds } = deleteConfirm
            setDeleteConfirm(null)
            const { removeFile, currentFolderId } = useFileStore.getState()
            const accId = useAccountStore.getState().activeAccountId
            if (!accId) return

            let successCount = 0
            for (const fileId of fileIds) {
              const file = useFileStore.getState().files.find((f) => f.id === fileId)
              try {
                const parentFolderId = file?.parentId || currentFolderId || undefined
                const result = type === 'permanent'
                  ? await window.api.storage.permanentlyDelete(accId, fileId)
                  : await window.api.storage.deleteFile(accId, fileId, parentFolderId)
                if (result.success) {
                  removeFile(fileId)
                  successCount++
                }
              } catch {
                showToast(`Failed to delete: ${file?.name}`, 'error')
              }
            }
            if (successCount > 0) {
              useFileStore.getState().clearSelection()
              showToast(
                type === 'permanent'
                  ? `Permanently deleted ${successCount} item(s)`
                  : `Moved ${successCount} item(s) to trash`,
                'success'
              )
            }
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

export default App
