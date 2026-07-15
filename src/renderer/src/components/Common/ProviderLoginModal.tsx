import React, { useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useAccountStore } from '../../stores/accountStore'

interface ProviderLoginModalProps {
  provider: 'mega' | 'terabox'
  onClose: () => void
}

export function ProviderLoginModal({ provider, onClose }: ProviderLoginModalProps): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ndus, setNdus] = useState('')
  const [jsToken, setJsToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { showToast } = useUIStore()

  const isMega = provider === 'mega'
  const title = isMega ? 'Connect Mega Account' : 'Connect Terabox Account'

  const canSubmit = isMega ? email && password : true

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsLoading(true)
    try {
      if (isMega) {
        const result = await window.api.auth.addMegaAccount(email, password)
        if (result.success) {
          useAccountStore.getState().addAccount(result.data)
          showToast(`Connected to Mega: ${email}`, 'success')
          onClose()
        } else {
          showToast(result.error || 'Failed to connect to Mega', 'error')
        }
      } else {
        const result = await window.api.auth.addTeraboxAccount()
        if (result.success) {
          useAccountStore.getState().addAccount(result.data)
          showToast('Connected to Terabox!', 'success')
          onClose()
        } else {
          showToast(result.error || 'Failed to connect to Terabox', 'error')
        }
      }
    } catch {
      showToast(`Failed to connect to ${isMega ? 'Mega' : 'Terabox'}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
          <h2 className="modal-title" style={{ marginBottom: 0 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {!isMega && (
          <div style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            marginBottom: 'var(--space-lg)',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: '1.6'
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Cara mendapatkan token:</strong>
            <ol style={{ paddingLeft: 'var(--space-lg)', marginTop: 'var(--space-xs)' }}>
              <li>Login ke <a href="https://www.terabox.com" target="_blank" rel="noreferrer" style={{ color: 'var(--text-accent)', textDecoration: 'none' }}>terabox.com <ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /></a></li>
              <li>Buka DevTools (F12) → tab <strong>Application</strong> → <strong>Cookies</strong></li>
              <li>Copy value dari cookie <code style={{ background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: '3px' }}>ndus</code></li>
              <li>Di tab <strong>Network</strong>, klik folder/file apapun, lalu cari <code style={{ background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: '3px' }}>jsToken</code> di request headers/payload</li>
            </ol>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {isMega ? (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '12px', color: 'var(--text-secondary)' }}>Email</label>
                <input
                  type="email"
                  className="modal-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '12px', color: 'var(--text-secondary)' }}>Password</label>
                <input
                  type="password"
                  className="modal-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', margin: 'var(--space-md) 0' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                  A login window will open. Please log in to your Terabox account normally. The window will close automatically once successful.
                </p>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || !canSubmit}>
              {isLoading ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
