import { Storage } from 'megajs'
import { tokenStore } from './token-store'
import type { CloudFile } from '../../shared/types'
import fs from 'fs'
import path from 'path'

class MegaService {
  private storages = new Map<string, Storage>()
  private pendingStorages = new Map<string, Promise<Storage>>()
  // Track original parent folder before moving to trash, so restore goes back to the right place
  private originalParents = new Map<string, string>()

  private getStorage(accountId: string): Promise<Storage> {
    if (this.storages.has(accountId)) {
      return Promise.resolve(this.storages.get(accountId)!)
    }
    
    if (this.pendingStorages.has(accountId)) {
      return this.pendingStorages.get(accountId)!
    }

    const promise = new Promise<Storage>((resolve, reject) => {

      const tokens = tokenStore.getTokens(accountId)
      if (!tokens || !tokens.password) {
        return reject(new Error(`No Mega credentials found for account ${accountId}`))
      }

      const accountRecord = tokenStore.getAccounts().find((a) => a.id === accountId)
      if (!accountRecord) {
        return reject(new Error('Account not found'))
      }

      const email = accountRecord.email
      const password = tokens.password

      const storage = new Storage({
        email,
        password,
        keepalive: true,
        userAgent: 'AntiStorage/1.0'
      })
      storage.ready
        .then(() => {
          this.storages.set(accountId, storage)
          this.pendingStorages.delete(accountId)
          resolve(storage)
        })
        .catch((err) => {
          this.pendingStorages.delete(accountId)
          // Provide user-friendly error for EBLOCKED
          const errMsg = String(err?.message || err || '')
          if (errMsg.includes('EBLOCKED') || errMsg.includes('-16')) {
            reject(new Error('Account temporarily blocked by MEGA. Please wait a few minutes and try again, or check your account status at mega.nz'))
          } else {
            reject(err)
          }
        })
    })
    
    this.pendingStorages.set(accountId, promise)
    return promise
  }

  invalidateStorage(accountId: string): void {
    this.storages.delete(accountId)
    this.pendingStorages.delete(accountId)
  }

  private mapFile(file: any, accountId: string): CloudFile {
    return {
      id: file.handle || file.nodeId || file.h || '',
      name: file.name || 'Untitled',
      mimeType: file.directory ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
      size: file.size || 0,
      createdTime: new Date((file.timestamp || 0) * 1000).toISOString(),
      modifiedTime: new Date((file.timestamp || 0) * 1000).toISOString(),
      parentId: file.parent ? (file.parent.handle || file.parent.nodeId || file.parent.h) : null,
      accountId,
      provider: 'mega',
      isFolder: file.directory,
      shared: false,
      starred: false,
      trashed: false
    }
  }

  private findNodeByHandle(storage: any, handle: string): any {
    if (!handle || handle === 'root') return storage.root
    
    let found = null
    const search = (node: any) => {
      if (found) return
      if (node.handle === handle || node.nodeId === handle || node.h === handle) {
        found = node
        return
      }
      if (node.children) {
        for (const child of node.children) {
          search(child)
        }
      }
    }
    
    search(storage.root)
    if (!found && storage.trash) {
      search(storage.trash)
      // Also search inside trash children directly
      if (!found && storage.trash.children) {
        for (const child of storage.trash.children) {
          search(child)
        }
      }
    }
    
    return found
  }

  async listFiles(accountId: string, folderId?: string, query?: string): Promise<CloudFile[]> {
    const storage = await this.getStorage(accountId)
    const allFiles: CloudFile[] = []

    const targetFolder = this.findNodeByHandle(storage, folderId || 'root')
    if (!targetFolder) throw new Error('Folder not found')

    if (targetFolder && targetFolder.children) {
      for (const child of targetFolder.children) {
        if (!query || child.name.toLowerCase().includes(query.toLowerCase())) {
          allFiles.push(this.mapFile(child, accountId))
        }
      }
    }

    return allFiles
  }

  async uploadFiles(
    accountId: string,
    folderId: string,
    filePaths: string[]
  ): Promise<CloudFile[]> {
    const storage = await this.getStorage(accountId)
    const uploadedFiles: CloudFile[] = []

    const targetFolder = this.findNodeByHandle(storage, folderId || 'root')
    if (!targetFolder) throw new Error('Folder not found')

    for (const filePath of filePaths) {
      const fileName = path.basename(filePath)
      const size = fs.statSync(filePath).size
      const stream = fs.createReadStream(filePath)

      const file = await targetFolder.upload({
        name: fileName,
        size
      }, stream).complete

      uploadedFiles.push(this.mapFile(file, accountId))
    }

    return uploadedFiles
  }

