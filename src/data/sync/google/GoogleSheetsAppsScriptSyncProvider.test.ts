import { describe, expect, it, vi } from 'vitest'
import type { SyncSpikeRecord } from '../SyncProvider.ts'
import type { SyncRecord } from '../SyncProtocol.ts'
import { GoogleSheetsAppsScriptSyncProvider } from './GoogleSheetsAppsScriptSyncProvider.ts'

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec'
const record: SyncSpikeRecord = {
  id: 'record-1',
  value: 'Trace sync spike',
  createdAt: '2026-08-10T12:00:00.000Z',
}
const productionRecord: SyncRecord = {
  format: 'trace-sync', syncVersion: 1, schemaVersion: 1, entityType: 'categories', id: 'category-1', revision: 1,
  createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z', deletedAt: null,
  baseRemoteRevision: 0, remoteRevision: 1, payload: { name: 'Category', sortOrder: 0, active: true },
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GoogleSheetsAppsScriptSyncProvider', () => {
  it('keeps the global fetch receiver when no implementation is injected', async () => {
    const receiverSensitiveFetch = vi.fn(function (
      this: typeof globalThis,
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation')
      }

      return Promise.resolve(jsonResponse({ ok: true, data: { record } }))
    }) as typeof fetch

    vi.stubGlobal('fetch', receiverSensitiveFetch)

    try {
      const provider = new GoogleSheetsAppsScriptSyncProvider({
        endpointUrl: endpoint,
      })

      await expect(provider.pushTestRecord(record)).resolves.toBeUndefined()
      expect(receiverSensitiveFetch).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses a simple POST and follows redirects when writing a test record', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true, data: { record } }),
    )
    const provider = new GoogleSheetsAppsScriptSyncProvider({
      endpointUrl: endpoint,
      fetchImplementation,
    })

    await provider.pushTestRecord(record)

    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, request] = fetchImplementation.mock.calls[0]
    expect(String(url)).toBe(endpoint)
    expect(request).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
    })
    expect(JSON.parse(String(request?.body))).toEqual({
      action: 'pushTestRecord',
      record,
    })
  })

  it('reads and validates a matching test record', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true, data: { record } }),
    )
    const provider = new GoogleSheetsAppsScriptSyncProvider({
      endpointUrl: endpoint,
      fetchImplementation,
    })

    await expect(provider.readTestRecord(record.id)).resolves.toEqual(record)

    const [url, request] = fetchImplementation.mock.calls[0]
    const requestUrl = new URL(String(url))
    expect(requestUrl.searchParams.get('action')).toBe('readTestRecord')
    expect(requestUrl.searchParams.get('recordId')).toBe(record.id)
    expect(request).toMatchObject({
      method: 'GET',
      redirect: 'follow',
    })
  })

  it('rejects URLs that are not deployed Apps Script execution URLs', () => {
    expect(
      () =>
        new GoogleSheetsAppsScriptSyncProvider({
          endpointUrl: 'https://example.com/sync',
        }),
    ).toThrow('Use the deployed Apps Script URL ending in /exec.')
  })

  it('reports unreadable endpoint payloads as unavailable', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ unexpected: true }),
    )
    const provider = new GoogleSheetsAppsScriptSyncProvider({
      endpointUrl: endpoint,
      fetchImplementation,
    })

    await expect(provider.healthCheck()).resolves.toEqual({
      available: false,
      message: 'The Apps Script endpoint returned an invalid response.',
    })
  })

  it('validates production metadata and parses incremental pull records', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { syncVersion: 1, schemaVersion: 2, checkpoint: 1, sheetName: 'Trace Backup', sheetId: 'sheet-1' } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { checkpoint: 1, records: [productionRecord] } }))
    const provider = new GoogleSheetsAppsScriptSyncProvider({ endpointUrl: endpoint, fetchImplementation })
    await expect(provider.healthCheck()).resolves.toMatchObject({ available: true, sheetName: 'Trace Backup', checkpoint: 1 })
    await expect(provider.pullChanges(0)).resolves.toEqual({ checkpoint: 1, records: [productionRecord] })
    expect(new URL(String(fetchImplementation.mock.calls[1][0])).searchParams.get('checkpoint')).toBe('0')
  })

  it('sends one production batch and rejects malformed conflict responses', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { checkpoint: 1, accepted: [productionRecord], conflicts: [] } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { checkpoint: 2, accepted: [], conflicts: [{ local: productionRecord, remote: { bad: true } }] } }))
    const provider = new GoogleSheetsAppsScriptSyncProvider({ endpointUrl: endpoint, fetchImplementation })
    await expect(provider.pushBatch([productionRecord])).resolves.toMatchObject({ checkpoint: 1, accepted: [productionRecord] })
    const body = JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body))
    expect(body).toMatchObject({ action: 'pushBatch', syncVersion: 1, schemaVersion: 2, records: [productionRecord] })
    await expect(provider.pushBatch([productionRecord])).rejects.toThrow(/incompatible Trace sync format/i)
  })

  it('rejects a future remote schema during connection validation', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, data: { syncVersion: 1, schemaVersion: 99 } }))
    const provider = new GoogleSheetsAppsScriptSyncProvider({ endpointUrl: endpoint, fetchImplementation })
    await expect(provider.healthCheck()).resolves.toMatchObject({ available: false, message: expect.stringMatching(/not a compatible/i) })
  })
})
