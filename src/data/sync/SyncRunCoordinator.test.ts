import { describe, expect, it, vi } from 'vitest'
import { SyncRunCoordinator } from './SyncRunCoordinator.ts'

function result() { return { pulled: 0, pushed: 0, pending: 0, conflicts: [], checkpoint: 0 } }

describe('SyncRunCoordinator', () => {
  it('shares one active run between manual and automatic requests', async () => {
    let finish: (() => void) | undefined
    const sync = vi.fn(() => new Promise<ReturnType<typeof result>>((resolve) => { finish = () => resolve(result()) }))
    const coordinator = new SyncRunCoordinator({ sync, countPending: async () => 0, setSyncing: vi.fn() })
    const manual = coordinator.request()
    const automatic = coordinator.request()
    expect(sync).toHaveBeenCalledTimes(1)
    finish?.()
    await expect(Promise.all([manual, automatic])).resolves.toHaveLength(2)
  })

  it('coalesces triggers during a run into at most one pending follow-up', async () => {
    let finishFirst: (() => void) | undefined
    const sync = vi.fn()
      .mockImplementationOnce(() => new Promise<ReturnType<typeof result>>((resolve) => { finishFirst = () => resolve(result()) }))
      .mockResolvedValue(result())
    const coordinator = new SyncRunCoordinator({ sync, countPending: async () => 1, setSyncing: vi.fn() })
    const first = coordinator.request()
    coordinator.request(); coordinator.request()
    finishFirst?.()
    await first
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(sync).toHaveBeenCalledTimes(2)
  })
})
