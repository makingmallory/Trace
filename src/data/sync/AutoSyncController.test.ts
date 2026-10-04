import { describe, expect, it, vi } from 'vitest'
import { AUTO_SYNC_DEBOUNCE_MS, AUTO_SYNC_FOREGROUND_THROTTLE_MS, AutoSyncController } from './AutoSyncController.ts'

function setup({ enabled = true, connected = true, pending = 0, lastSuccessfulSyncAt = null as string | null } = {}) {
  let isEnabled = enabled
  let isConnected = connected
  let status = { pendingChangeCount: pending, lastSuccessfulSyncAt }
  const requestSync = vi.fn(async () => undefined)
  const controller = new AutoSyncController({
    enabled: () => isEnabled,
    connected: () => isConnected,
    requestSync,
    status: async () => status,
    now: () => 1_000_000,
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay) as unknown as number,
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
  })
  return {
    controller,
    requestSync,
    setEnabled: (next: boolean) => { isEnabled = next },
    setConnected: (next: boolean) => { isConnected = next },
    setStatus: (next: typeof status) => { status = next },
  }
}

describe('AutoSyncController', () => {
  it('is dormant by default when Auto Sync is disabled', async () => {
    vi.useFakeTimers()
    const { controller, requestSync } = setup({ enabled: false })
    controller.start(); controller.onLocalWrite(); controller.onForeground(); controller.onOnline()
    await vi.runAllTimersAsync()
    expect(requestSync).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('debounces rapid local writes into one quiet sync request', async () => {
    vi.useFakeTimers()
    const { controller, requestSync } = setup({ pending: 1 })
    controller.onLocalWrite(); controller.onLocalWrite(); controller.onLocalWrite()
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_DEBOUNCE_MS - 1)
    expect(requestSync).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(requestSync).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancels pending write work on disable or unmount and ignores non-pending change events', async () => {
    vi.useFakeTimers()
    const disabled = setup({ pending: 1 })
    disabled.controller.onLocalWrite()
    disabled.setEnabled(false)
    await vi.runAllTimersAsync()
    expect(disabled.requestSync).not.toHaveBeenCalled()

    const disposed = setup({ pending: 1 })
    disposed.controller.onLocalWrite()
    disposed.controller.dispose()
    await vi.runAllTimersAsync()
    expect(disposed.requestSync).not.toHaveBeenCalled()

    const clean = setup({ pending: 0 })
    clean.controller.onLocalWrite()
    await vi.runAllTimersAsync()
    expect(clean.requestSync).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('syncs on foreground for pending changes but throttles a recent clean sync', async () => {
    const recent = new Date(1_000_000 - AUTO_SYNC_FOREGROUND_THROTTLE_MS + 1).toISOString()
    const clean = setup({ lastSuccessfulSyncAt: recent })
    clean.controller.onForeground()
    await Promise.resolve(); await Promise.resolve()
    expect(clean.requestSync).not.toHaveBeenCalled()

    const pending = setup({ pending: 1, lastSuccessfulSyncAt: recent })
    pending.controller.onForeground()
    await Promise.resolve(); await Promise.resolve()
    expect(pending.requestSync).toHaveBeenCalledTimes(1)
  })

  it('coalesces duplicate browser and Capacitor foreground events into one request', async () => {
    let finish: (() => void) | undefined
    const { controller, requestSync } = setup({ pending: 1 })
    requestSync.mockImplementation(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined) }))
    controller.onForeground(); controller.onForeground()
    await Promise.resolve()
    expect(requestSync).toHaveBeenCalledTimes(1)
    finish?.()
    await Promise.resolve()
  })

  it('stays dormant while disconnected and can retry once connected later', async () => {
    const { controller, requestSync } = setup({ connected: false })
    controller.start(); controller.onOnline()
    expect(requestSync).not.toHaveBeenCalled()
  })
})
