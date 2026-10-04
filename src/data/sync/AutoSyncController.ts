export const AUTO_SYNC_DEBOUNCE_MS = 8_000
export const AUTO_SYNC_FOREGROUND_THROTTLE_MS = 60_000

export interface AutoSyncStatus {
  readonly pendingChangeCount: number
  readonly lastSuccessfulSyncAt: string | null
}

export interface AutoSyncControllerDependencies {
  enabled(): boolean
  connected(): boolean
  requestSync(): Promise<unknown>
  status(): Promise<AutoSyncStatus>
  now(): number
  setTimeout(callback: () => void, delay: number): number
  clearTimeout(timer: number | undefined): void
}

export class AutoSyncController {
  private writeTimer: number | undefined
  private foregroundRequest: Promise<void> | null = null
  private disposed = false
  private readonly dependencies: AutoSyncControllerDependencies

  constructor(dependencies: AutoSyncControllerDependencies) { this.dependencies = dependencies }

  start(): void { if (!this.disposed) this.requestStartupSync() }

  dispose(): void {
    this.disposed = true
    this.dependencies.clearTimeout(this.writeTimer)
    this.writeTimer = undefined
  }

  onLocalWrite(): void {
    if (this.disposed || !this.ready()) return
    this.dependencies.clearTimeout(this.writeTimer)
    this.writeTimer = this.dependencies.setTimeout(() => {
      this.writeTimer = undefined
      if (!this.disposed && this.ready()) void this.syncPendingChanges().catch(() => undefined)
    }, AUTO_SYNC_DEBOUNCE_MS)
  }

  onForeground(): void {
    if (this.disposed || !this.ready() || this.foregroundRequest) return
    this.foregroundRequest = this.dependencies.status().then(async (status) => {
      if (this.disposed || !this.ready()) return
      const lastSync = status.lastSuccessfulSyncAt ? new Date(status.lastSuccessfulSyncAt).getTime() : 0
      if (status.pendingChangeCount > 0 || !lastSync || this.dependencies.now() - lastSync >= AUTO_SYNC_FOREGROUND_THROTTLE_MS) await this.requestQuietly()
    }).catch(() => undefined).finally(() => { this.foregroundRequest = null })
  }

  onOnline(): void { if (!this.disposed && this.ready()) void this.requestQuietly() }

  private requestStartupSync(): void { if (this.ready()) void this.requestQuietly() }

  private ready(): boolean { return this.dependencies.enabled() && this.dependencies.connected() }

  private async syncPendingChanges(): Promise<void> {
    const status = await this.dependencies.status()
    if (status.pendingChangeCount > 0 && !this.disposed && this.ready()) await this.requestQuietly()
  }

  private async requestQuietly(): Promise<void> { await this.dependencies.requestSync().then(() => undefined).catch(() => undefined) }
}
