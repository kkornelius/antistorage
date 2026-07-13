import { google, drive_v3 } from 'googleapis'
import { authService } from './auth.service'
import { tokenStore } from './token-store'
import { BrowserWindow } from 'electron'
import type { CloudFile, StorageQuota } from '../../shared/types'

class GDriveService {
  private getDrive(accountId: string): drive_v3.Drive {
    const client = authService.getAuthClientForAccount(accountId)
    return google.drive({ version: 'v3', auth: client })
  }

  private mapFile(file: drive_v3.Schema$File, accountId: string): CloudFile {
    return {
      id: file.id || '',
      name: file.name || 'Untitled',
      mimeType: file.mimeType || 'application/octet-stream',
      size: parseInt(file.size || '0'),
      createdTime: file.createdTime || '',
      modifiedTime: file.modifiedTime || '',
      parentId: file.parents?.[0] || null,
      accountId,
      provider: 'google-drive',
      iconLink: file.iconLink || '',
      thumbnailLink: file.thumbnailLink || '',
      webViewLink: file.webViewLink || '',
      isFolder: file.mimeType === 'application/vnd.google-apps.folder',
      shared: file.shared || false,
      starred: file.starred || false,
      trashed: file.trashed || false
    }
  }

  async listFiles(accountId: string, folderId?: string, query?: string): Promise<CloudFile[]> {
    const drive = this.getDrive(accountId)
    const parentId = folderId || 'root'

    let q = `'${parentId}' in parents and trashed = false`
    if (query) {
      q = `${q} and name contains '${query.replace(/'/g, "\\'")}'`
    }

    const allFiles: CloudFile[] = []
    let pageToken: string | undefined

    do {
      const res = await drive.files.list({
        q,
        pageSize: 100,
        pageToken,
        fields:
          'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, iconLink, thumbnailLink, webViewLink, shared, starred, trashed)',
        orderBy: 'folder, name'
      })

      const files = res.data.files || []
      allFiles.push(...files.map((f) => this.mapFile(f, accountId)))
      pageToken = res.data.nextPageToken || undefined
    } while (pageToken)

    return allFiles
  }

