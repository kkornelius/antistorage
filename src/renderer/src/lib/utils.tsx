import {
  Folder,
  Image,
  Video,
  Music,
  FileText,
  Table,
  Presentation,
  FileArchive,
  Code,
  File,
  FileSpreadsheet
} from 'lucide-react'
import type { JSX } from 'react'

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const mins = Math.floor(diff / (1000 * 60))
      return mins <= 1 ? 'Just now' : `${mins} min ago`
    }
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

export function getFileIcon(mimeType: string, size = 20): JSX.Element {
  if (mimeType === 'application/vnd.google-apps.folder') {
    return <Folder size={size} className="file-icon-folder" />
  }
  if (mimeType.startsWith('image/')) {
    return <Image size={size} className="file-icon-image" />
  }
  if (mimeType.startsWith('video/')) {
    return <Video size={size} className="file-icon-video" />
  }
  if (mimeType.startsWith('audio/')) {
    return <Music size={size} className="file-icon-audio" />
  }
  if (
    mimeType.includes('document') ||
    mimeType.includes('text') ||
    mimeType === 'application/vnd.google-apps.document'
  ) {
    return <FileText size={size} className="file-icon-document" />
  }
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'application/vnd.google-apps.spreadsheet'
  ) {
    return <FileSpreadsheet size={size} className="file-icon-spreadsheet" />
  }
  if (
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint') ||
    mimeType === 'application/vnd.google-apps.presentation'
  ) {
    return <Presentation size={size} className="file-icon-presentation" />
  }
  if (mimeType === 'application/pdf') {
    return <FileText size={size} className="file-icon-pdf" />
  }
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('rar') || mimeType.includes('tar')) {
    return <FileArchive size={size} className="file-icon-archive" />
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('html') ||
    mimeType.includes('css') ||
    mimeType.includes('python') ||
    mimeType === 'application/vnd.google-apps.script'
  ) {
    return <Code size={size} className="file-icon-code" />
  }
  return <File size={size} className="file-icon-default" />
}

export function getQuotaPercent(used: number, total: number): number {
  if (total === 0) return 0
  if (used === 0) return 0
  const pct = Math.round((used / total) * 100)
  // Ensure at least 1% so the bar is visible when there's any usage
  return Math.min(100, Math.max(1, pct))
}
