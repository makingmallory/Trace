import { describe, expect, it, vi } from 'vitest'
import type { SyncSpikeRecord } from '../SyncProvider.ts'
import { GoogleSheetsAppsScriptSyncProvider } from './GoogleSheetsAppsScriptSyncProvider.ts'

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec'
const record: SyncSpikeRecord = {
  id: 'record-1',
  value: 'Trace sync spike',
  createdAt: '2026-08-10T12:00:00.000Z',
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
})
