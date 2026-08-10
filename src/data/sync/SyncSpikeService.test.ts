import { describe, expect, it } from 'vitest'
import type {
  SyncSpikeProvider,
  SyncProviderHealth,
  SyncSpikeRecord,
} from './SyncProvider.ts'
import { SyncSpikeService } from './SyncSpikeService.ts'

const record: SyncSpikeRecord = {
  id: 'record-1',
  value: 'Trace sync spike',
  createdAt: '2026-08-10T12:00:00.000Z',
}

class StubSyncProvider implements SyncSpikeProvider {
  readonly providerId = 'stub'
  private readonly health: SyncProviderHealth
  private readonly readBack: SyncSpikeRecord | null

  constructor(
    health: SyncProviderHealth,
    readBack: SyncSpikeRecord | null,
  ) {
    this.health = health
    this.readBack = readBack
  }

  async healthCheck() {
    return this.health
  }

  async pushTestRecord() {}

  async readTestRecord() {
    return this.readBack
  }
}

describe('SyncSpikeService', () => {
  it('verifies an exact write and read-back round trip', async () => {
    const service = new SyncSpikeService(
      new StubSyncProvider({ available: true }, record),
    )

    await expect(service.run(record)).resolves.toMatchObject({
      writeSucceeded: true,
      readBackSucceeded: true,
      roundTripSucceeded: true,
    })
  })

  it('does not report success when the returned value changed', async () => {
    const service = new SyncSpikeService(
      new StubSyncProvider(
        { available: true },
        { ...record, value: 'different' },
      ),
    )

    await expect(service.run(record)).resolves.toMatchObject({
      writeSucceeded: true,
      readBackSucceeded: true,
      roundTripSucceeded: false,
    })
  })

  it('stops before writing when the endpoint health check fails', async () => {
    const service = new SyncSpikeService(
      new StubSyncProvider(
        { available: false, message: 'CORS blocked the endpoint.' },
        null,
      ),
    )

    await expect(service.run(record)).rejects.toThrow(
      'CORS blocked the endpoint.',
    )
  })
})
