import { describe, expect, it } from 'vitest'
import type { Category, LogRecord, Observation, SyncConflictSnapshot, Trackable, TrackableField, TrackableOption, TrackableVersion } from '../../domain/models/index.ts'
import { buildConflictPresentationContext, presentSyncConflict } from './SyncConflictPresentation.ts'
import { serializeEntity, type SyncRecord } from './SyncProtocol.ts'

const stamp = '2026-08-10T00:00:00.000Z'
const base = { createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 }

function category(id: string, name: string): Category {
  return { ...base, id, name, sortOrder: 0, active: true }
}

function trackable(id: string, categoryId = 'general'): Trackable {
  return { ...base, id, categoryId, active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'symptom', recordSemantics: 'daily_value', quickLogEnabled: false }
}

function version(trackableId: string, name: string, inputType: TrackableVersion['inputType'] = 'boolean'): TrackableVersion {
  return { ...base, id: `${trackableId}:v1`, trackableId, version: 1, name, inputType, valueDirection: 'neutral', configuration: {}, retiredAt: null }
}

function field(overrides: Partial<TrackableField> = {}): TrackableField {
  return { ...base, id: 'migraine:severity', ownerTrackableId: 'migraine', ownerTrackableVersion: 1, fieldTrackableId: 'severity', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, completionBehavior: 'expected', required: true, ...overrides }
}

function option(label: string, sortOrder: number, overrides: Partial<TrackableOption> = {}): TrackableOption {
  return { ...base, id: 'moderate:v1', optionId: 'moderate', trackableId: 'severity', trackableVersion: 1, storedValue: label.toLowerCase(), label, sortOrder, active: true, ...overrides }
}

