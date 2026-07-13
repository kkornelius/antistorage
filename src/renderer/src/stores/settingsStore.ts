import { create } from 'zustand'
import type { AppSettings } from '../../../shared/types'

interface SettingsState extends AppSettings {
  isLoading: boolean
  isSettingsOpen: boolean

  // Actions
  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>
  toggleSettings: () => void
  setSettingsOpen: (isOpen: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  defaultDownloadFolder: '',
  showNotifications: true,
  isLoading: true,
  isSettingsOpen: false,

  loadSettings: async () => {
    set({ isLoading: true })
    try {
      const result = await window.api.settings.get()
      if (result.success) {
        set({ ...result.data, isLoading: false })
      } else {
        set({ isLoading: false })
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      set({ isLoading: false })
    }
  },

  updateSettings: async (updates) => {
    // Optimistic update
    set({ ...updates })
    try {
      await window.api.settings.set(updates)
    } catch (err) {
      console.error('Failed to update settings:', err)
      // We could revert on failure, but for simplicity we keep it
    }
  },

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen })
}))
