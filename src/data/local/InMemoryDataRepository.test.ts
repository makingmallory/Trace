import { describe, expect, it } from 'vitest'
import type {
  EventDailyAssertion,
  LogRecord,
  RecordRelationship,
  Trackable,
  TrackableVersion,
} from '../../domain/models/index.ts'
import { InMemoryDataRepository } from './InMemoryDataRepository.ts'

const timestamp = '2026-08-10T12:00:00.000Z'

const syncFields = {
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
  revision: 1,
} as const

function makeRecord(id: string): LogRecord {
  return {
    id,
    ...syncFields,
    recordKind: 'event',
    eventDefinitionId: `definition-${id}`,
    localDate: '2026-08-10',
    timePrecision: 'day',
    startTime: null,
    endTime: null,
    timezone: 'America/Chicago',
    status: 'completed',
    source: 'app',
  }
}

describe('InMemoryDataRepository', () => {
  it('stores an explicit event absence independently from event records', async () => {
    const repository = new InMemoryDataRepository()
    const assertion: EventDailyAssertion = {
      id: 'assertion-1',
      ...syncFields,
      date: '2026-08-10',
      eventDefinitionId: 'event-definition-1',
      status: 'did_not_occur',
      sourceRoutineId: 'routine-1',
      recordedAt: timestamp,
    }

    await repository.save('eventDailyAssertions', assertion)

    expect(await repository.getAll('logRecords')).toEqual([])
    expect(await repository.getAll('eventDailyAssertions')).toEqual([assertion])
  })

  it('keeps Trackable identity separate from semantic versions', async () => {
    const repository = new InMemoryDataRepository()
    const trackable: Trackable = {
      id: 'trackable-1',
      ...syncFields,
      categoryId: 'category-1',
      active: true,
      archivedAt: null,
      currentVersion: 2,
      tags: [],
      dataRole: 'measurement',
    }
    const versions: readonly TrackableVersion[] = [
      {
        id: 'trackable-1:1',
        ...syncFields,
        trackableId: trackable.id,
        version: 1,
        name: 'Example measurement',
        inputType: 'scale',
        scaleMin: 1,
        scaleMax: 5,
        valueDirection: 'neutral',
        configuration: {},
        retiredAt: timestamp,
      },
      {
        id: 'trackable-1:2',
        ...syncFields,
        trackableId: trackable.id,
        version: 2,
        name: 'Example measurement',
        inputType: 'scale',
        scaleMin: 1,
        scaleMax: 10,
        valueDirection: 'neutral',
        configuration: {},
        retiredAt: null,
      },
    ]

    await repository.save('trackables', trackable)
    await repository.saveMany('trackableVersions', versions)

    expect((await repository.getById('trackables', trackable.id))?.currentVersion).toBe(2)
    expect(await repository.getAll('trackableVersions')).toHaveLength(2)
  })

  it('links arbitrary records through a generic relationship', async () => {
    const repository = new InMemoryDataRepository()
    const source = makeRecord('record-source')
    const target = makeRecord('record-target')
    const relationship: RecordRelationship = {
      id: 'relationship-1',
      ...syncFields,
      sourceRecordId: source.id,
      targetRecordId: target.id,
      relationshipType: 'associated_with',
      provenance: 'manual',
      confirmedByUser: true,
      metadata: {},
    }

    await repository.saveMany('logRecords', [source, target])
    await repository.save('relationships', relationship)

    const saved = await repository.getById('relationships', relationship.id)
    expect(saved?.sourceRecordId).toBe(source.id)
    expect(saved?.targetRecordId).toBe(target.id)
  })
})
