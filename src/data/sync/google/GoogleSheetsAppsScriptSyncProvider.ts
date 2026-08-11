import type {
  PullResult,
  PushResult,
  SyncProvider,
  SyncSpikeProvider,
  SyncProviderHealth,
  SyncSpikeRecord,
} from '../SyncProvider.ts'
import { parseSyncRecord, TRACE_SCHEMA_VERSION, TRACE_SYNC_VERSION, type SyncRecord } from '../SyncProtocol.ts'

interface ApiEnvelope {
  ok: boolean
  data?: unknown
  error?: string
}

export interface GoogleSheetsAppsScriptSyncProviderOptions {
  endpointUrl: string
  fetchImplementation?: typeof fetch
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseEnvelope(value: unknown): ApiEnvelope {
  if (!isObject(value) || typeof value.ok !== 'boolean') {
    throw new Error('The Apps Script endpoint returned an invalid response.')
  }

  if (value.error !== undefined && typeof value.error !== 'string') {
    throw new Error('The Apps Script endpoint returned an invalid error payload.')
  }

  return {
    ok: value.ok,
    data: value.data,
    error: value.error,
  }
}

function parseRecord(value: unknown): SyncSpikeRecord {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.value !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    throw new Error('The Apps Script endpoint returned an invalid test record.')
  }

  return {
    id: value.id,
    value: value.value,
    createdAt: value.createdAt,
  }
}

function validateEndpoint(endpointUrl: string): URL {
  let url: URL

  try {
    url = new URL(endpointUrl)
  } catch {
    throw new Error('Enter a valid Apps Script web app URL.')
  }

  const isAppsScriptExecutionUrl =
    url.protocol === 'https:' &&
    url.hostname === 'script.google.com' &&
    /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)

  if (!isAppsScriptExecutionUrl) {
    throw new Error('Use the deployed Apps Script URL ending in /exec.')
  }

  return url
}

export class GoogleSheetsAppsScriptSyncProvider implements SyncProvider, SyncSpikeProvider {
  readonly providerId = 'google-sheets-apps-script'

  private readonly endpointUrl: URL
  private readonly fetchImplementation: typeof fetch

  constructor({
    endpointUrl,
    fetchImplementation,
  }: GoogleSheetsAppsScriptSyncProviderOptions) {
    this.endpointUrl = validateEndpoint(endpointUrl.trim())
    const resolvedFetch = fetchImplementation ?? globalThis.fetch
    this.fetchImplementation = resolvedFetch.bind(globalThis)
  }

  async healthCheck(): Promise<SyncProviderHealth> {
    try {
      const data = await this.get({ action: 'getMetadata' })
      if (!isObject(data) || data.syncVersion !== TRACE_SYNC_VERSION || data.schemaVersion !== TRACE_SCHEMA_VERSION) {
        throw new Error('This Google Sheet is not a compatible Trace backup.')
      }
      const sheetName =
        isObject(data) && typeof data.sheetName === 'string'
          ? data.sheetName
          : 'Google Sheet'

      return {
        available: true,
        message: `Connected to ${sheetName}.`,
        sheetName,
        sheetId: typeof data.sheetId === 'string' ? data.sheetId : undefined,
        schemaVersion: TRACE_SCHEMA_VERSION,
        checkpoint: typeof data.checkpoint === 'number' ? data.checkpoint : 0,
      }
    } catch (error) {
      return {
        available: false,
        message: error instanceof Error ? error.message : 'Endpoint check failed.',
      }
    }
  }

  async pullChanges(checkpoint: number): Promise<PullResult> {
    const data = await this.get({ action: 'pullChanges', checkpoint: String(checkpoint) })
    if (!isObject(data) || !Number.isInteger(data.checkpoint) || !Array.isArray(data.records)) {
      throw new Error('The Apps Script endpoint returned an invalid pull response.')
    }
    return { checkpoint: data.checkpoint as number, records: data.records.map(parseSyncRecord) }
  }

  async pushBatch(records: readonly SyncRecord[]): Promise<PushResult> {
    const data = await this.post({ action: 'pushBatch', syncVersion: TRACE_SYNC_VERSION, schemaVersion: TRACE_SCHEMA_VERSION, records })
    if (!isObject(data) || !Number.isInteger(data.checkpoint) || !Array.isArray(data.accepted) || !Array.isArray(data.conflicts)) {
      throw new Error('The Apps Script endpoint returned an invalid push response.')
    }
    return {
      checkpoint: data.checkpoint as number,
      accepted: data.accepted.map(parseSyncRecord),
      conflicts: data.conflicts.map((item) => {
        if (!isObject(item)) throw new Error('The endpoint returned an invalid conflict.')
        return { local: parseSyncRecord(item.local), remote: parseSyncRecord(item.remote) }
      }),
    }
  }

  async pushTestRecord(record: SyncSpikeRecord): Promise<void> {
    await this.post({ action: 'pushTestRecord', record })
  }

  private async post(body: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
  }

  async readTestRecord(id: string): Promise<SyncSpikeRecord | null> {
    const data = await this.get({
      action: 'readTestRecord',
      recordId: id,
    })

    if (!isObject(data) || !('record' in data)) {
      throw new Error('The Apps Script endpoint returned an invalid read response.')
    }

    return data.record === null ? null : parseRecord(data.record)
  }

  private async get(parameters: Record<string, string>): Promise<unknown> {
    const url = new URL(this.endpointUrl)

    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value)
    }

    return this.request({ method: 'GET' }, url)
  }

  private async request(
    requestInit: RequestInit,
    url = this.endpointUrl,
  ): Promise<unknown> {
    const response = await this.fetchImplementation(url, {
      ...requestInit,
      cache: 'no-store',
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`Apps Script request failed with HTTP ${response.status}.`)
    }

    let parsed: unknown

    try {
      parsed = await response.json()
    } catch {
      throw new Error(
        'The endpoint did not return readable JSON. Check deployment access and browser CORS errors.',
      )
    }

    const envelope = parseEnvelope(parsed)

    if (!envelope.ok) {
      throw new Error(envelope.error ?? 'The Apps Script endpoint reported an error.')
    }

    return envelope.data
  }
}
