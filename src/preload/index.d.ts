import { ElectronAPI } from '@electron-toolkit/preload'
import type { AntiStorageAPI } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: AntiStorageAPI
  }
}