function checkIn(id: string, localDate: string): LogRecord {
  return { ...base, id, recordKind: 'routine', routineId: 'daily', localDate, startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app' }
}

function observation(overrides: Partial<Observation> = {}): Observation {
  return { ...base, id: 'answer', logRecordId: 'check-in-13', trackableId: 'acne', trackableVersion: 1, answer: { state: 'unanswered' }, ...overrides }
}

function references(): SyncRecord[] {
  return [
    serializeEntity('categories', category('general', 'General Health')),
    serializeEntity('categories', category('pain', 'Pain')),
    serializeEntity('trackables', trackable('migraine')),
    serializeEntity('trackables', trackable('severity')),
    serializeEntity('trackableVersions', version('migraine', 'Migraine')),
    serializeEntity('trackableVersions', version('severity', 'Severity', 'scale')),
    serializeEntity('trackableFields', field()),
    serializeEntity('trackableOptions', option('Moderate', 2)),
  ]
}

function conflict(local: SyncRecord, remote: SyncRecord, kind: SyncConflictSnapshot['kind'] = 'differing-values'): SyncConflictSnapshot {
  return { id: `${local.entityType}:${local.id}`, kind, detectedAt: stamp, local, remote }
}

function present(item: SyncConflictSnapshot, related: readonly SyncConflictSnapshot[] = []) {
  return presentSyncConflict(item, buildConflictPresentationContext(references(), [item, ...related]))
}

describe('Trackable sync conflict presentation', () => {
  it('displays the Trackable name and category with its real differing setting', () => {
    const local = serializeEntity('trackables', trackable('migraine'))
    const remote = serializeEntity('trackables', { ...trackable('migraine'), active: false, revision: 2 })
    expect(present(conflict(local, remote))).toMatchObject({
      title: 'Migraine',
      context: 'General Health',
      differences: [{ field: 'Visibility', local: 'Visible', synced: 'Hidden' }],
    })
  })

  it('displays the parent Trackable and structured-field name', () => {
    const local = serializeEntity('trackableFields', field())
    const remote = serializeEntity('trackableFields', field({ completionBehavior: 'optional', required: false, revision: 2 }))
    const presentation = present(conflict(local, remote))
    expect(presentation).toMatchObject({ title: 'Migraine → Severity', context: 'General Health' })
    expect(presentation.differences).toEqual(expect.arrayContaining([
      { field: 'Required or optional', local: 'Required', synced: 'Optional' },
    ]))
  })

  it('shows the structured-field label and answer style when its reference changes', () => {
    const textTrackable = serializeEntity('trackables', trackable('notes'))
    const textVersion = serializeEntity('trackableVersions', version('notes', 'Notes', 'text'))
    const local = serializeEntity('trackableFields', field())
    const remote = serializeEntity('trackableFields', field({ fieldTrackableId: 'notes', revision: 2 }))
    const item = conflict(local, remote)
    const context = buildConflictPresentationContext([...references(), textTrackable, textVersion], [item])
    expect(presentSyncConflict(item, context).differences).toContainEqual({ field: 'Structured field', local: 'Severity · Scale', synced: 'Notes · Text' })
  })

  it('displays Trackable, structured field, option, and every differing option setting', () => {
    const local = serializeEntity('trackableOptions', option('Moderate', 2))
    const remote = serializeEntity('trackableOptions', option('Medium', 1, { active: false, revision: 2, createdAt: '2026-08-09T00:00:00.000Z' }))
    const presentation = present(conflict(local, remote, 'identity-collision'))
    expect(presentation.title).toBe('Trackable option conflict')
    expect(presentation.locations).toEqual({
      local: 'Migraine → Severity → Moderate · General Health',
      synced: 'Migraine → Severity → Medium · General Health',
    })
    expect(presentation.differences).toEqual([
      { field: 'Option label', local: 'Moderate', synced: 'Medium' },
      { field: 'Option order', local: '3', synced: '2' },
      { field: 'Visibility', local: 'Visible', synced: 'Hidden' },
    ])
  })

  it('represents differing parent names and categories independently', () => {
    const optionConflict = conflict(serializeEntity('trackableOptions', option('Moderate', 2)), serializeEntity('trackableOptions', option('Medium', 2, { revision: 2 })))
    const ownerConflict = conflict(
      serializeEntity('trackables', trackable('migraine', 'general')),
      serializeEntity('trackables', { ...trackable('migraine', 'pain'), revision: 2 }),
    )
    const nameConflict = conflict(
      serializeEntity('trackableVersions', version('migraine', 'Migraine')),
      serializeEntity('trackableVersions', { ...version('migraine', 'Headache'), revision: 2 }),
    )
    expect(present(optionConflict, [ownerConflict, nameConflict]).locations).toEqual({
      local: 'Migraine → Severity → Moderate · General Health',
      synced: 'Headache → Severity → Medium · Pain',
    })
  })

  it('degrades gracefully when a parent is missing and never exposes its ID', () => {
    const local = serializeEntity('trackableOptions', option('Moderate', 2, { trackableId: 'missing-parent' }))
    const remote = serializeEntity('trackableOptions', option('Medium', 2, { trackableId: 'missing-parent', revision: 2 }))
    const presentation = present(conflict(local, remote))
    expect(presentation.locations?.local).toMatch(/Trackable unavailable.*Moderate.*Category unavailable/)
    expect(JSON.stringify(presentation)).not.toContain('missing-parent')
  })

  it('marks deleted parents without losing the option context', () => {
    const optionConflict = conflict(serializeEntity('trackableOptions', option('Moderate', 2)), serializeEntity('trackableOptions', option('Medium', 2, { revision: 2 })))
    const deletedOwner = conflict(
      serializeEntity('trackables', { ...trackable('migraine'), deletedAt: '2026-08-11T00:00:00.000Z', revision: 2 }),
      serializeEntity('trackables', { ...trackable('migraine'), deletedAt: '2026-08-11T00:00:00.000Z', revision: 2 }),
    )
    expect(present(optionConflict, [deletedOwner]).locations?.local).toBe('Migraine (deleted) → Severity → Moderate · General Health')
  })
})

describe('other sync conflict presentation', () => {
  it('shows human-readable answer values', () => {
    const observation = { ...base, id: 'answer', logRecordId: 'record', trackableId: 'migraine', trackableVersion: 1, answer: { state: 'answered' as const, value: { kind: 'boolean' as const, value: true } } }
    const local = serializeEntity('observations', observation)
    const remote = serializeEntity('observations', { ...observation, answer: { state: 'unanswered' as const }, revision: 2 })
    expect(present(conflict(local, remote))).toMatchObject({ title: 'Migraine', differences: [{ field: 'Answer', local: 'Yes', synced: 'Unanswered' }] })
  })

  it('presents delete-vs-edit as a concrete record-status difference', () => {
    const local = serializeEntity('trackables', trackable('migraine'))
    const remote = serializeEntity('trackables', { ...trackable('migraine'), deletedAt: '2026-08-11T00:00:00.000Z', revision: 2 })
    expect(present(conflict(local, remote, 'delete-vs-edit')).differences).toContainEqual({ field: 'Record status', local: 'Present', synced: 'Deleted' })
  })
})

describe('Daily Check-In answer conflict presentation', () => {
  function answerReferences(): SyncRecord[] {
    return [
      serializeEntity('categories', category('skin', 'Skin')),
      serializeEntity('trackables', trackable('acne', 'skin')),
      serializeEntity('trackableVersions', version('acne', 'Acne Present', 'single_choice')),
      serializeEntity('trackableVersions', { ...version('acne', 'Acne Present', 'single_choice'), id: 'acne:v2', version: 2 }),
      serializeEntity('trackableOptions', option('Thick', 0, { id: 'thick:v1', optionId: 'thick', trackableId: 'acne', trackableVersion: 1 })),
      serializeEntity('trackableOptions', option('Dense', 0, { id: 'thick:v2', optionId: 'thick', trackableId: 'acne', trackableVersion: 2 })),
      serializeEntity('logRecords', checkIn('check-in-13', '2026-08-13')),
      serializeEntity('logRecords', checkIn('check-in-14', '2026-08-14')),
      serializeEntity('observationSelections', { ...base, id: 'answer:thick', observationId: 'answer', optionId: 'thick' }),
    ]
  }

  function presentAnswer(item: SyncConflictSnapshot, extraRecords: readonly SyncRecord[] = []) {
    return presentSyncConflict(item, buildConflictPresentationContext([...answerReferences(), ...extraRecords], [item]))
  }

  it('shows the Daily Check-In date and resolves an unanswered versus selected answer', () => {
    const local = serializeEntity('observations', observation())
    const remote = serializeEntity('observations', observation({ answer: { state: 'answered', value: { kind: 'choice', value: null } }, revision: 2 }))
    const presentation = presentAnswer(conflict(local, remote))
    expect(presentation).toMatchObject({
      title: 'Acne Present',
      context: 'Skin · Daily Check-In · August 13, 2026',
      explanation: 'This Daily Check-In answer is different on this device and in your synced backup. Choose which answer to keep for August 13, 2026.',
      differences: [{ field: 'Answer', local: 'Unanswered', synced: 'Thick' }],
    })
    expect(JSON.stringify(presentation)).not.toContain('Selected option')
  })

  it('uses the option label from the answer-pinned historical definition', () => {
    const local = serializeEntity('observations', observation())
    const remote = serializeEntity('observations', observation({ answer: { state: 'answered', value: { kind: 'choice', value: null } }, revision: 2 }))
    const rendered = JSON.stringify(presentAnswer(conflict(local, remote)))
    expect(rendered).toContain('Thick')
    expect(rendered).not.toContain('Dense')
  })

  it('shows both Daily Check-In dates when parent records differ', () => {
    const local = serializeEntity('observations', observation({ answer: { state: 'answered', value: { kind: 'boolean', value: true } } }))
    const remote = serializeEntity('observations', observation({ logRecordId: 'check-in-14', answer: { state: 'answered', value: { kind: 'boolean', value: false } }, revision: 2 }))
    const presentation = presentAnswer(conflict(local, remote))
    expect(presentation.title).toBe('Acne Present')
    expect(presentation.locations).toEqual({
      local: 'Acne Present · Skin · Daily Check-In · August 13, 2026',
      synced: 'Acne Present · Skin · Daily Check-In · August 14, 2026',
    })
    expect(presentation.explanation).toMatch(/different Daily Check-In dates/i)
  })

  it('suppresses irrelevant raw definition versions inside an answer conflict', () => {
    const local = serializeEntity('observations', observation({ answer: { state: 'answered', value: { kind: 'boolean', value: true } } }))
    const remote = serializeEntity('observations', observation({ trackableVersion: 2, answer: { state: 'answered', value: { kind: 'boolean', value: false } }, revision: 2 }))
    const presentation = presentAnswer(conflict(local, remote))
    expect(presentation.differences).toEqual([{ field: 'Answer', local: 'Yes', synced: 'No' }])
    expect(JSON.stringify(presentation)).not.toMatch(/Version [12]/)
  })

  it('shows only definition changes that affect answer interpretation', () => {
    const local = serializeEntity('observations', observation({ answer: { state: 'answered', value: { kind: 'boolean', value: true } } }))
    const remote = serializeEntity('observations', observation({ trackableVersion: 2, answer: { state: 'answered', value: { kind: 'number', value: 1 } }, revision: 2 }))
    const changedDefinition = serializeEntity('trackableVersions', { ...version('acne', 'Acne Present', 'number'), id: 'acne:v2', version: 2 })
    const presentation = presentAnswer(conflict(local, remote), [changedDefinition])
    expect(presentation.differences).toContainEqual({ field: 'Question definition · Answer style', local: 'Single choice', synced: 'Number' })
    expect(JSON.stringify(presentation)).not.toMatch(/Version [12]/)
  })
})
