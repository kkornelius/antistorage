import { tokenStore } from './token-store'
import type { CloudFile, StorageQuota } from '../../shared/types'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

// Terabox API base URLs
const API_BASE = 'https://dm.terabox.com'

interface TeraboxFileInfo {
  fs_id: number
  path: string
  server_filename: string
  size: number
  isdir: number
  server_mtime: number
  server_ctime: number
  local_mtime: number
  local_ctime: number
  md5?: string
  thumbs?: { url1?: string; url2?: string; url3?: string }
}

interface TeraboxListResponse {
  errno: number
  list: TeraboxFileInfo[]
  request_id?: number
}

class TeraboxService {
  private getCredentials(accountId: string): { ndus: string; jsToken: string } {
    const tokens = tokenStore.getTokens(accountId)
    if (!tokens || !tokens.ndus) {
      throw new Error(`No Terabox credentials found for account ${accountId}`)
    }
    // We allow jsToken to be empty initially because we can refresh it
    return { ndus: tokens.ndus as string, jsToken: (tokens.jsToken || '') as string }
  }

  private async refreshJsToken(accountId: string, ndus: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const { net } = require('electron')
      const req = net.request({
        method: 'GET',
        url: `${API_BASE}/main`,
        useSessionCookies: false
      })

      req.setHeader('Cookie', (ndus.includes('=') ? ndus : `ndus=${ndus}`).replace(/[^\x20-\x7E]/g, ''))
      req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      req.setHeader('Accept', 'application/json, text/plain, */*')

      req.on('response', (res: any) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf-8')
          
          // Match standard jsToken formats in Terabox HTML
          const match1 = html.match(/window\.jsToken\s*=\s*['"]([^'"]+)['"]/)
          const match2 = html.match(/fn\(\s*['"]([^'"]+)['"]\s*\)/)
          const match3 = html.match(/%22([^%]+)%22/)
          
          let newToken = ''
          if (match1) newToken = match1[1]
          else if (match2) newToken = match2[1]
          else if (match3) newToken = match3[1]
          else {
            // Check alternative formats
            const match4 = html.match(/jsToken['"]?\s*:\s*['"]([^'"]+)['"]/)
            if (match4) newToken = match4[1]
          }

          if (newToken) {
            // Update token store
            const currentTokens = tokenStore.getTokens(accountId) || {}
            tokenStore.updateTokens(accountId, { ...currentTokens, jsToken: newToken, ndus })
            resolve(newToken)
          } else {
            console.error('[Terabox] Failed to extract jsToken. HTML preview:', html.substring(0, 500))
            reject(new Error('Could not extract jsToken from Terabox web interface'))
          }
        })
      })
      req.on('error', reject)
      req.end()
    })
  }

  private async apiRequest(
    endpoint: string,
    accountId: string,
    method: 'GET' | 'POST' = 'GET',
    body?: string | Buffer,
    contentType?: string
  ): Promise<any> {
    const { ndus, jsToken } = this.getCredentials(accountId)

    // Use URL object for safe construction - handles encoding of spaces/special chars in paths
    const baseUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
    const urlObj = new URL(baseUrl)
    urlObj.searchParams.set('jsToken', jsToken)
    const url = urlObj.toString()

    return new Promise((resolve, reject) => {
      const { net } = require('electron')
      const req = net.request({
        method,
        url,
        useSessionCookies: false
      })

      req.setHeader('Cookie', (ndus.includes('=') ? ndus : `ndus=${ndus}`).replace(/[^\x20-\x7E]/g, ''))
      req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      req.setHeader('Accept', 'application/json, text/plain, */*')
      req.setHeader('Referer', 'https://dm.terabox.com/')
      req.setHeader('Origin', 'https://dm.terabox.com')
      req.setHeader('X-Requested-With', 'XMLHttpRequest')

      if (contentType) {
        req.setHeader('Content-Type', contentType)
      }

      // Let Electron net.request automatically calculate Content-Length
      // Manually setting it can sometimes trigger net::ERR_INVALID_ARGUMENT

      req.on('response', (res: any) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          try {
            const data = JSON.parse(raw)
            if (data.errno === 4000023) {
              console.log(`[Terabox API] jsToken expired (4000023) for ${endpoint}. Resolving with error so caller can retry.`)
            }
            resolve(data)
          } catch {
            reject(new Error(`Terabox API returned non-JSON: ${raw.substring(0, 200)}`))
          }
        })
      })

      req.on('error', reject)

      if (body) {
        req.write(body)
      }
      req.end()
    })
  }

  private mapFile(file: TeraboxFileInfo, accountId: string): CloudFile {
    const safePath = file.path || ''
    return {
      // Use the full path as ID for all items - this avoids needing
      // filemetas lookups when navigating, deleting, or renaming.
      id: safePath,
      name: file.server_filename || (safePath ? path.posix.basename(safePath) : 'Unknown File'),
      mimeType: file.isdir === 1 ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
      size: file.size || 0,
      createdTime: new Date((file.server_ctime || 0) * 1000).toISOString(),
      modifiedTime: new Date((file.server_mtime || 0) * 1000).toISOString(),
      parentId: safePath && safePath !== '/' ? path.posix.dirname(safePath) : null,
      accountId,
      provider: 'terabox',
      isFolder: file.isdir === 1,
      shared: false,
      starred: false,
      trashed: false,
      thumbnailLink: file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1 || ''
    }
  }

  async listFiles(
    accountId: string,
    folderId?: string,
    query?: string
  ): Promise<CloudFile[]> {
    if (query) {
      return this.search(accountId, query)
    }

    // folderId for Terabox is a path (e.g. '/CYSEGS') for subfolders,
    // or undefined / 'root' for the root directory.
    const dir = (folderId && folderId !== 'root') ? folderId : '/'

    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      dir,
      order: 'name',
      desc: '0',
      page: '1',
      num: '200'
    })

    const res: TeraboxListResponse = await this.apiRequest(
      `/api/list?${params.toString()}`,
      accountId
    )

    if (res.errno !== 0) {
      throw new Error(`Terabox list error (errno: ${res.errno}). Session may have expired.`)
    }

    return (res.list || []).map((f) => this.mapFile(f, accountId))
  }

  async uploadFiles(
    accountId: string,
    folderId: string,
    filePaths: string[]
  ): Promise<CloudFile[]> {
    const { ndus, jsToken } = this.getCredentials(accountId)
    const uploadedFiles: CloudFile[] = []
    
    let targetDir = '/'
    if (folderId && folderId !== 'root') {
      // folderId is now the path directly (e.g. '/CYSEGS')
      targetDir = folderId
    }

    for (const filePath of filePaths) {
      const fileName = path.basename(filePath)
      const fileSize = fs.statSync(filePath).size
      const remotePath = targetDir === '/' ? `/${fileName}` : `${targetDir}/${fileName}`

      const fileContent = fs.readFileSync(filePath)
      const fileMd5 = require('crypto').createHash('md5').update(fileContent).digest('hex')

      // Step 1: Precreate
      const precreateParams = new URLSearchParams({
        app_id: '250528',
        web: '1',
        channel: 'dubox',
        clienttype: '0'
      })

      const precreateBody = new URLSearchParams({
        path: remotePath,
        size: String(fileContent.length),
        isdir: '0',
        autoinit: '1',
        block_list: JSON.stringify([fileMd5])
      })

      let precreateRes = await this.apiRequest(
        `/api/precreate?${precreateParams.toString()}`,
        accountId,
        'POST',
        precreateBody.toString(),
        'application/x-www-form-urlencoded'
      )

      if (precreateRes.errno === 4000023) {
        console.log('[Terabox Upload] Refreshing jsToken due to 4000023...')
        const newJsToken = await this.refreshJsToken(accountId, ndus)
        precreateParams.set('jsToken', newJsToken)
        precreateRes = await this.apiRequest(
          `/api/precreate?${precreateParams.toString()}`,
          accountId,
          'POST',
          precreateBody.toString(),
          'application/x-www-form-urlencoded'
        )
      }

      if (precreateRes.errno !== 0) {
        throw new Error(`Terabox precreate error: ${precreateRes.errno}`)
      }

      const uploadId = precreateRes.uploadid

      // Step 2: Upload the file content
      const uploadParams = new URLSearchParams({
        method: 'upload',
        app_id: '250528',
        channel: 'dubox',
        clienttype: '0',
        web: '1',
        path: remotePath,
        uploadid: uploadId,
        partseq: '0'
      })
      if (jsToken) {
        uploadParams.set('jsToken', jsToken)
      }

      // Build multipart form-data manually
      const boundary = `----WebKitFormBoundary${Date.now().toString(36)}`

      const prefix = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      )
      const suffix = Buffer.from(`\r\n--${boundary}--\r\n`)
      const multipartBody = Buffer.concat([prefix, fileContent, suffix])

      // Find the correct regional upload server dynamically
      let uploadHost = 'c-all.terabox.com'
      try {
        const locateParams = new URLSearchParams({ method: 'locateupload', app_id: '250528' })
        if (jsToken) {
          locateParams.set('jsToken', jsToken)
        }
        const locateRes = await this.apiRequest(
          `/rest/2.0/pcs/file?${locateParams.toString()}`,
          accountId
        )

        if (locateRes?.host) {
          uploadHost = locateRes.host
        }
      } catch (err) {
        console.warn('[Terabox] Failed to dynamically locate upload server, using fallback', err)
      }

      // Set up the request
      const uploadUrl = `https://${uploadHost}/rest/2.0/pcs/superfile2?${uploadParams.toString()}`
      const parsedUploadUrl = new URL(uploadUrl)



      await new Promise<void>((resolve, reject) => {
        const req = https.request(
          {
            hostname: parsedUploadUrl.hostname,
            path: parsedUploadUrl.pathname + parsedUploadUrl.search,
            method: 'POST',
            headers: {
              Cookie: (ndus.includes('=') ? ndus : `ndus=${ndus}`).replace(/[^\x20-\x7E]/g, ''),
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': String(multipartBody.length),
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Origin: 'https://www.terabox.com',
              Referer: 'https://www.terabox.com/main'
            }
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              try {
                const uploadRes = JSON.parse(Buffer.concat(chunks).toString())
                if (uploadRes.md5) {
                  resolve()
                } else {
                  reject(new Error(`Upload chunk failed: ${JSON.stringify(uploadRes)}`))
                }
              } catch {
                resolve() // Proceed even with non-JSON response
              }
            })
          }
        )
        req.on('error', reject)
        req.write(multipartBody)
        req.end()
      })

      // Step 3: Create (finalize)
      const createParams = new URLSearchParams({
        app_id: '250528',
        web: '1',
        channel: 'dubox',
        clienttype: '0'
      })

      const createBody = new URLSearchParams({
        path: remotePath,
        size: String(fileSize),
        isdir: '0',
        uploadid: uploadId,
        block_list: JSON.stringify([fileMd5])
      })

      const createRes = await this.apiRequest(
        `/api/create?${createParams.toString()}`,
        accountId,
        'POST',
        createBody.toString(),
        'application/x-www-form-urlencoded'
      )

      if (createRes.errno !== 0) {
        throw new Error(`Terabox create error: ${createRes.errno}`)
      }

      uploadedFiles.push({
        id: remotePath, // Use path as ID for consistency
        name: createRes.server_filename || fileName,
        mimeType: 'application/octet-stream',
        size: fileSize,
        createdTime: new Date((createRes.server_ctime || Date.now() / 1000) * 1000).toISOString(),
        modifiedTime: new Date((createRes.server_mtime || Date.now() / 1000) * 1000).toISOString(),
        parentId: targetDir,
        accountId,
        provider: 'terabox',
        isFolder: false,
        shared: false,
        starred: false,
        trashed: false
      })
    }

    return uploadedFiles
  }

  async downloadFile(
    accountId: string,
    fileId: string,
    destDir: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    // fileId is now a path (e.g. /CYSEGS/RESOURCES/file.pdf)
    // Use path-based filemetas query to get the dlink
    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      dlink: '1',
      path: fileId
    })

    const res = await this.apiRequest(`/api/filemetas?${params.toString()}`, accountId)

    if (res.errno !== 0 || !res.info?.[0]) {
      throw new Error(`Failed to get download link (errno: ${res.errno})`)
    }

    const fileInfo = res.info[0]
    const dlink = fileInfo.dlink
    const fileName = fileInfo.filename || fileInfo.server_filename || path.posix.basename(fileId)
    const fileSize = fileInfo.size || 0

    if (!dlink) {
      throw new Error('No download link available')
    }

    const destPath = path.join(destDir, fileName)
    const { ndus } = this.getCredentials(accountId)

    // Follow redirects and download
    return new Promise((resolve, reject) => {
      const downloadUrl = `${dlink}&access_token=`

      const doRequest = (url: string, redirectCount = 0): void => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'))
          return
        }

        const parsed = new URL(url)
        const transport = parsed.protocol === 'https:' ? https : http

        transport
          .get(
            url,
            {
              headers: {
                Cookie: `ndus=${ndus}`,
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Referer: 'https://www.terabox.com/'
              }
            },
            (response) => {
              // Handle redirects
              if (
                response.statusCode &&
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location
              ) {
                doRequest(response.headers.location, redirectCount + 1)
                return
              }

              const writer = fs.createWriteStream(destPath)
              let downloaded = 0

              response.on('data', (chunk: Buffer) => {
                downloaded += chunk.length
                if (fileSize > 0 && onProgress) {
                  onProgress(Math.round((downloaded / fileSize) * 100))
                }
              })

              response.pipe(writer)
              writer.on('finish', () => {
                onProgress?.(100)
                resolve(destPath)
              })
              writer.on('error', reject)
              response.on('error', reject)
            }
          )
          .on('error', reject)
      }

      doRequest(downloadUrl)
    })
  }

  async deleteFile(accountId: string, fileId: string, parentFolderId?: string): Promise<void> {
    return this.deleteFiles(accountId, [fileId], parentFolderId)
  }

  async deleteFiles(accountId: string, fileIds: string[], _parentFolderId?: string): Promise<void> {
    if (!fileIds || fileIds.length === 0) return

    const { ndus } = this.getCredentials(accountId)

    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      opera: 'delete',
      async: '2'
    })

    const body = new URLSearchParams({
      filelist: JSON.stringify(fileIds)
    })

    let res = await this.apiRequest(
      `/api/filemanager?${params.toString()}`,
      accountId,
      'POST',
      body.toString(),
      'application/x-www-form-urlencoded'
    )

    if (res.errno === 4000023) {
      console.log('[Terabox Delete] Refreshing jsToken due to 4000023...')
      await this.refreshJsToken(accountId, ndus)
      res = await this.apiRequest(
        `/api/filemanager?${params.toString()}`,
        accountId,
        'POST',
        body.toString(),
        'application/x-www-form-urlencoded'
      )
    }

    if (res.errno !== 0) {
      throw new Error(`Terabox delete error (errno: ${res.errno})`)
    }
  }

  async createFolder(accountId: string, parentId: string, name: string): Promise<CloudFile> {
    // parentId is now a path directly (e.g. '/CYSEGS' or 'root')
    const parentPath = (parentId && parentId !== 'root') ? parentId : '/'
    const folderPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`

    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0'
    })

    const body = new URLSearchParams({
      path: folderPath,
      size: '0',
      isdir: '1'
    })

    const res = await this.apiRequest(
      `/api/create?${params.toString()}`,
      accountId,
      'POST',
      body.toString(),
      'application/x-www-form-urlencoded'
    )

    if (res.errno !== 0) {
      throw new Error(`Terabox create folder error (errno: ${res.errno})`)
    }

    return {
      id: folderPath, // Use path as ID for consistency
      name: res.server_filename || name,
      mimeType: 'application/vnd.google-apps.folder',
      size: 0,
      createdTime: new Date((res.server_ctime || Date.now() / 1000) * 1000).toISOString(),
      modifiedTime: new Date((res.server_mtime || Date.now() / 1000) * 1000).toISOString(),
      parentId: parentPath,
      accountId,
      provider: 'terabox',
      isFolder: true,
      shared: false,
      starred: false,
      trashed: false
    }
  }

  async renameFile(accountId: string, fileId: string, newName: string): Promise<CloudFile> {
    // fileId is now the full path (e.g. /CYSEGS/RESOURCES/file.pdf)
    const filePath = fileId
    const parentDir = path.posix.dirname(filePath)
    const newPath = parentDir === '/' ? `/${newName}` : `${parentDir}/${newName}`
    const isDir = !path.posix.extname(fileId) // rough heuristic: no extension = folder

    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      opera: 'rename',
      async: '2'
    })

    const body = new URLSearchParams({
      filelist: JSON.stringify([{ path: filePath, newname: newName }])
    })

    const res = await this.apiRequest(
      `/api/filemanager?${params.toString()}`,
      accountId,
      'POST',
      body.toString(),
      'application/x-www-form-urlencoded'
    )

    if (res.errno !== 0) {
      throw new Error(`Terabox rename error (errno: ${res.errno})`)
    }

    return {
      id: newPath, // New path after rename
      name: newName,
      mimeType: isDir ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
      size: 0,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      parentId: parentDir,
      accountId,
      provider: 'terabox',
      isFolder: isDir,
      shared: false,
      starred: false,
      trashed: false
    }
  }

  async search(accountId: string, query: string): Promise<CloudFile[]> {
    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      key: query,
      dir: '/',
      recursion: '1',
      page: '1',
      num: '100'
    })

    const res = await this.apiRequest(`/api/search?${params.toString()}`, accountId)

    if (res.errno !== 0) {
      throw new Error(`Terabox search error (errno: ${res.errno})`)
    }

    return (res.list || []).map((f: TeraboxFileInfo) => this.mapFile(f, accountId))
  }

  async getQuota(accountId: string): Promise<StorageQuota> {
    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      checkfree: '1',
      checkexpire: '1'
    })

    const res = await this.apiRequest(`/api/quota?${params.toString()}`, accountId)

    if (res.errno !== 0) {
      throw new Error(`Terabox quota error (errno: ${res.errno})`)
    }

    return {
      used: res.used || 0,
      total: res.total || 0
    }
  }

  async moveFile(accountId: string, fileId: string, newParentId: string): Promise<CloudFile> {
    // fileId and newParentId are both paths now
    const filePath = fileId
    const fileName = path.posix.basename(filePath)
    const destPath = (newParentId && newParentId !== 'root') ? newParentId : '/'
    const newFilePath = destPath === '/' ? `/${fileName}` : `${destPath}/${fileName}`

    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      opera: 'move',
      async: '2'
    })

    const body = new URLSearchParams({
      filelist: JSON.stringify([{ path: filePath, dest: destPath, newname: fileName }])
    })

    const res = await this.apiRequest(
      `/api/filemanager?${params.toString()}`,
      accountId,
      'POST',
      body.toString(),
      'application/x-www-form-urlencoded'
    )

    if (res.errno !== 0) {
      throw new Error(`Terabox move error (errno: ${res.errno})`)
    }

    return {
      id: newFilePath,
      name: fileName,
      mimeType: 'application/octet-stream',
      size: 0,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      parentId: destPath,
      accountId,
      provider: 'terabox',
      isFolder: false,
      shared: false,
      starred: false,
      trashed: false
    }
  }

  // --- Unsupported features (best-effort stubs) ---

  async listTrash(accountId: string): Promise<CloudFile[]> {
    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      page: '1',
      num: '100'
    })

    const res = await this.apiRequest(`/api/recycle/list?${params.toString()}`, accountId)
    console.log('Terabox listTrash res:', JSON.stringify(res).substring(0, 500))

    if (res.errno !== 0) {
      throw new Error(`Terabox list trash error (errno: ${res.errno})`)
    }

    return (res.list || []).map((f: TeraboxFileInfo) => {
      const mapped = this.mapFile(f, accountId)
      mapped.trashed = true
      mapped.id = String(f.fs_id) // Use fs_id as ID for restore operations
      return mapped
    })
  }

  async listStarred(_accountId: string): Promise<CloudFile[]> {
    return []
  }

  async restoreFile(accountId: string, fileId: string): Promise<void> {
    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0'
    })

    const body = new URLSearchParams({
      fidlist: JSON.stringify([parseInt(fileId, 10)])
    })

    const res = await this.apiRequest(
      `/api/recycle/restore?${params.toString()}`,
      accountId,
      'POST',
      body.toString(),
      'application/x-www-form-urlencoded'
    )

    if (res.errno !== 0) {
      throw new Error(`Terabox restore error (errno: ${res.errno})`)
    }
  }

  async permanentlyDelete(accountId: string, fileId: string): Promise<void> {
    // If fileId is not a number (e.g. it's a path like /folder/file), it means
    // it was called on a non-trashed file, so we fallback to regular delete.
    if (isNaN(Number(fileId))) {
      await this.deleteFile(accountId, fileId)
      return
    }

    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0'
    })

    const body = new URLSearchParams({
      fidlist: JSON.stringify([parseInt(fileId, 10)])
    })

    const res = await this.apiRequest(
      `/api/recycle/delete?${params.toString()}`,
      accountId,
      'POST',
      body.toString(),
      'application/x-www-form-urlencoded'
    )

    if (res.errno !== 0) {
      throw new Error(`Terabox permanently delete error (errno: ${res.errno})`)
    }
  }

  async toggleStar(_accountId: string, _fileId: string, _starred: boolean): Promise<void> {
    throw new Error('Starred files feature is not supported for Terabox')
  }
}

export const teraboxService = new TeraboxService()
