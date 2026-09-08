import { useEffect, useState } from 'react'
import { InlineBackHeader } from '../../components/InlineBackHeader.tsx'
import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { buildConflictPresentationContext, presentSyncConflict, type ConflictPresentation } from '../../data/sync/SyncConflictPresentation.ts'
import type { SyncConflictResolution } from '../../data/sync/SyncConflicts.ts'
import { serializeEntity, type SyncRecord } from '../../data/sync/SyncProtocol.ts'
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
    const conflicts = await serviceForConnection(connection).conflictSnapshots()
    const [categories, trackables, versions, options, fields, routines, eventDefinitions, logRecords, observations, selections] = await Promise.all([
      repository.getAll('categories'), repository.getAll('trackables'), repository.getAll('trackableVersions'), repository.getAll('trackableOptions'), repository.getAll('trackableFields'), repository.getAll('routines'), repository.getAll('eventDefinitions'), repository.getAll('logRecords'), repository.getAll('observations'), repository.getAll('observationSelections'),
    ])
    const referenceRecords: SyncRecord[] = [
      ...categories.map((entity) => serializeEntity('categories', entity)),
      ...trackables.map((entity) => serializeEntity('trackables', entity)),
      ...versions.map((entity) => serializeEntity('trackableVersions', entity)),
      ...options.map((entity) => serializeEntity('trackableOptions', entity)),
      ...fields.map((entity) => serializeEntity('trackableFields', entity)),
      ...routines.map((entity) => serializeEntity('routines', entity)),
      ...eventDefinitions.map((entity) => serializeEntity('eventDefinitions', entity)),
      ...logRecords.map((entity) => serializeEntity('logRecords', entity)),
      ...observations.map((entity) => serializeEntity('observations', entity)),
      ...selections.map((entity) => serializeEntity('observationSelections', entity)),
    ]
    const context = buildConflictPresentationContext(referenceRecords, conflicts)
    setItems(conflicts.map((conflict) => ({ conflict, presentation: presentSyncConflict(conflict, context) })))
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
      {presentation.locations ? <div className="sync-conflict-locations"><p><strong>On this device:</strong> {presentation.locations.local}</p><p><strong>Synced:</strong> {presentation.locations.synced}</p></div> : null}
      <p className="sync-conflict-card__explanation">{presentation.explanation}</p>
      <div className="sync-conflict-differences" aria-label="Different fields"><div className="sync-conflict-differences__header"><span>What differs</span><span>On this device</span><span>Synced copy</span></div>{presentation.differences.map((difference) => <div className="sync-conflict-difference" key={difference.field}><h3>{difference.field}</h3><p>{difference.local}</p><p>{difference.synced}</p></div>)}</div>
      <p className="sync-conflict-choice-help">Keep Local preserves the on-device values shown above. Keep Synced preserves the synced values.</p>
      <div className="sync-conflict-actions"><button className="primary-button" type="button" disabled={busyId === conflict.id} onClick={() => setConfirming({ id: conflict.id, resolution: 'keep-local' })}>Keep Local</button><button className="secondary-button" type="button" disabled={busyId === conflict.id} onClick={() => setConfirming({ id: conflict.id, resolution: 'keep-synced' })}>Keep Synced</button></div>
      {confirming?.id === conflict.id ? <div className="sync-conflict-confirm" role="group" aria-label="Confirm conflict resolution"><p>{confirming.resolution === 'keep-local' ? 'The version on this device will replace the synced copy during normal sync.' : 'The synced copy will replace the version currently on this device.'}</p><div><button className="primary-button" type="button" disabled={busyId === conflict.id} onClick={() => void resolve(conflict, confirming.resolution)}>Confirm</button><button className="secondary-button" type="button" disabled={busyId === conflict.id} onClick={() => setConfirming(null)}>Cancel</button></div></div> : null}
    </article>)}</div>}
  </section>
}
