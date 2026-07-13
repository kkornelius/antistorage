import { useSettingsStore } from '../../stores/settingsStore'
import { useAccountStore } from '../../stores/accountStore'
import { useUIStore } from '../../stores/uiStore'
import { X, Moon, Sun, Monitor, FolderOpen, Bell, HardDrive } from 'lucide-react'
import { formatBytes } from '../../lib/utils'

export function SettingsPage(): JSX.Element | null {
  const {
    isSettingsOpen,
    setSettingsOpen,
    theme,
    defaultDownloadFolder,
    showNotifications,
    updateSettings
  } = useSettingsStore()
  const { accounts } = useAccountStore()
  const { showToast } = useUIStore()

  if (!isSettingsOpen) return null

  const handleSelectDownloadFolder = async (): Promise<void> => {
    try {
      const result = await window.api.settings.getDownloadFolder()
      if (result.success && result.data) {
        updateSettings({ defaultDownloadFolder: result.data })
        showToast('Download folder updated', 'success')
      }
    } catch {
      showToast('Failed to update download folder', 'error')
    }
  }

  return (
    <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="settings-container" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={() => setSettingsOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3 className="settings-section-title">Appearance</h3>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Theme</div>
                  <div className="settings-row-desc">Select your preferred color theme</div>
                </div>
                <div className="settings-theme-selector">
                  <button
                    className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => updateSettings({ theme: 'light' })}
                  >
                    <Sun size={16} /> Light
                  </button>
                  <button
                    className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => updateSettings({ theme: 'dark' })}
                  >
                    <Moon size={16} /> Dark
                  </button>
                  <button
                    className={`theme-btn ${theme === 'system' ? 'active' : ''}`}
                    onClick={() => updateSettings({ theme: 'system' })}
                  >
                    <Monitor size={16} /> System
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Downloads</h3>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">Default Download Location</div>
                  <div className="settings-row-desc">
                    {defaultDownloadFolder || 'Not set'}
                  </div>
                </div>
                <button className="btn-secondary" onClick={handleSelectDownloadFolder}>
                  <FolderOpen size={16} />
                  Change
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Notifications</h3>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">App Notifications</div>
                  <div className="settings-row-desc">Show toasts for file transfers and errors</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={showNotifications}
                    onChange={(e) => updateSettings({ showNotifications: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">Connected Accounts</h3>
            <div className="settings-accounts-list">
              {accounts.length === 0 && (
                <div className="settings-empty-text">No accounts connected</div>
              )}
              {accounts.map((account) => (
                <div key={account.id} className="settings-account-card">
                  <div className="settings-account-header">
                    {account.avatarUrl ? (
                      <img
                        className="settings-account-avatar"
                        src={account.avatarUrl}
                        alt={account.displayName}
                      />
                    ) : (
                      <div className="settings-account-avatar-fallback">
                        <HardDrive size={20} />
                      </div>
                    )}
                    <div>
                      <div className="settings-account-name">{account.displayName}</div>
                      <div className="settings-account-email">{account.email}</div>
                    </div>
                  </div>
                  <div className="settings-account-storage">
                    <div className="settings-storage-stats">
                      <span>{formatBytes(account.quota.used)}</span>
                      <span className="settings-storage-total">of {formatBytes(account.quota.total)} used</span>
                    </div>
                    <div className="settings-storage-bar">
                      <div
                        className="settings-storage-fill"
                        style={{
                          width: `${(account.quota.used / account.quota.total) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
