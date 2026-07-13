import { create } from 'zustand'
import type { StorageAccount, StorageQuota } from '../../../shared/types'

interface AccountState {
  accounts: StorageAccount[]
  activeAccountId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  setAccounts: (accounts: StorageAccount[]) => void
  setActiveAccount: (accountId: string | null) => void
  addAccount: (account: StorageAccount) => void
  removeAccount: (accountId: string) => void
  updateQuota: (accountId: string, quota: StorageQuota) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  isLoading: false,
  error: null,

  setAccounts: (accounts) => {
    set({ accounts })
    // Set first account as active if none selected
    if (!get().activeAccountId && accounts.length > 0) {
      set({ activeAccountId: accounts[0].id })
    }
  },

  setActiveAccount: (accountId) => set({ activeAccountId: accountId }),

  addAccount: (account) => {
    set((state) => ({
      accounts: [...state.accounts, account],
      activeAccountId: state.activeAccountId || account.id
    }))
  },

  removeAccount: (accountId) => {
    set((state) => {
      const filtered = state.accounts.filter((a) => a.id !== accountId)
      return {
        accounts: filtered,
        activeAccountId:
          state.activeAccountId === accountId
            ? filtered[0]?.id || null
            : state.activeAccountId
      }
    })
  },

  updateQuota: (accountId, quota) => {
    set((state) => ({
      accounts: state.accounts.map((a) => (a.id === accountId ? { ...a, quota } : a))
    }))
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error })
}))
