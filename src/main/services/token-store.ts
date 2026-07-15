import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { StorageAccount } from '../../shared/types'

export interface TokenData {
  access_token?: string
  refresh_token?: string
  scope?: string
  token_type?: string
  expiry_date?: number
  // Mega
  password?: string
  session?: any
  // Terabox
  ndus?: string
  jsToken?: string
}

interface AccountRecord {
  account: StorageAccount
  tokens: string // encrypted base64
}

interface StoreData {
  accounts: AccountRecord[]
}

const STORE_FILE = 'antistorage-data.json'

class TokenStore {
  private storePath: string
  private data: StoreData

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.storePath = join(userDataPath, STORE_FILE)
    this.data = this.load()
  }

  private load(): StoreData {
    try {
      if (existsSync(this.storePath)) {
        const raw = readFileSync(this.storePath, 'utf-8')
        return JSON.parse(raw)
      }
    } catch (err) {
      console.error('Failed to load token store:', err)
    }
    return { accounts: [] }
  }

  private save(): void {
    try {
      writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save token store:', err)
    }
  }

  private encryptTokens(tokens: TokenData): string {
    const json = JSON.stringify(tokens)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json)
      return encrypted.toString('base64')
    }
    // Fallback: base64 encode (not secure, but works in dev)
    return Buffer.from(json).toString('base64')
  }

  decryptTokens(encrypted: string): TokenData {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encrypted, 'base64')
        const decrypted = safeStorage.decryptString(buffer)
        return JSON.parse(decrypted)
      }
      // Fallback: base64 decode
      const decoded = Buffer.from(encrypted, 'base64').toString('utf-8')
      return JSON.parse(decoded)
    } catch (err) {
      console.error('Failed to decrypt tokens:', err)
      throw new Error('Failed to decrypt tokens')
    }
  }

  addAccount(account: StorageAccount, tokens: TokenData): void {
    // Remove existing account with same id if exists
    this.data.accounts = this.data.accounts.filter((a) => a.account.id !== account.id)
    this.data.accounts.push({
      account,
      tokens: this.encryptTokens(tokens)
    })
    this.save()
  }

  removeAccount(accountId: string): void {
    this.data.accounts = this.data.accounts.filter((a) => a.account.id !== accountId)
    this.save()
  }

  getAccounts(): StorageAccount[] {
    return this.data.accounts.map((a) => a.account)
  }

  getTokens(accountId: string): TokenData | null {
    const record = this.data.accounts.find((a) => a.account.id === accountId)
    if (!record) return null
    return this.decryptTokens(record.tokens)
  }

  updateTokens(accountId: string, tokens: TokenData): void {
    const record = this.data.accounts.find((a) => a.account.id === accountId)
    if (record) {
      record.tokens = this.encryptTokens(tokens)
      this.save()
    }
  }

  updateQuota(accountId: string, quota: StorageAccount['quota']): void {
    const record = this.data.accounts.find((a) => a.account.id === accountId)
    if (record) {
      record.account.quota = quota
      this.save()
    }
  }
}

export const tokenStore = new TokenStore()
