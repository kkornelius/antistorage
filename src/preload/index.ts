import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AntiStorageAPI } from '../shared/types'

// AntiStorage API exposed to renderer
const api: AntiStorageAPI = {
  auth: {
    addAccount: () => ipcRenderer.invoke('auth:add-account'),
    addMegaAccount: (email: string, password: string) => ipcRenderer.invoke('auth:add-mega-account', email, password),
    cancelAddAccount: () => ipcRenderer.invoke('auth:cancel-add-account'),
    removeAccount: (accountId: string) => ipcRenderer.invoke('auth:remove-account', accountId),
    getAccounts: () => ipcRenderer.invoke('auth:get-accounts')
  },
  storage: {
    listFiles: (accountId: string, folderId?: string, query?: string) =>
      ipcRenderer.invoke('storage:list-files', accountId, folderId, query),
    uploadFile: (accountId: string, folderId: string, filePaths: string[]) =>
      ipcRenderer.invoke('storage:upload-file', accountId, folderId, filePaths),
    downloadFile: (accountId: string, fileId: string, fileName: string) =>
      ipcRenderer.invoke('storage:download-file', accountId, fileId, fileName),
    deleteFile: (accountId: string, fileId: string, parentFolderId?: string) =>
      ipcRenderer.invoke('storage:delete-file', accountId, fileId, parentFolderId),
    createFolder: (accountId: string, parentId: string, name: string) =>
      ipcRenderer.invoke('storage:create-folder', accountId, parentId, name),
    moveFile: (accountId: string, fileId: string, newParentId: string) =>
      ipcRenderer.invoke('storage:move-file', accountId, fileId, newParentId),
    renameFile: (accountId: string, fileId: string, newName: string) =>
      ipcRenderer.invoke('storage:rename-file', accountId, fileId, newName),
    getQuota: (accountId: string) => ipcRenderer.invoke('storage:get-quota', accountId),
    search: (accountId: string, query: string) =>
      ipcRenderer.invoke('storage:search', accountId, query),
    listTrash: (accountId: string) => ipcRenderer.invoke('storage:list-trash', accountId),
    listStarred: (accountId: string) => ipcRenderer.invoke('storage:list-starred', accountId),
    restoreFile: (accountId: string, fileId: string) =>
      ipcRenderer.invoke('storage:restore-file', accountId, fileId),
    permanentlyDelete: (accountId: string, fileId: string) =>
      ipcRenderer.invoke('storage:permanently-delete', accountId, fileId),
    toggleStar: (accountId: string, fileId: string, starred: boolean) =>
      ipcRenderer.invoke('storage:toggle-star', accountId, fileId, starred)
  },
  app: {
    selectFiles: () => ipcRenderer.invoke('app:select-files'),
    selectFolder: () => ipcRenderer.invoke('app:select-folder')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (updates: any) => ipcRenderer.invoke('settings:set', updates),
    getDownloadFolder: () => ipcRenderer.invoke('settings:get-download-folder')
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
