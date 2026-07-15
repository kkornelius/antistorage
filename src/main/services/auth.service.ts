import { google } from 'googleapis'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { shell } from 'electron'
import { tokenStore } from './token-store'
import type { StorageAccount } from '../../shared/types'

// .env is auto-injected by electron-vite with MAIN_VITE_ prefix
const CLIENT_ID = (import.meta.env as any).MAIN_VITE_GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = (import.meta.env as any).MAIN_VITE_GOOGLE_CLIENT_SECRET || ''
const REDIRECT_URI =
  (import.meta.env as any).MAIN_VITE_GOOGLE_REDIRECT_URI || 'http://localhost:8765/auth/callback'

console.log('[AntiStorage] OAuth Config:', {
  clientId: CLIENT_ID ? `${CLIENT_ID.substring(0, 20)}...` : 'MISSING',
  redirectUri: REDIRECT_URI
})

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]

class AuthService {
  private activeAuthServer: ReturnType<typeof createServer> | null = null
  private authTimeout: ReturnType<typeof setTimeout> | null = null
  private pendingReject: ((reason: Error) => void) | null = null
  createOAuthClient(tokens?: { access_token: string; refresh_token: string; expiry_date: number }) {
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

    if (tokens) {
      oauth2Client.setCredentials(tokens)
    }

    // Listen for token refresh events
    oauth2Client.on('tokens', (newTokens) => {
      if (newTokens.refresh_token) {
        console.log('Token refreshed')
      }
    })

    return oauth2Client
  }

  getAuthClientForAccount(accountId: string) {
    const tokens = tokenStore.getTokens(accountId)
    if (!tokens) {
      throw new Error(`No tokens found for account ${accountId}`)
    }

    const client = this.createOAuthClient(tokens as any)

    // Update tokens on refresh
    client.on('tokens', (newTokens) => {
      const current = tokenStore.getTokens(accountId)
      if (current) {
        tokenStore.updateTokens(accountId, {
          ...current,
          ...(newTokens as any)
        })
      }
    })

    return client
  }

  private cleanupAuth(): void {
    if (this.authTimeout) {
      clearTimeout(this.authTimeout)
      this.authTimeout = null
    }
    // Reject any pending auth promise so the frontend's await unblocks
    if (this.pendingReject) {
      const reject = this.pendingReject
      this.pendingReject = null
      reject(new Error('Authentication cancelled'))
    }
  }

