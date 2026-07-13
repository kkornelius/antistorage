import { useUIStore } from '../../stores/uiStore'
import { Upload } from 'lucide-react'

export function DropZoneOverlay(): JSX.Element | null {
  const { isDraggingOver } = useUIStore()

  if (!isDraggingOver) return null

  return (
    <div className="dropzone-overlay">
      <div className="dropzone-content">
        <Upload size={48} />
        <h2>Drop files to upload</h2>
        <p>Files will be uploaded to the current folder</p>
      </div>
    </div>
  )
}