  async uploadFile(
    accountId: string,
    folderId: string,
    filePath: string,
    onProgress?: (progress: number) => void
  ): Promise<CloudFile> {
    const drive = this.getDrive(accountId)
    const { createReadStream, statSync } = await import('fs')
    const { basename } = await import('path')

    const fileName = basename(filePath)
    const fileSize = statSync(filePath).size
    const stream = createReadStream(filePath)

    let uploaded = 0
    stream.on('data', (chunk: Buffer) => {
      uploaded += chunk.length
      const progress = Math.round((uploaded / fileSize) * 100)
      onProgress?.(progress)
    })

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId === 'root' ? 'root' : folderId]
      },
      media: {
        body: stream
      },
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents, iconLink, thumbnailLink, webViewLink'
    })

    onProgress?.(100)
    return this.mapFile(res.data, accountId)
  }

  async uploadFiles(
    accountId: string,
    folderId: string,
    filePaths: string[]
  ): Promise<CloudFile[]> {
    const results: CloudFile[] = []

    for (const filePath of filePaths) {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      const file = await this.uploadFile(accountId, folderId, filePath, (progress) => {
        mainWindow?.webContents.send('transfer:progress', {
          filePath,
          progress,
          type: 'upload'
        })
      })
      results.push(file)
    }

    return results
  }

  async downloadFile(
    accountId: string,
    fileId: string,
    destPath: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const drive = this.getDrive(accountId)
    const { createWriteStream } = await import('fs')
    const { join } = await import('path')

    // Get file metadata first
    const meta = await drive.files.get({
      fileId,
      fields: 'name, size, mimeType'
    })

    const fileName = meta.data.name || 'download'
    const fileSize = parseInt(meta.data.size || '0')
    const fullPath = join(destPath, fileName)

    // Check if it's a Google Workspace file (Docs, Sheets, etc.)
    const mimeType = meta.data.mimeType || ''
    if (mimeType.startsWith('application/vnd.google-apps.')) {
      // Export Google Workspace files
      const exportMimeTypes: Record<string, string> = {
        'application/vnd.google-apps.document': 'application/pdf',
        'application/vnd.google-apps.spreadsheet':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.google-apps.presentation':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.google-apps.drawing': 'image/png'
      }

      const exportMime = exportMimeTypes[mimeType] || 'application/pdf'

      const res = await drive.files.export(
        { fileId, mimeType: exportMime },
        { responseType: 'stream' }
      )

      return new Promise((resolve, reject) => {
        const writer = createWriteStream(fullPath)
        ;(res.data as NodeJS.ReadableStream)
          .pipe(writer)
          .on('finish', () => {
            onProgress?.(100)
            resolve(fullPath)
          })
          .on('error', reject)
      })
    }

    // Regular file download
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })

    return new Promise((resolve, reject) => {
      const writer = createWriteStream(fullPath)
      let downloaded = 0

      ;(res.data as NodeJS.ReadableStream)
        .on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (fileSize > 0) {
            onProgress?.(Math.round((downloaded / fileSize) * 100))
          }
        })
        .pipe(writer)
        .on('finish', () => {
          onProgress?.(100)
          resolve(fullPath)
        })
        .on('error', reject)
    })
  }

  async deleteFile(accountId: string, fileId: string, _parentFolderId?: string): Promise<void> {
    const drive = this.getDrive(accountId)
    await drive.files.update({
      fileId,
      requestBody: { trashed: true }
    })
  }

  async createFolder(accountId: string, parentId: string, name: string): Promise<CloudFile> {
    const drive = this.getDrive(accountId)
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId === 'root' ? 'root' : parentId]
      },
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents'
    })
    return this.mapFile(res.data, accountId)
  }

  async moveFile(accountId: string, fileId: string, newParentId: string): Promise<CloudFile> {
    const drive = this.getDrive(accountId)

    // Get current parents
    const file = await drive.files.get({ fileId, fields: 'parents' })
    const previousParents = file.data.parents?.join(',') || ''

    const res = await drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: previousParents,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents'
    })
    return this.mapFile(res.data, accountId)
  }

  async renameFile(accountId: string, fileId: string, newName: string): Promise<CloudFile> {
    const drive = this.getDrive(accountId)
    const res = await drive.files.update({
      fileId,
      requestBody: { name: newName },
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents'
    })
    return this.mapFile(res.data, accountId)
  }

  async getQuota(accountId: string): Promise<StorageQuota> {
    const drive = this.getDrive(accountId)
    const res = await drive.about.get({ fields: 'storageQuota' })
    const sq = res.data.storageQuota

    const quota: StorageQuota = {
      used: parseInt(sq?.usage || '0'),
      total: parseInt(sq?.limit || '16106127360'),
      usedInDrive: parseInt(sq?.usageInDrive || '0'),
      usedInTrash: parseInt(sq?.usageInDriveTrash || '0')
    }

    tokenStore.updateQuota(accountId, quota)
    return quota
  }

  async search(accountId: string, query: string): Promise<CloudFile[]> {
    const drive = this.getDrive(accountId)

    const res = await drive.files.list({
      q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize: 50,
      fields:
        'files(id, name, mimeType, size, createdTime, modifiedTime, parents, iconLink, thumbnailLink, webViewLink, shared, starred, trashed)',
      orderBy: 'modifiedTime desc'
    })

    return (res.data.files || []).map((f) => this.mapFile(f, accountId))
  }

  async listTrash(accountId: string): Promise<CloudFile[]> {
    const drive = this.getDrive(accountId)

    const res = await drive.files.list({
      q: 'trashed = true',
      pageSize: 100,
      fields:
        'files(id, name, mimeType, size, createdTime, modifiedTime, parents, iconLink, thumbnailLink, webViewLink, shared, starred, trashed)',
      orderBy: 'modifiedTime desc'
    })

    const allFiles = res.data.files || []
    const allFileIds = new Set(allFiles.map((f) => f.id))

    // Filter out files whose parent is also in the trash
    const rootTrashedFiles = allFiles.filter((f) => {
      if (!f.parents || f.parents.length === 0) return true
      return !f.parents.some((parentId) => allFileIds.has(parentId))
    })

    return rootTrashedFiles.map((f) => this.mapFile(f, accountId))
  }

  async listStarred(accountId: string): Promise<CloudFile[]> {
    const drive = this.getDrive(accountId)

    const res = await drive.files.list({
      q: 'starred = true and trashed = false',
      pageSize: 100,
      fields:
        'files(id, name, mimeType, size, createdTime, modifiedTime, parents, iconLink, thumbnailLink, webViewLink, shared, starred, trashed)',
      orderBy: 'modifiedTime desc'
    })

    return (res.data.files || []).map((f) => this.mapFile(f, accountId))
  }

  async restoreFile(accountId: string, fileId: string): Promise<void> {
    const drive = this.getDrive(accountId)
    await drive.files.update({
      fileId,
      requestBody: { trashed: false }
    })
  }

  async permanentlyDelete(accountId: string, fileId: string): Promise<void> {
    const drive = this.getDrive(accountId)
    await drive.files.delete({ fileId })
  }

  async toggleStar(accountId: string, fileId: string, starred: boolean): Promise<void> {
    const drive = this.getDrive(accountId)
    await drive.files.update({
      fileId,
      requestBody: { starred }
    })
  }
}

export const gdriveService = new GDriveService()