  private closeServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.activeAuthServer) {
        const server = this.activeAuthServer
        this.activeAuthServer = null
        server.close(() => resolve())
      } else {
        resolve()
      }
    })
  }

  async addAccount(): Promise<StorageAccount> {
    // Clean up any existing auth session
    this.cleanupAuth()
    await this.closeServer()

    return new Promise((resolve, reject) => {
      let settled = false

      // Store reject so cleanupAuth() can cancel this promise if addAccount is called again
      this.pendingReject = reject

      const settle = (): void => {
        if (settled) return
        settled = true
        this.pendingReject = null
        this.cleanupAuth()
      }

      const oauth2Client = this.createOAuthClient()

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES
      })

      // Start temporary HTTP server to capture callback
      const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url || '', `http://localhost:8765`)

          if (url.pathname === '/auth/callback') {
            const code = url.searchParams.get('code')
            const error = url.searchParams.get('error')

            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(this.getErrorPage(error))
              settle()
              server.close()
              this.activeAuthServer = null
              reject(new Error(`Auth error: ${error}`))
              return
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' })
              res.end(this.getErrorPage('No authorization code received'))
              settle()
              server.close()
              this.activeAuthServer = null
              reject(new Error('No authorization code received'))
              return
            }

            // Exchange code for tokens
            const { tokens } = await oauth2Client.getToken(code)
            oauth2Client.setCredentials(tokens)

            // Get user info
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
            const userInfo = await oauth2.userinfo.get()

            // Get drive quota
            const drive = google.drive({ version: 'v3', auth: oauth2Client })
            const about = await drive.about.get({ fields: 'storageQuota,user' })

            const storageQuota = about.data.storageQuota
            const account: StorageAccount = {
              id: userInfo.data.id || `gdrive-${Date.now()}`,
              email: userInfo.data.email || 'unknown',
              displayName: userInfo.data.name || 'Unknown',
              avatarUrl: userInfo.data.picture || '',
              provider: 'google-drive',
              quota: {
                used: parseInt(storageQuota?.usage || '0'),
                total: parseInt(storageQuota?.limit || '16106127360'), // 15GB default
                usedInDrive: parseInt(storageQuota?.usageInDrive || '0'),
                usedInTrash: parseInt(storageQuota?.usageInDriveTrash || '0')
              },
              connectedAt: Date.now()
            }

            // Save to token store
            tokenStore.addAccount(account, {
              access_token: tokens.access_token || '',
              refresh_token: tokens.refresh_token || '',
              scope: tokens.scope || '',
              token_type: tokens.token_type || 'Bearer',
              expiry_date: tokens.expiry_date || 0
            })

            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(this.getSuccessPage(account.displayName, account.email))
            settle()
            server.close()
            this.activeAuthServer = null
            resolve(account)
          }
        } catch (err) {
          console.error('Auth callback error:', err)
          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end(this.getErrorPage('Internal server error'))
          settle()
          server.close()
          this.activeAuthServer = null
          reject(err)
        }
      })

      this.activeAuthServer = server

      server.listen(8765, () => {
        console.log('Auth server listening on port 8765')
        // Open browser for auth
        shell.openExternal(authUrl)
      })

      server.on('error', (err: NodeJS.ErrnoException) => {
        console.error('Auth server error:', err)
        settle()
        this.activeAuthServer = null
        if (err.code === 'EADDRINUSE') {
          reject(new Error('Authentication is already in progress. Please wait or restart the app.'))
        } else {
          reject(err)
        }
      })

      // Timeout after 5 minutes
      this.authTimeout = setTimeout(() => {
        if (!settled) {
          settle()
          server.close()
          this.activeAuthServer = null
          reject(new Error('Authentication timed out'))
        }
      }, 5 * 60 * 1000)
    })
  }

  async removeAccount(accountId: string): Promise<void> {
    const tokens = tokenStore.getTokens(accountId)
    if (tokens) {
      try {
        const client = this.createOAuthClient(tokens as any)
        await client.revokeToken(tokens.access_token as string)
      } catch (err) {
        console.warn('Failed to revoke token (may be expired):', err)
      }
    }
    tokenStore.removeAccount(accountId)
  }

  getAccounts(): StorageAccount[] {
    return tokenStore.getAccounts()
  }

  async addMegaAccount(email: string, password: string): Promise<StorageAccount> {
    try {
      const { Storage } = await import('megajs')
      const storage = new Storage({ email, password, keepalive: false })
      await storage.ready
      
      const accountInfo = await storage.getAccountInfo()
      
      const account: StorageAccount = {
        id: `mega-${email}`,
        email,
        displayName: `Mega (${email})`,
        avatarUrl: '',
        provider: 'mega',
        quota: {
          used: accountInfo.spaceUsed || 0,
          total: accountInfo.spaceTotal || 0
        },
        connectedAt: Date.now()
      }

      tokenStore.addAccount(account, { password })
      return account
    } catch (err) {
      console.error('Mega login error:', err)
      throw new Error('Invalid email or password')
    }
  }

  async addTeraboxAccountViaWebview(): Promise<StorageAccount> {
    const { BrowserWindow, session } = require('electron')
    
    return new Promise((resolve, reject) => {
      let resolved = false

      const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })
      
      win.loadURL('https://dm.terabox.com/main')
      
      const checkLogin = async () => {
        if (resolved) return
        try {
          const cookies = await session.defaultSession.cookies.get({ domain: '.terabox.com' })
          const ndusCookie = cookies.find((c: any) => c.name === 'ndus')
          if (ndusCookie) {
            const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')
            const jsTokenRes = await win.webContents.executeJavaScript('window.jsToken || ""')
            
            if (jsTokenRes) {
              resolved = true
              win.close()
              resolve(this.addTeraboxAccount(cookieString, jsTokenRes))
            }
          }
        } catch (err) {
          // Ignore extraction errors during navigation
        }
      }

      win.webContents.on('did-navigate', checkLogin)
      win.webContents.on('did-navigate-in-page', checkLogin)
      win.webContents.on('dom-ready', checkLogin)
      
      win.on('closed', () => {
        if (!resolved) {
          reject(new Error('Login window closed before completing authentication'))
        }
      })
    })
  }

  async addTeraboxAccount(ndus: string, jsToken: string): Promise<StorageAccount> {
    try {
      const cleanNdus = ndus.trim().replace(/[^\x20-\x7E]/g, '')
      const cleanJsToken = jsToken.trim()

      const { net } = require('electron')
      const params = new URLSearchParams({
        app_id: '250528',
        web: '1',
        channel: 'dubox',
        clienttype: '0',
        checkfree: '1',
        checkexpire: '1'
      })

      const quotaData: any = await new Promise((resolve, reject) => {
        const req = net.request({
          method: 'GET',
          url: `https://dm.terabox.com/api/quota?${params.toString()}`,
          useSessionCookies: false // Don't use default session cookies, we provide our own
        })

        req.setHeader('Cookie', (cleanNdus.includes('=') ? cleanNdus : `ndus=${cleanNdus}`).replace(/[^\x20-\x7E]/g, ''))
        req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        req.setHeader('Accept', 'application/json, text/plain, */*')
        req.setHeader('Referer', 'https://dm.terabox.com/')
        req.setHeader('Origin', 'https://dm.terabox.com')

        req.on('response', (res: any) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            try {
              const responseText = Buffer.concat(chunks).toString()
              console.log('[Terabox Auth Check] Response:', responseText)
              resolve(JSON.parse(responseText))
            } catch {
              reject(new Error('Invalid response from Terabox'))
            }
          })
        })
        req.on('error', reject)
        req.end()
      })

      if (quotaData.errno !== 0) {
        throw new Error(`Terabox Error (errno: ${quotaData.errno}): ${JSON.stringify(quotaData)}`)
      }

      const ndusValue = cleanNdus.includes('ndus=')
        ? cleanNdus.split('ndus=')[1].split(';')[0]
        : cleanNdus.substring(0, 16)
      
      const accountId = `terabox-${ndusValue}`
      const account: StorageAccount = {
        id: accountId,
        provider: 'terabox',
        email: 'terabox-user',
        displayName: 'Terabox',
        avatarUrl: '',
        quota: {
          used: quotaData.used || 0,
          total: quotaData.total || 0
        },
        connectedAt: Date.now()
      }

      tokenStore.addAccount(account, { ndus: cleanNdus, jsToken: cleanJsToken })
      return account
    } catch (err) {
      console.error('Terabox login error:', err)
      throw new Error(
        err instanceof Error ? err.message : 'Failed to connect to Terabox'
      )
    }
  }

  private getSuccessPage(name: string, email: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AntiStorage - Connected!</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; background: #0a0a0f; color: #fff;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
    padding: 48px; text-align: center; max-width: 420px; }
  .check { font-size: 64px; margin-bottom: 16px; }
  h1 { font-size: 24px; margin-bottom: 8px; background: linear-gradient(135deg, #6366f1, #8b5cf6);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  p { color: rgba(255,255,255,0.6); margin-top: 8px; }
  .hint { margin-top: 24px; font-size: 13px; color: rgba(255,255,255,0.4); }
</style></head><body>
<div class="card">
  <div class="check">✅</div>
  <h1>Account Connected!</h1>
  <p><strong>${name}</strong></p>
  <p>${email}</p>
  <p class="hint">You can close this tab and return to AntiStorage.</p>
</div></body></html>`
  }

  private getErrorPage(error: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AntiStorage - Error</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; background: #0a0a0f; color: #fff;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
    padding: 48px; text-align: center; max-width: 420px; }
  .icon { font-size: 64px; margin-bottom: 16px; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #ef4444; }
  p { color: rgba(255,255,255,0.6); margin-top: 8px; }
</style></head><body>
<div class="card">
  <div class="icon">❌</div>
  <h1>Connection Failed</h1>
  <p>${error}</p>
  <p>Please try again from AntiStorage.</p>
</div></body></html>`
  }
}

export const authService = new AuthService()
