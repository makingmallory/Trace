import type {
  SyncSpikeProvider,
  SyncProviderHealth,
  SyncSpikeRecord,
} from './SyncProvider.ts'

export interface SyncSpikeResult {
  health: SyncProviderHealth
  sent: SyncSpikeRecord
  received: SyncSpikeRecord | null
  writeSucceeded: boolean
  readBackSucceeded: boolean
  roundTripSucceeded: boolean
}

export function createSyncSpikeRecord(now = new Date()): SyncSpikeRecord {
  return {
    id: crypto.randomUUID(),
    value: `Trace sync spike ${now.toISOString()}`,
    createdAt: now.toISOString(),
  }
}

export class SyncSpikeService {
  private readonly provider: SyncSpikeProvider

  constructor(provider: SyncSpikeProvider) {
    this.provider = provider
  }

  async run(record: SyncSpikeRecord): Promise<SyncSpikeResult> {
    const health = await this.provider.healthCheck()

    if (!health.available) {
      throw new Error(health.message ?? 'The sync endpoint is unavailable.')
    }

    await this.provider.pushTestRecord(record)
    const received = await this.provider.readTestRecord(record.id)
    const readBackSucceeded = received !== null
    const roundTripSucceeded =
      received?.id === record.id &&
      received.value === record.value &&
      received.createdAt === record.createdAt

    return {
      health,
      sent: record,
      received,
      writeSucceeded: true,
      readBackSucceeded,
      roundTripSucceeded,
    }
  }
}
