import { create } from 'zustand'
import type { CloudFile } from '../../../shared/types'

export type DriveViewMode = 'drive' | 'trash' | 'starred'

interface BreadcrumbItem {
  id: string
  name: string
}

interface FileState {
  files: CloudFile[]
  currentFolderId: string | null
  breadcrumb: BreadcrumbItem[]
  selectedFiles: Set<string>
  isLoading: boolean
  error: string | null
  searchQuery: string
  driveViewMode: DriveViewMode

  // Actions
  setFiles: (files: CloudFile[]) => void
  setCurrentFolder: (folderId: string | null, name?: string) => void
  navigateTo: (index: number) => void
  resetNavigation: () => void
  toggleSelect: (fileId: string) => void
  selectOnly: (fileId: string) => void
  selectAll: () => void
  clearSelection: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSearchQuery: (query: string) => void
  addFile: (file: CloudFile) => void
  removeFile: (fileId: string) => void
  updateFile: (fileId: string, updates: Partial<CloudFile>) => void
  setDriveViewMode: (mode: DriveViewMode) => void
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  currentFolderId: null,
  breadcrumb: [{ id: 'root', name: 'My Drive' }],
  selectedFiles: new Set<string>(),
  isLoading: false,
  error: null,
  searchQuery: '',
  driveViewMode: 'drive',

  setFiles: (files) => set({ files, selectedFiles: new Set() }),

  setCurrentFolder: (folderId, name) => {
    const state = get()
    if (folderId === null || folderId === 'root') {
      set({
        currentFolderId: null,
        breadcrumb: [{ id: 'root', name: 'My Drive' }],
        selectedFiles: new Set()
      })
    } else {
      set({
        currentFolderId: folderId,
        breadcrumb: [...state.breadcrumb, { id: folderId, name: name || 'Folder' }],
        selectedFiles: new Set()
      })
    }
  },

  navigateTo: (index) => {
    const state = get()
    const item = state.breadcrumb[index]
    set({
      currentFolderId: item.id === 'root' ? null : item.id,
      breadcrumb: state.breadcrumb.slice(0, index + 1),
      selectedFiles: new Set()
    })
  },

  resetNavigation: () => {
    set({
      currentFolderId: null,
      breadcrumb: [{ id: 'root', name: 'My Drive' }],
      selectedFiles: new Set(),
      searchQuery: ''
    })
  },

  toggleSelect: (fileId) => {
    set((state) => {
      const next = new Set(state.selectedFiles)
      if (next.has(fileId)) {
        next.delete(fileId)
      } else {
        next.add(fileId)
      }
      return { selectedFiles: next }
    })
  },

  selectOnly: (fileId) => {
    set({ selectedFiles: new Set([fileId]) })
  },

  selectAll: () => {
    const files = get().files
    set({ selectedFiles: new Set(files.map((f) => f.id)) })
  },

  clearSelection: () => set({ selectedFiles: new Set() }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  addFile: (file) => set((state) => ({ files: [file, ...state.files] })),

  removeFile: (fileId) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== fileId),
      selectedFiles: (() => {
        const next = new Set(state.selectedFiles)
        next.delete(fileId)
        return next
      })()
    })),

  updateFile: (fileId, updates) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === fileId ? { ...f, ...updates } : f))
    })),

  setDriveViewMode: (driveViewMode) => {
    set({
      driveViewMode,
      currentFolderId: null,
      breadcrumb: [
        {
          id: 'root',
          name:
            driveViewMode === 'trash'
              ? 'Trash'
              : driveViewMode === 'starred'
                ? 'Starred'
                : 'My Drive'
        }
      ],
      selectedFiles: new Set(),
      searchQuery: ''
    })
  }
}))

