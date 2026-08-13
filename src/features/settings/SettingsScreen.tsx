import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder.tsx'
import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { createTraceBackup, downloadTraceBackup, restoreTraceBackup } from '../../data/sync/BackupExport.ts'
import { GoogleSheetsAppsScriptSyncProvider } from '../../data/sync/google/GoogleSheetsAppsScriptSyncProvider.ts'
import type { SyncConnection } from '../../data/sync/SyncConnectionStore.ts'
import { SYNC_METADATA_ID } from '../../data/sync/SyncService.ts'
import { serviceForConnection, syncConnectionStorage } from '../../data/sync/syncRuntime.ts'
import { shareTextFile } from '../../platform/nativeFiles.ts'

type SetupMode = 'new' | 'existing' | null
type RunState = 'idle' | 'connecting' | 'syncing' | 'success' | 'error'

function formatLastSync(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not synced yet'
}

export function SettingsScreen() {
  const [connection, setConnection] = useState<SyncConnection | null>(() => syncConnectionStorage.load())
  const [setupMode, setSetupMode] = useState<SetupMode>(null)
  const [endpointUrl, setEndpointUrl] = useState('')
  const [state, setState] = useState<RunState>('idle')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)

  async function refreshStatus(active = connection) {
    if (!active) { setLastSync(null); setPending(0); return }
    const service = serviceForConnection(active)
    const metadata = await service.metadata()
    setLastSync(metadata.lastSuccessfulSyncAt)
    setPending(await service.countPending())
    if (metadata.lastError) setMessage(metadata.lastError)
  }

  useEffect(() => { void refreshStatus() }, [connection])
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline) }
  }, [])

  async function connect(event: React.FormEvent) {
    event.preventDefault()
    setState('connecting'); setMessage('')
    try {
      const provider = new GoogleSheetsAppsScriptSyncProvider({ endpointUrl })
      const health = await provider.healthCheck()
      if (!health.available) throw new Error(health.message ?? 'Trace could not validate this backup.')
      const next: SyncConnection = { providerId: 'google-sheets-apps-script', endpointUrl: endpointUrl.trim(), sheetName: health.sheetName ?? 'Google Sheet', ...(health.sheetId ? { sheetId: health.sheetId } : {}), connectedAt: new Date().toISOString() }
      if (connection?.endpointUrl !== next.endpointUrl) {
        const repository = new IndexedDbDataRepository()
        const metadata = await repository.getById('syncMetadata', SYNC_METADATA_ID)
        if (metadata) await repository.save('syncMetadata', { ...metadata, remoteCheckpoint: 0, recordStates: {}, pendingChangeCount: await serviceForConnection(connection ?? next).countLocalRecords(), lastError: null })
      }
      syncConnectionStorage.save(next)
      setConnection(next)
      const result = await serviceForConnection(next).sync()
      setSetupMode(null); setEndpointUrl(''); setState('success')
      setMessage(result.conflicts.length ? `${result.conflicts.length} record conflict${result.conflicts.length === 1 ? '' : 's'} preserved for review.` : `Backup connected. ${result.pulled} pulled and ${result.pushed} uploaded.`)
      await refreshStatus(next)
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'Could not connect this backup.') }
  }

  async function syncNow() {
    if (!connection || !online) { setState('error'); setMessage('You are offline. Your changes are safe and will sync later.'); return }
    setState('syncing'); setMessage('')
    try {
      const result = await serviceForConnection(connection).sync()
      setState(result.conflicts.length ? 'error' : 'success')
      setMessage(result.conflicts.length ? `${result.conflicts.length} record conflict${result.conflicts.length === 1 ? '' : 's'} preserved; neither copy was overwritten.` : `Synced ${result.pulled + result.pushed} change${result.pulled + result.pushed === 1 ? '' : 's'}.`)
      await refreshStatus(connection)
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'Sync did not finish. Your local data is safe.') }
  }

  function disconnect() {
    syncConnectionStorage.clear(); setConnection(null); setSetupMode(null); setState('idle'); setMessage('Google Sheets backup disconnected. Your local data is unchanged.')
  }

  async function exportBackup() {
    try {
      const backup = await createTraceBackup(new IndexedDbDataRepository())
      const fileName = `trace-backup-${backup.createdAt.slice(0, 10)}.json`
      const shared = await shareTextFile(fileName, JSON.stringify(backup, null, 2))
      if (!shared) downloadTraceBackup(backup)
      setState('success'); setMessage(`Exported ${backup.records.length} records as a full-fidelity JSON backup.`)
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? `Could not share the backup: ${error.message}` : 'Could not share the backup. Your local data is unchanged.')
    }
  }

  async function importBackup(file: File) {
    try {
      const count = await restoreTraceBackup(new IndexedDbDataRepository(), JSON.parse(await file.text()))
      setState('success'); setMessage(`Restored and upgraded ${count} backup records. Reload Trace to review them.`)
    } catch (error) {
      setState('error'); setMessage(error instanceof Error ? error.message : 'Could not restore this backup. Your existing data is unchanged.')
    }
  }

  return (
    <ScreenPlaceholder eyebrow="Preferences" title="Settings" description="Manage tracking, backups, and how Trace works for you."><div className="settings-stack">
      <section className="sync-card" aria-labelledby="google-backup-heading">
        <div className="sync-card__heading"><span className="emoji-icon" aria-hidden="true">☁️</span><div><p className="developer-card__label">Data &amp; Backup</p><h2 id="google-backup-heading">Google Sheets Backup</h2><p>Keep an accessible copy of your Trace data in your own Google Sheet.</p></div></div>
        {!connection ? (
          <>
            <div className="sync-status-row"><span className="sync-status-dot" /> <strong>Not connected</strong><span>Trace still works fully offline.</span></div>
            <div className="sync-actions"><button className="primary-button" type="button" onClick={() => setSetupMode('new')}>Set Up Backup</button><button className="secondary-button" type="button" onClick={() => setSetupMode('existing')}>Connect Existing Backup</button></div>
          </>
        ) : (
          <>
            <div className="sync-status-row"><span className={`sync-status-dot sync-status-dot--${online ? 'connected' : 'offline'}`} /> <strong>{online ? (state === 'syncing' ? 'Syncing' : pending ? 'Changes waiting' : state === 'error' ? 'Error' : 'Synced') : 'Offline'}</strong><span>{connection.sheetName}</span></div>
            <dl className="sync-details"><div><dt>Last successful sync</dt><dd>{formatLastSync(lastSync)}</dd></div><div><dt>Waiting to sync</dt><dd>{pending} change{pending === 1 ? '' : 's'}</dd></div></dl>
            <div className="sync-actions"><button className="primary-button" type="button" disabled={state === 'syncing'} onClick={() => void syncNow()}>{state === 'syncing' ? 'Syncing…' : 'Sync Now'}</button>{connection.sheetId ? <a className="secondary-button" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(connection.sheetId)}/edit`} target="_blank" rel="noreferrer">Open Backup</a> : null}</div>
            <details className="sync-manage"><summary>Manage Backup</summary><div><button className="text-button" type="button" onClick={() => { setSetupMode('existing'); setEndpointUrl(connection.endpointUrl) }}>Reconnect or Change Backup</button><button className="text-button" type="button" onClick={() => { setSetupMode('new'); setEndpointUrl('') }}>Use a Replacement Sheet</button><button className="text-button" type="button" onClick={disconnect}>Disconnect</button></div></details>
          </>
        )}
        {setupMode ? <form className="sync-setup" onSubmit={(event) => void connect(event)}><h3>{setupMode === 'new' ? 'Set Up Your Backup' : 'Connect an Existing Backup'}</h3><p>{setupMode === 'new' ? <>Create a Sheet, add Trace’s Apps Script, deploy it, then paste the connection URL here. The repository guide is <code>docs/google-sync-setup.md</code>.</> : 'Use the connection URL from the Apps Script attached to your existing Trace Sheet. Trace validates and safely merges both copies.'}</p><label htmlFor="sync-url">Apps Script connection URL</label><input id="sync-url" type="url" required value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoComplete="off" spellCheck={false} /><small>This stays on this device and is never built into Trace.</small><div className="sync-actions"><button className="primary-button" type="submit" disabled={state === 'connecting'}>{state === 'connecting' ? 'Validating…' : setupMode === 'new' ? 'Connect Backup' : 'Validate and Merge'}</button><button className="secondary-button" type="button" onClick={() => setSetupMode(null)}>Cancel</button></div></form> : null}
        {message ? <p className={`sync-message sync-message--${state}`} role="status">{message}</p> : null}
      </section>
      <div className="developer-card"><div><p className="developer-card__label">Portable Backup</p><h2>Export Trace Data</h2><p>Download a full-fidelity JSON snapshot. This does not change your ongoing Google Sheets connection.</p></div><button className="button-link" type="button" onClick={() => void exportBackup()}>Export JSON Backup</button></div>
      <div className="developer-card"><div><p className="developer-card__label">Portable Backup</p><h2>Restore Trace Data</h2><p>Restore a current backup or safely upgrade a pre-unification backup.</p></div><label className="button-link">Import JSON Backup<input className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file) }} /></label></div>
      <div className="developer-card"><div><p className="developer-card__label">Tracking</p><h2>Trackables</h2><p>Manage Daily Value and Occurrence Trackables in one place.</p></div><Link className="button-link" to="/trackables/manage">Manage Trackables</Link></div>
      <div className="developer-card"><div><p className="developer-card__label">Tracking</p><h2>Nightly Check-In</h2><p>Choose, order, and configure the questions in your daily routine.</p></div><Link className="button-link" to="/settings/nightly-check-in">Configure Routine</Link></div>
      </div>
    </ScreenPlaceholder>
  )
}
