import { useAccountStore } from '../../stores/accountStore'
import { useFileStore } from '../../stores/fileStore'

export function StatusBar(): JSX.Element {
  const { accounts, activeAccountId } = useAccountStore()
  const { files } = useFileStore()

  const activeAccount = accounts.find((a) => a.id === activeAccountId)
  const folderCount = files.filter((f) => f.isFolder).length
  const fileCount = files.filter((f) => !f.isFolder).length

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        {activeAccount && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="status-dot" />
              {activeAccount.email}
            </span>
            <span>
              {folderCount} folder{folderCount !== 1 ? 's' : ''}, {fileCount} file
              {fileCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {!activeAccount && <span>No account connected</span>}
      </div>
      <div className="statusbar-right">
        <span>{accounts.length} account{accounts.length !== 1 ? 's' : ''} connected</span>
      </div>
    </footer>
  )
}
