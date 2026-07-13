import { useState } from 'react'
import { useAccountStore } from '../../stores/accountStore'
import { useFileStore } from '../../stores/fileStore'
import { useUIStore } from '../../stores/uiStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { formatBytes, getQuotaPercent } from '../../lib/utils'
import { HardDrive, Plus, X, Star, Trash2, Settings } from 'lucide-react'
import { ConfirmModal } from '../Common/ConfirmModal'
import { ProviderLoginModal } from '../Common/ProviderLoginModal'
export function Sidebar(): JSX.Element {
  const { accounts, activeAccountId, setActiveAccount } = useAccountStore()
  const { resetNavigation } = useFileStore()
  const { showToast } = useUIStore()
  const { toggleSettings } = useSettingsStore()

  const activeAccount = accounts.find((a) => a.id === activeAccountId)

  const [isAddingAccount, setIsAddingAccount] = useState(false)
  const [showMegaLogin, setShowMegaLogin] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const pendingDeleteAccount = pendingDeleteId
    ? accounts.find((a) => a.id === pendingDeleteId)
    : null

  const handleAddAccount = async (): Promise<void> => {
    setIsAddingAccount(true)

    try {
      if (!window.api?.auth) {
        showToast('App harus dibuka dari Electron, bukan browser biasa', 'error')
        return
      }
      const result = await window.api.auth.addAccount()
      if (result.success) {
        useAccountStore.getState().addAccount(result.data)
        showToast(`Connected: ${result.data.email}`, 'success')
      } else {
        showToast(result.error || 'Failed to add account', 'error')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      // Don't show toast for cancelled auth (user re-clicked or closed browser)
      if (msg !== 'Authentication cancelled') {
        showToast(`Failed to add account: ${msg}`, 'error')
      }
      console.error('Add account error:', err)
    } finally {
      setIsAddingAccount(false)
    }
  }

  const handleRequestRemove = (e: React.MouseEvent, accountId: string): void => {
    e.stopPropagation()
    setPendingDeleteId(accountId)
  }

  const handleConfirmRemove = async (): Promise<void> => {
    if (!pendingDeleteId) return
    const account = accounts.find((a) => a.id === pendingDeleteId)
    const accountId = pendingDeleteId
    setPendingDeleteId(null)

    try {
      const result = await window.api.auth.removeAccount(accountId)
      if (result.success) {
        useAccountStore.getState().removeAccount(accountId)
        showToast(`Disconnected: ${account?.email}`, 'info')
      }
    } catch (err) {
      showToast('Failed to remove account', 'error')
    }
  }

  const handleSelectAccount = (accountId: string): void => {
    setActiveAccount(accountId)
    resetNavigation()
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <HardDrive size={18} color="#fff" />
        </div>
        <span className="brand-name">AntiStorage</span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Accounts</div>
      </div>

      <div className="sidebar-accounts">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={`account-item ${activeAccountId === account.id ? 'active' : ''}`}
            onClick={() => handleSelectAccount(account.id)}
          >
            {account.avatarUrl ? (
              <img className="account-avatar" src={account.avatarUrl} alt={account.displayName} />
            ) : (
              <div className="account-avatar-placeholder">
                {account.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="account-info">
              <div className="account-name">{account.displayName}</div>
              <div className="account-email">{account.email}</div>
              <div className="quota-mini">
                <div
                  className="quota-mini-fill"
                  style={{
                    width: `${getQuotaPercent(account.quota.used, account.quota.total)}%`
                  }}
                />
              </div>
            </div>
            <button
              className="disconnect-btn"
              onClick={(e) => handleRequestRemove(e, account.id)}
              title="Disconnect account"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button
          className="add-account-btn"
          onClick={isAddingAccount ? () => window.api.auth.cancelAddAccount() : handleAddAccount}
          title={isAddingAccount ? 'Click to cancel' : ''}
        >
          {isAddingAccount ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Connecting... (Cancel)
            </>
          ) : (
            <>
              <Plus size={16} />
              Google Drive
            </>
          )}
        </button>

        <button className="add-account-btn" onClick={() => setShowMegaLogin(true)} style={{ marginTop: '0' }}>
          <Plus size={16} />
          Mega Account
        </button>
      </div>

      {showMegaLogin && <ProviderLoginModal onClose={() => setShowMegaLogin(false)} />}

      <div className="sidebar-section">
        <div className="sidebar-section-title">Navigation</div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${useFileStore.getState().driveViewMode === 'drive' ? 'active' : ''}`}
          onClick={() => useFileStore.getState().setDriveViewMode('drive')}
        >
          <HardDrive size={18} />
          My Drive
        </button>
        <button
          className={`sidebar-nav-item ${useFileStore.getState().driveViewMode === 'starred' ? 'active' : ''}`}
          onClick={() => useFileStore.getState().setDriveViewMode('starred')}
        >
          <Star size={18} />
          Starred
        </button>
        <button
          className={`sidebar-nav-item ${useFileStore.getState().driveViewMode === 'trash' ? 'active' : ''}`}
          onClick={() => useFileStore.getState().setDriveViewMode('trash')}
        >
          <Trash2 size={18} />
          Trash
        </button>
      </nav>

      <div style={{ flex: 1 }} />

      <button className="sidebar-nav-item" onClick={toggleSettings}>
        <Settings size={18} />
        Settings
      </button>

      {activeAccount && (
        <div className="sidebar-footer">
          <div className="sidebar-quota-label">
            <span>Storage</span>
            <span>
              {formatBytes(activeAccount.quota.used)} / {formatBytes(activeAccount.quota.total)}
            </span>
          </div>
          <div className="sidebar-quota-bar">
            <div
              className="sidebar-quota-fill"
              style={{
                width: `${getQuotaPercent(activeAccount.quota.used, activeAccount.quota.total)}%`
              }}
            />
          </div>
        </div>
      )}

      {pendingDeleteAccount && (
        <ConfirmModal
          title="Hapus Akun"
          message={`Yakin mau hapus akun "${pendingDeleteAccount.displayName}" (${pendingDeleteAccount.email})? Akun ini akan di-disconnect dari AntiStorage.`}
          confirmLabel="Hapus"
          cancelLabel="Batal"
          variant="danger"
          onConfirm={handleConfirmRemove}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </aside>
  )
}

