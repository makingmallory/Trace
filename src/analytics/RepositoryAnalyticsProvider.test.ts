import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../data/local/InMemoryDataRepository.ts'
import { syncedCollections } from '../data/sync/SyncProtocol.ts'
import type { Observation, RoutineItem, Trackable, TrackableOption, TrackableVersion } from '../domain/models/index.ts'
import { analysisMappingId } from './analysisMappings.ts'
import { RepositoryAnalyticsProvider } from './RepositoryAnalyticsProvider.ts'

const timestamp = '2026-08-10T12:00:00.000Z'
const sync = { createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }

describe('RepositoryAnalyticsProvider mappings', () => {
  it('includes routine eligibility metadata for Insights without altering source collections', async () => {
    const repository = new InMemoryDataRepository()
    const item: RoutineItem = { ...sync, id: 'routine-item', routineId: 'daily', target: { kind: 'trackable', trackableId: 'energy' }, sortOrder: 0, enabled: true, frequency: 'every_day', completionBehavior: 'expected', trendTrackingMode: 'none', eventReminderBehavior: 'never' }
    await repository.save('routineItems', item)
    const provider = new RepositoryAnalyticsProvider(repository)
    expect((await provider.loadTrendsData()).routineItems).toEqual([item])
    expect(await repository.getById('routineItems', item.id)).toEqual(item)
  })
  it('persists mappings locally without changing observations or entering sync collections', async () => {
    const repository = new InMemoryDataRepository()
    const trackable: Trackable = { ...sync, id: 'volume', categoryId: 'category', active: true, archivedAt: null, currentVersion: 2, tags: [], dataRole: 'measurement' }
    const versions: readonly TrackableVersion[] = [
      { ...sync, id: 'volume:v1', trackableId: 'volume', version: 1, name: 'Volume old', inputType: 'scale', scaleMin: 1, scaleMax: 5, valueDirection: 'neutral', configuration: {}, retiredAt: timestamp },
      { ...sync, id: 'volume:v2', trackableId: 'volume', version: 2, name: 'Volume', inputType: 'single_choice', valueDirection: 'neutral', configuration: {}, retiredAt: null },
    ]
    const target: TrackableOption = { ...sync, id: 'volume:v2:low', trackableId: 'volume', trackableVersion: 2, optionId: 'low', storedValue: 'low', label: 'Low', sortOrder: 0, active: true }
    const observation: Observation = { ...sync, id: 'answer', logRecordId: 'record', trackableId: 'volume', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'scale', value: 1 } } }
    await repository.save('trackables', trackable)
    await repository.saveMany('trackableVersions', versions)
    await repository.save('trackableOptions', target)
    await repository.save('observations', observation)
    const provider = new RepositoryAnalyticsProvider(repository)
    await provider.saveAnalysisMapping({ trackableId: 'volume', sourceTrackableVersion: 1, targetTrackableVersion: 2, targetMeasurementType: 'nominal-single', valueMappings: [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'Low' }] })

    expect(await repository.getById('analysisMappings', analysisMappingId('volume', 1, 2))).toMatchObject({ trackableId: 'volume', sourceTrackableVersion: 1 })
    expect(await repository.getById('observations', observation.id)).toEqual(observation)
    expect(syncedCollections).not.toContain('analysisMappings')
  })

  it('soft-removes a mapping so analysis returns immediately to raw version-aware behavior', async () => {
    const repository = new InMemoryDataRepository()
    const provider = new RepositoryAnalyticsProvider(repository)
    const id = analysisMappingId('volume', 1, 2)
    await repository.save('analysisMappings', { ...sync, id, trackableId: 'volume', sourceTrackableVersion: 1, targetTrackableVersion: 2, targetMeasurementType: 'nominal-single', valueMappings: [] })
    await provider.removeAnalysisMapping(id)
    expect((await repository.getById('analysisMappings', id))?.deletedAt).not.toBeNull()
  })
})
