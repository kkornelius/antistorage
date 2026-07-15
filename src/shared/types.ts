// ===== Storage Provider Types =====

export type StorageProvider = 'google-drive' | 'mega' | 'terabox'

export interface StorageAccount {
  id: string
  email: string
  displayName: string
  avatarUrl: string
  provider: StorageProvider
  quota: StorageQuota
  connectedAt: number
}

export interface StorageQuota {
  used: number      // bytes
  total: number     // bytes
  usedInDrive?: number
  usedInTrash?: number
}

// ===== App Settings =====

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  defaultDownloadFolder: string
  showNotifications: boolean
}

// ===== File Types =====

export interface CloudFile {
  id: string
  name: string
  mimeType: string
  size: number
  createdTime: string
  modifiedTime: string
  parentId: string | null
  accountId: string
  provider: StorageProvider
  iconLink?: string
  thumbnailLink?: string
  webViewLink?: string
  isFolder: boolean
  shared?: boolean
  starred?: boolean
  trashed?: boolean
}

// ===== IPC Channel Types =====

export interface IpcChannels {
  // Auth
  'auth:add-account': () => Promise<StorageAccount>
  'auth:add-mega-account': (email: string, password: string) => Promise<StorageAccount>
  'auth:remove-account': (accountId: string) => Promise<void>
  'auth:get-accounts': () => Promise<StorageAccount[]>

  // Storage operations
  'storage:list-files': (accountId: string, folderId?: string, query?: string) => Promise<CloudFile[]>
  'storage:upload-file': (accountId: string, folderId: string, filePath: string) => Promise<CloudFile>
  'storage:download-file': (accountId: string, fileId: string, destPath: string) => Promise<string>
  'storage:delete-file': (accountId: string, fileId: string, parentFolderId?: string) => Promise<void>
  'storage:delete-files': (accountId: string, fileIds: string[], parentFolderId?: string) => Promise<void>
  'storage:create-folder': (accountId: string, parentId: string, name: string) => Promise<CloudFile>
  'storage:move-file': (accountId: string, fileId: string, newParentId: string) => Promise<CloudFile>
  'storage:rename-file': (accountId: string, fileId: string, newName: string) => Promise<CloudFile>
  'storage:get-quota': (accountId: string) => Promise<StorageQuota>
  'storage:search': (accountId: string, query: string) => Promise<CloudFile[]>

  // App
  'app:select-files': () => Promise<string[]>
  'app:select-folder': () => Promise<string | null>
}

// ===== Transfer Types =====

export interface TransferItem {
  id: string
  fileName: string
  fileSize: number
  type: 'upload' | 'download'
  accountId: string
  status: 'queued' | 'active' | 'completed' | 'error' | 'paused'
  progress: number  // 0-100
  speed?: number    // bytes/sec
  error?: string
  startedAt?: number
  completedAt?: number
}

// ===== IPC API exposed to renderer =====

export interface AntiStorageAPI {
  auth: {
    addAccount: () => Promise<StorageAccount>
    addMegaAccount: (email: string, password: string) => Promise<StorageAccount>
    addTeraboxAccount: () => Promise<StorageAccount>
    cancelAddAccount: () => Promise<void>
    removeAccount: (accountId: string) => Promise<void>
    getAccounts: () => Promise<StorageAccount[]>
  }
  storage: {
    listFiles: (accountId: string, folderId?: string, query?: string) => Promise<CloudFile[]>
    uploadFile: (accountId: string, folderId: string, filePaths: string[]) => Promise<CloudFile[]>
    downloadFile: (accountId: string, fileId: string, fileName: string) => Promise<string>
    deleteFile: (accountId: string, fileId: string, parentFolderId?: string) => Promise<void>
    createFolder: (accountId: string, parentId: string, name: string) => Promise<CloudFile>
    moveFile: (accountId: string, fileId: string, newParentId: string) => Promise<CloudFile>
    renameFile: (accountId: string, fileId: string, newName: string) => Promise<CloudFile>
    getQuota: (accountId: string) => Promise<StorageQuota>
    search: (accountId: string, query: string) => Promise<CloudFile[]>
    listTrash: (accountId: string) => Promise<CloudFile[]>
    listStarred: (accountId: string) => Promise<CloudFile[]>
    restoreFile: (accountId: string, fileId: string) => Promise<void>
    permanentlyDelete: (accountId: string, fileId: string) => Promise<void>
    toggleStar: (accountId: string, fileId: string, starred: boolean) => Promise<void>
  }
  app: {
    selectFiles: () => Promise<string[]>
    selectFolder: () => Promise<string | null>
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (updates: Partial<AppSettings>) => Promise<AppSettings>
    getDownloadFolder: () => Promise<string | null>
  }
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
}
