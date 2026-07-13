import { create } from 'zustand'

export type ViewMode = 'grid' | 'list'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface UIState {
  viewMode: ViewMode
  isSidebarOpen: boolean
  toasts: Toast[]
  contextMenu: { x: number; y: number; fileId: string } | null
  isRenaming: string | null
  isCreatingFolder: boolean
  isDraggingOver: boolean
  previewFileId: string | null

  // Actions
  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  showToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
  setContextMenu: (menu: { x: number; y: number; fileId: string } | null) => void
  setRenaming: (fileId: string | null) => void
  setCreatingFolder: (creating: boolean) => void
  setDraggingOver: (dragging: boolean) => void
  setPreviewFile: (fileId: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: 'grid',
  isSidebarOpen: true,
  toasts: [],
  contextMenu: null,
  isRenaming: null,
  isCreatingFolder: false,
  isDraggingOver: false,
  previewFileId: null,

  setViewMode: (viewMode) => set({ viewMode }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  showToast: (message, type = 'info') => {
    const id = `toast-${Date.now()}`
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }))
    // Auto-remove after 4s
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }))
    }, 4000)
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    })),

  setContextMenu: (contextMenu) => set({ contextMenu }),
  setRenaming: (isRenaming) => set({ isRenaming }),
  setCreatingFolder: (isCreatingFolder) => set({ isCreatingFolder }),
  setDraggingOver: (isDraggingOver) => set({ isDraggingOver }),
  setPreviewFile: (previewFileId) => set({ previewFileId })
}))
