import { describe, expect, it, vi } from 'vitest'
import { parseTraceDeepLink, isNativeAndroid } from './nativeRuntime.ts'
import { shareTextFile } from './nativeFiles.ts'
import { sanitizeWidgetSnapshot, serializeWidgetSnapshot, type WidgetSnapshot } from './widgetSnapshot.ts'

vi.mock('../features/checkin/checkInEngine.ts', () => ({ checkInEngine: {} }))

describe('Trace native routes', () => {
  it('keeps ordinary browser execution on the web fallback', async () => {
    expect(isNativeAndroid()).toBe(false)
    expect(await shareTextFile('backup.json', '{}')).toBe(false)
  })

  it('maps widget routes to existing web routes', () => {
    expect(parseTraceDeepLink('trace://check-in')).toBe('/check-in')
    expect(parseTraceDeepLink('trace://events')).toBe('/events')
    expect(parseTraceDeepLink('trace://settings/nightly-check-in')).toBe('/settings/nightly-check-in')
    expect(parseTraceDeepLink('trace://events/log/event.123')).toBe('/events/log/event.123')
    expect(parseTraceDeepLink('trace://trackables/trackable:123')).toBe('/trackables/edit/trackable%3A123')
  })

  it('fails safely for external, obsolete, and unsafe routes', () => {
    expect(parseTraceDeepLink('https://example.com/check-in')).toBeNull()
    expect(parseTraceDeepLink('trace://predictions')).toBeNull()
    expect(parseTraceDeepLink('trace://trackables/not%20safe')).toBeNull()
    expect(parseTraceDeepLink('not a url')).toBeNull()
  })
})

describe('widget snapshot contract', () => {
  const snapshot: WidgetSnapshot = {
    schemaVersion: 1,
    routineId: 'routine.1',
    routineName: 'Nightly Check-In',
    checkInAvailable: true,
    checkInState: 'draft',
    updatedAt: '2026-08-11T20:00:00.000Z',
  }

  it('round-trips the small native-only snapshot', () => {
    expect(sanitizeWidgetSnapshot(JSON.parse(serializeWidgetSnapshot(snapshot)))).toEqual(snapshot)
  })

  it('rejects invalid snapshot state', () => {
    expect(sanitizeWidgetSnapshot({ ...snapshot, checkInState: 'unknown' })).toBeNull()
  })
})
