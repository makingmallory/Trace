import { describe, expect, it } from 'vitest'
import { SYNC_SETTINGS_PATH, deriveSyncBadgePresentation } from './SyncStatus.ts'

const base = { configured: true, syncing: false, online: true, pendingChangeCount: 0, lastSuccessfulSyncAt: '2026-08-24T12:00:00.000Z', lastError: null }

describe('sync badge status', () => {
  it('uses the supported labels from actual sync metadata', () => {
    expect(deriveSyncBadgePresentation(base)).toMatchObject({ status: 'synced', label: 'Synced' })
    expect(deriveSyncBadgePresentation({ ...base, syncing: true })).toMatchObject({ status: 'syncing', label: 'Syncing' })
    expect(deriveSyncBadgePresentation({ ...base, online: false })).toMatchObject({ status: 'offline', label: 'Offline' })
    expect(deriveSyncBadgePresentation({ ...base, pendingChangeCount: 2 })).toMatchObject({ status: 'needs-sync', label: 'Needs Sync' })
    expect(deriveSyncBadgePresentation({ ...base, lastError: 'Provider unavailable' })).toMatchObject({ status: 'error', label: 'Sync Error' })
  })

  it('treats persisted record conflicts as work that still needs sync attention', () => {
    expect(deriveSyncBadgePresentation({ ...base, lastError: '18 record conflicts need attention.' })).toMatchObject({ status: 'needs-sync', label: 'Needs Sync' })
    expect(deriveSyncBadgePresentation({ ...base, lastError: 'Provider unavailable' })).toMatchObject({ status: 'error', label: 'Sync Error' })
  })

  it('uses syncing, true failures, conflicts, offline, and pending precedence in that order', () => {
    expect(deriveSyncBadgePresentation({ ...base, syncing: true, online: false, pendingChangeCount: 1, lastError: 'Failed' }).status).toBe('syncing')
    expect(deriveSyncBadgePresentation({ ...base, online: false, pendingChangeCount: 1, lastError: 'Failed' }).status).toBe('error')
    expect(deriveSyncBadgePresentation({ ...base, online: false, pendingChangeCount: 1, lastError: '2 record conflicts need attention.' }).status).toBe('needs-sync')
    expect(deriveSyncBadgePresentation({ ...base, syncing: true, online: false, pendingChangeCount: 1 }).status).toBe('syncing')
    expect(deriveSyncBadgePresentation({ ...base, online: false, pendingChangeCount: 1 }).status).toBe('offline')
  })

  it('falls back safely when backup state is not configured or not yet known', () => {
    expect(deriveSyncBadgePresentation({ ...base, configured: false, lastError: 'Old error' })).toMatchObject({ status: 'sync', label: 'Sync' })
    expect(deriveSyncBadgePresentation({ ...base, lastSuccessfulSyncAt: null })).toMatchObject({ status: 'sync', label: 'Sync' })
  })

  it('uses one standard badge treatment and the existing Settings shortcut for every state', () => {
    const states = [base, { ...base, syncing: true }, { ...base, online: false }, { ...base, pendingChangeCount: 1 }, { ...base, lastError: 'Failed' }]
    expect(states.map((snapshot) => deriveSyncBadgePresentation(snapshot).visualTreatment)).toEqual(['standard', 'standard', 'standard', 'standard', 'standard'])
    expect(SYNC_SETTINGS_PATH).toBe('/settings')
  })
})
