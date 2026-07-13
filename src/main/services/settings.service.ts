import { app, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  defaultDownloadFolder: string
  showNotifications: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultDownloadFolder: app.getPath('downloads'),
  showNotifications: true
}

class SettingsService {
  private configPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.configPath = join(userDataPath, 'settings.json')
  }

  getSettings(): AppSettings {
    if (!existsSync(this.configPath)) {
      try {
        writeFileSync(this.configPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
      } catch (err) {
        console.error('Failed to create settings file:', err)
      }
      return DEFAULT_SETTINGS
    }

    try {
      const data = readFileSync(this.configPath, 'utf-8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    } catch (err) {
      console.error('Failed to read settings file:', err)
      return DEFAULT_SETTINGS
    }
  }

  saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings()
    const updated = { ...current, ...settings }
    try {
      writeFileSync(this.configPath, JSON.stringify(updated, null, 2))
    } catch (err) {
      console.error('Failed to write settings file:', err)
    }
    return updated
  }

  async selectDownloadFolder(): Promise<string | null> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Download Folder',
      properties: ['openDirectory']
    })

    if (!canceled && filePaths.length > 0) {
      const folderPath = filePaths[0]
      this.saveSettings({ defaultDownloadFolder: folderPath })
      return folderPath
    }
    return null
  }
}

export const settingsService = new SettingsService()
