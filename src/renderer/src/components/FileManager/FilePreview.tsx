import { useUIStore } from '../../stores/uiStore'
import { useFileStore } from '../../stores/fileStore'
import { useAccountStore } from '../../stores/accountStore'
import { useEffect, useCallback, useState } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Maximize2,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { formatBytes, formatDate, getFileIcon } from '../../lib/utils'
import { useTransferStore } from '../../stores/transferStore'

// Helpers to classify files
function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/')
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/')
}

function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf'
}

function isGoogleWorkspace(mime: string): boolean {
  return mime.startsWith('application/vnd.google-apps.')
}

function getGoogleWorkspaceLabel(mime: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Docs',
    'application/vnd.google-apps.spreadsheet': 'Google Sheets',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.drawing': 'Google Drawing',
    'application/vnd.google-apps.form': 'Google Forms',
    'application/vnd.google-apps.site': 'Google Sites'
  }
  return map[mime] || 'Google File'
}

export function FilePreview(): JSX.Element | null {
  const { previewFileId, setPreviewFile, showToast } = useUIStore()
  const { files } = useFileStore()
  const { activeAccountId } = useAccountStore()
  const { addTransfer, completeTransfer, failTransfer, updateProgress } = useTransferStore()
  const [zoom, setZoom] = useState(1)
  const [imageLoaded, setImageLoaded] = useState(false)

  const file = files.find((f) => f.id === previewFileId)
  const previewableFiles = files.filter((f) => !f.isFolder)
  const currentIndex = previewableFiles.findIndex((f) => f.id === previewFileId)

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setPreviewFile(previewableFiles[currentIndex - 1].id)
      setZoom(1)
      setImageLoaded(false)
    }
  }, [currentIndex, previewableFiles, setPreviewFile])

  const goToNext = useCallback(() => {
    if (currentIndex < previewableFiles.length - 1) {
      setPreviewFile(previewableFiles[currentIndex + 1].id)
      setZoom(1)
      setImageLoaded(false)
    }
  }, [currentIndex, previewableFiles, setPreviewFile])

  const handleClose = useCallback(() => {
    setPreviewFile(null)
    setZoom(1)
    setImageLoaded(false)
  }, [setPreviewFile])

  // Keyboard navigation
  useEffect(() => {
    if (!previewFileId) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
      if (e.key === 'ArrowLeft') goToPrev()
      if (e.key === 'ArrowRight') goToNext()
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 5))
      if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.25))
      if (e.key === '0') setZoom(1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewFileId, handleClose, goToPrev, goToNext])

  if (!previewFileId || !file) return null

  const handleDownload = async (): Promise<void> => {
    if (!activeAccountId) return

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

  const handleOpenExternal = (): void => {
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank')
    }
  }

  // Build the preview content
  const renderPreviewContent = (): JSX.Element => {
    const mime = file.mimeType

    // Image preview
    if (isImageMime(mime)) {
      // Use thumbnailLink with larger size, or webContentLink
      const imgSrc = file.thumbnailLink
        ? file.thumbnailLink.replace(/=s\d+/, '=s1600')
        : file.webViewLink || ''

      return (
        <div className="preview-image-container">
          {!imageLoaded && (
            <div className="preview-loading">
              <div className="spinner" />
              <span>Loading preview...</span>
            </div>
          )}
          <img
            src={imgSrc}
            alt={file.name}
            className="preview-image"
            style={{
              transform: `scale(${zoom})`,
              opacity: imageLoaded ? 1 : 0
            }}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
            draggable={false}
          />
        </div>
      )
    }

    // Video preview
    if (isVideoMime(mime)) {
      return (
        <div className="preview-media-container">
          <div className="preview-unsupported">
            {getFileIcon(mime, 48)}
            <h3>{file.name}</h3>
            <p>Video preview requires download</p>
            <button className="btn-primary preview-action-btn" onClick={handleDownload}>
              <Download size={14} />
              Download to watch
            </button>
          </div>
        </div>
      )
    }

    // Audio preview
    if (isAudioMime(mime)) {
      return (
        <div className="preview-media-container">
          <div className="preview-unsupported">
            {getFileIcon(mime, 48)}
            <h3>{file.name}</h3>
            <p>Audio preview requires download</p>
            <button className="btn-primary preview-action-btn" onClick={handleDownload}>
              <Download size={14} />
              Download to listen
            </button>
          </div>
        </div>
      )
    }

    // PDF - use Google Docs viewer
    if (isPdfMime(mime) && file.webViewLink) {
      return (
        <div className="preview-embed-container">
          <iframe
            src={file.webViewLink.replace('/view', '/preview')}
            className="preview-iframe"
            title={file.name}
            allow="autoplay"
          />
        </div>
      )
    }

    // Google Workspace files - embed via webViewLink
    if (isGoogleWorkspace(mime) && file.webViewLink) {
      return (
        <div className="preview-embed-container">
          <iframe
            src={file.webViewLink.replace('/edit', '/preview')}
            className="preview-iframe"
            title={file.name}
            allow="autoplay"
          />
        </div>
      )
    }

    // Unsupported files
    return (
      <div className="preview-media-container">
        <div className="preview-unsupported">
          {getFileIcon(mime, 48)}
          <h3>{file.name}</h3>
          <p>{isGoogleWorkspace(mime) ? getGoogleWorkspaceLabel(mime) : 'Preview not available for this file type'}</p>
          <div className="preview-unsupported-actions">
            {file.webViewLink && (
              <button className="btn-secondary preview-action-btn" onClick={handleOpenExternal}>
                <ExternalLink size={14} />
                Open in browser
              </button>
            )}
            {!isGoogleWorkspace(mime) && (
              <button className="btn-primary preview-action-btn" onClick={handleDownload}>
                <Download size={14} />
                Download
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const fileTypeLabel = isGoogleWorkspace(file.mimeType)
    ? getGoogleWorkspaceLabel(file.mimeType)
    : file.mimeType.split('/').pop()?.split('.').pop()?.toUpperCase() || 'File'

  return (
    <div className="preview-overlay" onClick={handleClose}>
      <div className="preview-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="preview-header">
          <div className="preview-header-left">
            <div className="preview-file-icon">{getFileIcon(file.mimeType, 18)}</div>
            <div className="preview-file-info">
              <span className="preview-file-name" title={file.name}>
                {file.name}
              </span>
              <span className="preview-file-meta">
                {fileTypeLabel} · {file.isFolder ? '' : formatBytes(file.size)} · {formatDate(file.modifiedTime)}
              </span>
            </div>
          </div>
          <div className="preview-header-right">
            {isImageMime(file.mimeType) && (
              <div className="preview-zoom-controls">
                <button
                  className="icon-btn"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
                  title="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="preview-zoom-level">{Math.round(zoom * 100)}%</span>
                <button
                  className="icon-btn"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
                  title="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <button className="icon-btn" onClick={() => setZoom(1)} title="Reset zoom">
                  <Maximize2 size={14} />
                </button>
              </div>
            )}
            {!isGoogleWorkspace(file.mimeType) && (
              <button className="icon-btn" onClick={handleDownload} title="Download">
                <Download size={14} />
              </button>
            )}
            {file.webViewLink && (
              <button className="icon-btn" onClick={handleOpenExternal} title="Open in browser">
                <ExternalLink size={14} />
              </button>
            )}
            <button className="icon-btn preview-close-btn" onClick={handleClose} title="Close (Esc)">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="preview-body">{renderPreviewContent()}</div>

        {/* Navigation arrows */}
        {currentIndex > 0 && (
          <button
            className="preview-nav-btn preview-nav-prev"
            onClick={goToPrev}
            title="Previous file"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {currentIndex < previewableFiles.length - 1 && (
          <button
            className="preview-nav-btn preview-nav-next"
            onClick={goToNext}
            title="Next file"
          >
            <ChevronRight size={24} />
          </button>
        )}

        {/* File counter */}
        <div className="preview-counter">
          {currentIndex + 1} / {previewableFiles.length}
        </div>
      </div>
    </div>
  )
}
