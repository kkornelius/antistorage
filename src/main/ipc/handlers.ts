import { ipcMain, dialog, BrowserWindow } from 'electron'
import { authService } from '../services/auth.service'
import { gdriveService } from '../services/gdrive.service'
import { megaService } from '../services/mega.service'
import { teraboxService } from '../services/terabox.service'
import { tokenStore } from '../services/token-store'
import { settingsService, AppSettings } from '../services/settings.service'

function getService(accountId: string) {
  const account = tokenStore.getAccounts().find((a) => a.id === accountId)
  if (!account) throw new Error('Account not found')
  if (account.provider === 'mega') return megaService
  if (account.provider === 'terabox') return teraboxService
  return gdriveService
}

export function registerIpcHandlers(): void {
  // ===== Auth Handlers =====
  ipcMain.handle('auth:add-account', async () => {
    try {
      const account = await authService.addAccount()
      return { success: true, data: account }
    } catch (err) {
      console.error('Add account error:', err)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:add-mega-account', async (_event, email, password) => {
    try {
      const account = await authService.addMegaAccount(email, password)
      return { success: true, data: account }
    } catch (err) {
      console.error('Add Mega account error:', err)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:add-terabox-account', async () => {
    try {
      const account = await authService.addTeraboxAccountViaWebview()
      return { success: true, data: account }
    } catch (err) {
      console.error('Add Terabox account error:', err)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:cancel-add-account', () => {
    try {
      authService['cleanupAuth']()
      authService['closeServer']()
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:remove-account', async (_event, accountId: string) => {
    try {
      await authService.removeAccount(accountId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('auth:get-accounts', async () => {
    try {
      const accounts = authService.getAccounts()
      return { success: true, data: accounts }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ===== Storage Handlers =====
  ipcMain.handle(
    'storage:list-files',
    async (_event, accountId: string, folderId?: string, query?: string) => {
      try {
        const files = await getService(accountId).listFiles(accountId, folderId, query)
        return { success: true, data: files }
      } catch (err) {
        console.error('List files error:', err)
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'storage:upload-file',
    async (_event, accountId: string, folderId: string, filePaths: string[]) => {
      try {
        const files = await getService(accountId).uploadFiles(accountId, folderId, filePaths)
        return { success: true, data: files }
      } catch (err) {
        console.error('Upload error:', err)
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'storage:download-file',
    async (_event, accountId: string, fileId: string, fileName: string) => {
      try {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: fileName,
          title: 'Save file'
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Download cancelled' }
        }

        const { dirname } = await import('path')
        const destDir = dirname(result.filePath)
        const savedPath = await getService(accountId).downloadFile(accountId, fileId, destDir, (progress) => {
          mainWindow?.webContents.send('transfer:progress', {
            fileId,
            progress,
            type: 'download'
          })
        })
        return { success: true, data: savedPath }
      } catch (err) {
        console.error('Download error:', err)
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('storage:delete-file', async (_event, accountId: string, fileId: string, parentFolderId?: string) => {
    try {
      await getService(accountId).deleteFile(accountId, fileId, parentFolderId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('storage:delete-files', async (_event, accountId: string, fileIds: string[], parentFolderId?: string) => {
    try {
      if (getService(accountId).deleteFiles) {
        await getService(accountId).deleteFiles!(accountId, fileIds, parentFolderId)
      } else {
        // Fallback for any service that doesn't implement deleteFiles
        await Promise.all(
          fileIds.map((id) => getService(accountId).deleteFile(accountId, id, parentFolderId))
        )
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'storage:create-folder',
    async (_event, accountId: string, parentId: string, name: string) => {
      try {
        const folder = await getService(accountId).createFolder(accountId, parentId, name)
        return { success: true, data: folder }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'storage:move-file',
    async (_event, accountId: string, fileId: string, newParentId: string) => {
      try {
        const file = await getService(accountId).moveFile(accountId, fileId, newParentId)
        return { success: true, data: file }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'storage:rename-file',
    async (_event, accountId: string, fileId: string, newName: string) => {
      try {
        const file = await getService(accountId).renameFile(accountId, fileId, newName)
        return { success: true, data: file }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('storage:get-quota', async (_event, accountId: string) => {
    try {
      const quota = await getService(accountId).getQuota(accountId)
      // Persist updated quota to token store
      tokenStore.updateQuota(accountId, quota)
      return { success: true, data: quota }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('storage:search', async (_event, accountId: string, query: string) => {
    try {
      const files = await getService(accountId).search(accountId, query)
      return { success: true, data: files }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('storage:list-trash', async (_event, accountId: string) => {
    try {
      const files = await getService(accountId).listTrash(accountId)
      return { success: true, data: files }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('storage:list-starred', async (_event, accountId: string) => {
    try {
      const files = await getService(accountId).listStarred(accountId)
      return { success: true, data: files }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('storage:restore-file', async (_event, accountId: string, fileId: string) => {
    try {
      await getService(accountId).restoreFile(accountId, fileId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'storage:permanently-delete',
    async (_event, accountId: string, fileId: string) => {
      try {
        await getService(accountId).permanentlyDelete(accountId, fileId)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'storage:toggle-star',
    async (_event, accountId: string, fileId: string, starred: boolean) => {
      try {
        await getService(accountId).toggleStar(accountId, fileId, starred)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // ===== App Handlers =====
  ipcMain.handle('app:select-files', async () => {
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        title: 'Select files to upload'
      })
      return { success: true, data: result.filePaths }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('app:select-folder', async () => {
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select download folder'
      })
      return { success: true, data: result.filePaths[0] || null }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ===== Settings Handlers =====
  ipcMain.handle('settings:get', () => {
    try {
      const settings = settingsService.getSettings()
      return { success: true, data: settings }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('settings:set', (_event, updates: Partial<AppSettings>) => {
    try {
      const newSettings = settingsService.saveSettings(updates)
      if (updates.theme) {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          const { nativeTheme } = require('electron')
          const isLight = updates.theme === 'light' || (updates.theme === 'system' && !nativeTheme.shouldUseDarkColors)
          mainWindow.setTitleBarOverlay({
            color: isLight ? '#ffffff' : '#0a0a12',
            symbolColor: isLight ? '#475569' : '#8b8b9e'
          })
          mainWindow.setBackgroundColor(isLight ? '#ffffff' : '#0a0a12')
        }
      }
      return { success: true, data: newSettings }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('settings:get-download-folder', async () => {
    try {
      const folderPath = await settingsService.selectDownloadFolder()
      return { success: true, data: folderPath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
