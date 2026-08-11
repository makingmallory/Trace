import { describe, expect, it } from 'vitest'
import type { Category } from '../../domain/models/index.ts'
import { InMemoryDataRepository } from '../local/InMemoryDataRepository.ts'
import type { PullResult, PushResult, SyncProvider, SyncProviderHealth } from './SyncProvider.ts'
import { fingerprint, type SyncRecord } from './SyncProtocol.ts'
import { SyncService } from './SyncService.ts'

function category(revision = 1, name = 'Original', deletedAt: string | null = null): Category {
  return { id: 'category-1', name, sortOrder: 0, active: true, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: `2026-08-${9 + revision}T00:00:00.000Z`, deletedAt, revision }
}

class MemoryProvider implements SyncProvider {
  readonly providerId = 'memory'
  readonly records = new Map<string, SyncRecord>()
  checkpoint = 0
  pushCalls = 0
  offline = false
  malformed: SyncRecord | null = null

  async healthCheck(): Promise<SyncProviderHealth> { return this.offline ? { available: false, message: 'Offline' } : { available: true } }
  async pullChanges(after: number): Promise<PullResult> {
    if (this.malformed) return { checkpoint: this.checkpoint, records: [this.malformed] }
    return { checkpoint: this.checkpoint, records: [...this.records.values()].filter((record) => record.remoteRevision! > after) }
  }
  async pushBatch(records: readonly SyncRecord[]): Promise<PushResult> {
    this.pushCalls += 1
    const accepted: SyncRecord[] = []
    const conflicts: { local: SyncRecord; remote: SyncRecord }[] = []
    for (const input of records) {
      const key = `${input.entityType}:${input.id}`
      const existing = this.records.get(key)
      if (existing && fingerprint(existing) === fingerprint(input)) { accepted.push(existing); continue }
      if (existing && existing.remoteRevision! > input.baseRemoteRevision) { conflicts.push({ local: input, remote: existing }); continue }
      this.checkpoint += 1
      const stored = { ...structuredClone(input), remoteRevision: this.checkpoint }
      this.records.set(key, stored); accepted.push(stored)
    }
    return { checkpoint: this.checkpoint, accepted, conflicts }
  }
}

describe('SyncService production reconciliation', () => {
  it('pushes local-only data in batches and repeated sync is idempotent', async () => {
    const repository = new InMemoryDataRepository(); const provider = new MemoryProvider()
    await repository.saveMany('categories', [category(), { ...category(), id: 'category-2' }, { ...category(), id: 'category-3' }])
    const service = new SyncService(repository, provider, () => new Date('2026-08-11T12:00:00.000Z'), 2)
    expect((await service.sync()).pushed).toBe(3)
    expect(provider.pushCalls).toBe(2)
    expect((await service.sync()).pushed).toBe(0)
    expect(provider.records.size).toBe(3)
  })

  it('pulls remote-only records onto an empty device and preserves historical references', async () => {
    const source = new InMemoryDataRepository(); const provider = new MemoryProvider()
    await source.save('categories', category())
    await source.save('trackableVersions', { id: 'version-1', trackableId: 'track-1', version: 1, name: 'Old meaning', inputType: 'scale', valueDirection: 'neutral', configuration: {}, retiredAt: '2026-08-11T00:00:00.000Z', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z', deletedAt: null, revision: 2 })
    await source.save('observations', { id: 'observation-1', logRecordId: 'record-1', trackableId: 'track-1', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'scale', value: 0 } }, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, revision: 1 })
    await new SyncService(source, provider).sync()
    const target = new InMemoryDataRepository(); const result = await new SyncService(target, provider).sync()
    expect(result.pulled).toBe(3)
    expect((await target.getById('observations', 'observation-1'))?.trackableVersion).toBe(1)
    expect((await target.getById('trackableVersions', 'version-1'))?.name).toBe('Old meaning')
  })

  it('applies a remote-only newer revision while pushing a local-only newer revision', async () => {
    const provider = new MemoryProvider(); const first = new InMemoryDataRepository(); const second = new InMemoryDataRepository()
    await first.save('categories', category()); await new SyncService(first, provider).sync(); await new SyncService(second, provider).sync()
    await first.save('categories', category(2, 'Remote newer')); await new SyncService(first, provider).sync()
    await new SyncService(second, provider).sync()
    expect((await second.getById('categories', 'category-1'))?.name).toBe('Remote newer')
    await second.save('categories', category(3, 'Local newer')); await new SyncService(second, provider).sync()
    expect(provider.records.get('categories:category-1')?.payload.name).toBe('Local newer')
  })

  it('surfaces concurrent edits and preserves both local and remote copies', async () => {
    const provider = new MemoryProvider(); const first = new InMemoryDataRepository(); const second = new InMemoryDataRepository()
    await first.save('categories', category()); await new SyncService(first, provider).sync(); await new SyncService(second, provider).sync()
    await first.save('categories', category(2, 'Phone edit')); await second.save('categories', category(2, 'Web edit'))
    await new SyncService(first, provider).sync()
    const result = await new SyncService(second, provider).sync()
    expect(result.conflicts).toHaveLength(1)
    expect((await second.getById('categories', 'category-1'))?.name).toBe('Web edit')
    expect(provider.records.get('categories:category-1')?.payload.name).toBe('Phone edit')
  })

  it('propagates a tombstone and restoration of the same stable ID', async () => {
    const provider = new MemoryProvider(); const first = new InMemoryDataRepository(); const second = new InMemoryDataRepository()
    await first.save('categories', category()); await new SyncService(first, provider).sync(); await new SyncService(second, provider).sync()
    const deletedAt = '2026-08-12T00:00:00.000Z'
    await first.save('categories', category(2, 'Original', deletedAt)); await new SyncService(first, provider).sync(); await new SyncService(second, provider).sync()
    expect((await second.getById('categories', 'category-1'))?.deletedAt).toBe(deletedAt)
    await first.save('categories', category(3, 'Original', null)); await new SyncService(first, provider).sync(); await new SyncService(second, provider).sync()
    expect((await second.getById('categories', 'category-1'))?.deletedAt).toBeNull()
    expect(provider.records.size).toBe(1)
  })

  it('keeps offline changes local and syncs them when the provider returns', async () => {
    const repository = new InMemoryDataRepository(); const provider = new MemoryProvider(); const service = new SyncService(repository, provider)
    await repository.save('categories', category()); provider.offline = true
    await expect(service.sync()).rejects.toThrow('Offline')
    expect(await service.countPending()).toBe(1)
    provider.offline = false
    expect((await service.sync()).pushed).toBe(1)
  })

  it('merges existing local and remote datasets without replacing either', async () => {
    const provider = new MemoryProvider(); const remote = new InMemoryDataRepository(); const local = new InMemoryDataRepository()
    await remote.save('categories', category()); await new SyncService(remote, provider).sync()
    await local.save('categories', { ...category(), id: 'local-only', name: 'Local only' })
    const result = await new SyncService(local, provider).sync()
    expect(result.pulled).toBe(1); expect(result.pushed).toBe(1)
    expect((await local.getAll('categories')).map((item) => item.id).sort()).toEqual(['category-1', 'local-only'])
  })
})
