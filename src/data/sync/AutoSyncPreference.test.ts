import { describe, expect, it } from 'vitest'
import { BrowserAutoSyncPreferenceStorage } from './AutoSyncPreference.ts'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('BrowserAutoSyncPreferenceStorage', () => {
  it('defaults to off and persists an explicit enabled choice locally', () => {
    const storage = new BrowserAutoSyncPreferenceStorage(new MemoryStorage())
    expect(storage.load()).toBe(false)
    storage.save(true)
    expect(storage.load()).toBe(true)
    storage.save(false)
    expect(storage.load()).toBe(false)
  })
})
