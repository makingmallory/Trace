import { useEffect, useState } from 'react'
import { InlineBackHeader } from '../../components/InlineBackHeader.tsx'
import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { presentSyncConflict, type ConflictPresentation } from '../../data/sync/SyncConflictPresentation.ts'
import type { SyncConflictResolution } from '../../data/sync/SyncConflicts.ts'
import { syncConnectionStorage, serviceForConnection } from '../../data/sync/syncRuntime.ts'
import type { SyncConflictSnapshot } from '../../domain/models/index.ts'

interface PresentedConflict {
  conflict: SyncConflictSnapshot
  presentation: ConflictPresentation
}

export function SyncConflictsScreen() {
  const [items, setItems] = useState<PresentedConflict[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ id: string; resolution: SyncConflictResolution } | null>(null)
  const [message, setMessage] = useState('')

  async function load() {
    const connection = syncConnectionStorage.load()
    if (!connection) { setItems([]); setLoading(false); return }
    const repository = new IndexedDbDataRepository()
    const versions = await repository.getAll('trackableVersions')
    const names = new Map(versions.map((version) => [`${version.trackableId}:${version.version}`, version.name]))
    const conflicts = await serviceForConnection(connection).conflictSnapshots()
    setItems(conflicts.map((conflict) => ({ conflict, presentation: presentSyncConflict(conflict, names) })))
    setLoading(false)
  }

  useEffect(() => { void load().catch((error) => { setLoading(false); setMessage(error instanceof Error ? error.message : 'Could not load sync conflicts.') }) }, [])

  async function resolve(conflict: SyncConflictSnapshot, resolution: SyncConflictResolution) {
    const connection = syncConnectionStorage.load()
    if (!connection) { setMessage('Reconnect your backup before resolving this conflict.'); return }
    setBusyId(conflict.id); setMessage('')
    try {
      await serviceForConnection(connection).resolveConflict(conflict.id, resolution)
      setConfirming(null)
      await load()
      setMessage(resolution === 'keep-local' ? 'Local version kept. It will upload through the normal sync flow.' : 'Synced version kept on this device.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resolve this conflict. Both versions are still preserved.')
    } finally { setBusyId(null) }
  }

  return <section className="screen sync-conflicts-screen">
    <header className="trace-page-header subpage-header"><InlineBackHeader to="/settings" label="Sync settings" /><h1>Sync Conflicts</h1><p className="screen__description">Review records changed differently on this device and in your synced backup. Trace keeps both versions until you choose.</p></header>
    {message ? <p className="sync-message" role="status">{message}</p> : null}
    {loading ? <p>Loading conflicts…</p> : items.length === 0 ? <div className="placeholder-card"><span aria-hidden="true">✓</span><p>No sync conflicts need attention.</p></div> : <div className="sync-conflict-list">{items.map(({ conflict, presentation }) => <article className="sync-conflict-card" key={conflict.id}>
      <div className="sync-conflict-card__heading"><div><p className="developer-card__label">{conflict.kind === 'delete-vs-edit' ? 'Delete vs edit' : conflict.kind === 'identity-collision' ? 'Identity conflict' : 'Different changes'}</p><h2>{presentation.title}</h2><p>{presentation.context}</p></div></div>
      <p className="sync-conflict-card__explanation">{presentation.explanation}</p>
      <div className="sync-conflict-versions"><section><h3>On this device</h3><p>{presentation.localLabel}</p>{conflict.local.deletedAt ? <small>Deleted locally</small> : null}</section><section><h3>Synced copy</h3><p>{presentation.syncedLabel}</p>{conflict.remote.deletedAt ? <small>Deleted in backup</small> : null}</section></div>
      <div className="sync-conflict-actions"><button className="primary-button" type="button" disabled={busyId === conflict.id} onClick={() => setConfirming({ id: conflict.id, resolution: 'keep-local' })}>Keep Local</button><button className="secondary-button" type="button" disabled={busyId === conflict.id} onClick={() => setConfirming({ id: conflict.id, resolution: 'keep-synced' })}>Keep Synced</button></div>
      {confirming?.id === conflict.id ? <div className="sync-conflict-confirm" role="group" aria-label="Confirm conflict resolution"><p>{confirming.resolution === 'keep-local' ? 'The version on this device will replace the synced copy during normal sync.' : 'The synced copy will replace the version currently on this device.'}</p><div><button className="primary-button" type="button" disabled={busyId === conflict.id} onClick={() => void resolve(conflict, confirming.resolution)}>Confirm</button><button className="secondary-button" type="button" disabled={busyId === conflict.id} onClick={() => setConfirming(null)}>Cancel</button></div></div> : null}
    </article>)}</div>}
  </section>
}
