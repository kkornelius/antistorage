import { create } from 'zustand'

export interface Transfer {
  id: string
  fileName: string
  fileSize: number
  type: 'upload' | 'download'
  status: 'active' | 'completed' | 'error'
  progress: number // 0-100
  speed: number // bytes/sec
  error?: string
  startedAt: number
  completedAt?: number
}

interface TransferState {
  transfers: Transfer[]
  isExpanded: boolean

  // Actions
  addTransfer: (transfer: Omit<Transfer, 'startedAt' | 'speed'>) => void
  updateProgress: (id: string, progress: number, speed?: number) => void
  completeTransfer: (id: string) => void
  failTransfer: (id: string, error: string) => void
  removeTransfer: (id: string) => void
  clearCompleted: () => void
  togglePanel: () => void
  setExpanded: (expanded: boolean) => void
}

export const useTransferStore = create<TransferState>((set) => ({
  transfers: [],
  isExpanded: false,

  addTransfer: (transfer) => {
    set((state) => ({
      transfers: [
        {
          ...transfer,
          startedAt: Date.now(),
          speed: 0
        },
        ...state.transfers
      ],
      isExpanded: true
    }))
  },

  updateProgress: (id, progress, speed) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id
          ? {
              ...t,
              progress: Math.min(progress, 100),
              ...(speed !== undefined ? { speed } : {})
            }
          : t
      )
    }))
  },

  completeTransfer: (id) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id
          ? { ...t, status: 'completed' as const, progress: 100, completedAt: Date.now(), speed: 0 }
          : t
      )
    }))
  },

  failTransfer: (id, error) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id ? { ...t, status: 'error' as const, error, speed: 0 } : t
      )
    }))
  },

  removeTransfer: (id) => {
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== id)
    }))
  },

  clearCompleted: () => {
    set((state) => ({
      transfers: state.transfers.filter((t) => t.status === 'active')
    }))
  },

  togglePanel: () => {
    set((state) => ({ isExpanded: !state.isExpanded }))
  },

  setExpanded: (isExpanded) => set({ isExpanded })
}))
