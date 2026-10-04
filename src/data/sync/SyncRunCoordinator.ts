import type { SyncRunResult } from './SyncService.ts'

export interface ConnectedSyncRunner {
  sync(): Promise<SyncRunResult>
  countPending(): Promise<number>
  setSyncing(syncing: boolean): void
}

/** Shares one sync run between manual and automatic requests. */
export class SyncRunCoordinator {
  private active: Promise<SyncRunResult> | null = null
  private followUpRequested = false
  private readonly runner: ConnectedSyncRunner

  constructor(runner: ConnectedSyncRunner) { this.runner = runner }

  request(): Promise<SyncRunResult> {
    if (this.active) {
      this.followUpRequested = true
      return this.active
    }
    this.runner.setSyncing(true)
    const run = this.runner.sync()
    const completed = run.finally(() => {
      this.active = null
      this.runner.setSyncing(false)
      if (!this.followUpRequested) return
      this.followUpRequested = false
      void this.runner.countPending().then((pending) => {
        if (pending > 0) void this.request().catch(() => undefined)
      }).catch(() => undefined)
    })
    this.active = completed
    return completed
  }
}
