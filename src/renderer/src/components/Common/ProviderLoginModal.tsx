import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useAccountStore } from '../../stores/accountStore'

interface ProviderLoginModalProps {
  onClose: () => void
}

export function ProviderLoginModal({ onClose }: ProviderLoginModalProps): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { showToast } = useUIStore()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setIsLoading(true)
    try {
      const result = await window.api.auth.addMegaAccount(email, password)
      if (result.success) {
        useAccountStore.getState().addAccount(result.data)
        showToast(`Connected to Mega: ${email}`, 'success')
        onClose()
      } else {
        showToast(result.error || 'Failed to connect to Mega', 'error')
      }
    } catch (err) {
      showToast('Failed to connect to Mega', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
          <h2 className="modal-title" style={{ marginBottom: 0 }}>Connect Mega Account</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
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

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || !email || !password}>
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