  async downloadFile(
    accountId: string,
    fileId: string,
    destDir: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const storage = await this.getStorage(accountId)
    const file = this.findNodeByHandle(storage, fileId)
    if (!file) {
      throw new Error('File not found')
    }

    const destPath = path.join(destDir, file.name)
    const writeStream = fs.createWriteStream(destPath)
    const stream = file.download()

    let downloaded = 0
    stream.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      if (file.size > 0 && onProgress) {
        onProgress(Math.round((downloaded / file.size) * 100))
      }
    })

    return new Promise((resolve, reject) => {
      stream.pipe(writeStream)
      stream.on('end', () => {
        onProgress?.(100)
        resolve(destPath)
      })
      stream.on('error', reject)
    })
  }

  async deleteFile(accountId: string, fileId: string, parentFolderId?: string): Promise<void> {
    return this.deleteFiles(accountId, [fileId], parentFolderId)
  }

  async deleteFiles(accountId: string, fileIds: string[], parentFolderId?: string): Promise<void> {
    if (!fileIds || fileIds.length === 0) return
    const storage = await this.getStorage(accountId)

    await Promise.all(
      fileIds.map(async (fileId) => {
        const file = this.findNodeByHandle(storage, fileId)
        if (!file) return

        const parentId = parentFolderId || (() => {
          if (!file.parent) return null
          if (typeof file.parent === 'string') return file.parent
          return file.parent.handle || file.parent.nodeId || file.parent.h || null
        })()

        if (parentId) {
          this.originalParents.set(fileId, parentId)
        }

        // Move to MEGA's rubbish bin (trash)
        await file.moveTo(storage.trash)
      })
    )
  }

  async createFolder(accountId: string, parentId: string, name: string): Promise<CloudFile> {
    const storage = await this.getStorage(accountId)
    const targetFolder = this.findNodeByHandle(storage, parentId || 'root')
    if (!targetFolder) throw new Error('Parent folder not found')

    const newFolder = await targetFolder.mkdir(name)
    return this.mapFile(newFolder, accountId)
  }

  async renameFile(accountId: string, fileId: string, newName: string): Promise<CloudFile> {
    const storage = await this.getStorage(accountId)
    const file = this.findNodeByHandle(storage, fileId)
    if (!file) {
      throw new Error('File not found')
    }
    await file.rename(newName)
    return this.mapFile(file, accountId)
  }
  async search(accountId: string, query: string): Promise<CloudFile[]> {
    return this.listFiles(accountId, 'root', query)
  }

  async listTrash(accountId: string): Promise<CloudFile[]> {
    const storage = await this.getStorage(accountId)
    const trashFiles: CloudFile[] = []

    if (storage.trash && storage.trash.children) {
      for (const child of storage.trash.children) {
        const mapped = this.mapFile(child, accountId)
        mapped.trashed = true
        trashFiles.push(mapped)
      }
    }

    return trashFiles
  }

  async listStarred(accountId: string): Promise<CloudFile[]> {
    return []
  }

  async restoreFile(accountId: string, fileId: string): Promise<void> {
    const storage = await this.getStorage(accountId)
    const file = this.findNodeByHandle(storage, fileId)
    if (!file) {
      throw new Error('File not found in trash')
    }

    const originalParentHandle = this.originalParents.get(fileId)
    console.log('[Mega] restoreFile:', fileId, 'originalParent:', originalParentHandle, 'allParents:', Object.fromEntries(this.originalParents))

    // Try to restore to original parent folder
    if (originalParentHandle) {
      const originalParent = this.findNodeByHandle(storage, originalParentHandle)
      console.log('[Mega] Found original parent node:', !!originalParent)
      if (originalParent) {
        await file.moveTo(originalParent)
        this.originalParents.delete(fileId)
        return
      }
    }

    // Fallback to root if original parent not found
    console.log('[Mega] Falling back to root')
    await file.moveTo(storage.root)
    this.originalParents.delete(fileId)
  }

  async permanentlyDelete(accountId: string, fileId: string): Promise<void> {
    const storage = await this.getStorage(accountId)
    const file = this.findNodeByHandle(storage, fileId)
    if (!file) {
      throw new Error('File not found')
    }
    // Permanent delete (true = skip trash)
    await file.delete(true)
  }

  async toggleStar(accountId: string, fileId: string, starred: boolean): Promise<void> {
    throw new Error('Not implemented for Mega')
  }

  async getQuota(accountId: string): Promise<any> {
    const storage = await this.getStorage(accountId)
    const info = await storage.getAccountInfo()
    return {
      used: info.spaceUsed || 0,
      total: info.spaceTotal || 0
    }
  }

  async moveFile(accountId: string, fileId: string, newParentId: string): Promise<CloudFile> {
    const storage = await this.getStorage(accountId)
    const file = this.findNodeByHandle(storage, fileId)
    const parent = this.findNodeByHandle(storage, newParentId)
    if (!file) throw new Error('File not found')
    if (!parent) throw new Error('Target folder not found')
    await file.moveTo(parent)
    return this.mapFile(file, accountId)
  }
}

export const megaService = new MegaService()
