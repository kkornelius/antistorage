import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { join } from 'path'

async function run() {
  const store = JSON.parse(readFileSync('C:/Users/Desktop/.gemini/antigravity-ide/token-store.json', 'utf8'))
  const account = store.accounts.find(a => a.provider === 'gdrive')
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials(account.credentials)
  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  
  const res = await drive.files.list({
    q: 'trashed = true',
    fields: 'files(id, name, explicitlyTrashed, trashed)'
  }).catch(e => console.error(e))
  
  if (res && res.data) {
    console.log(res.data.files)
  }
}
run()
