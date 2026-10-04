export const AUTO_SYNC_PREFERENCE_KEY = 'trace.sync.auto-enabled.v1'
export const AUTO_SYNC_PREFERENCE_CHANGED_EVENT = 'trace:auto-sync-preference-changed'

export interface AutoSyncPreferenceStorage {
  load(): boolean
  save(enabled: boolean): void
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function defaultStorage(): Storage {
  return typeof localStorage === 'undefined' ? new MemoryStorage() : localStorage
}

export class BrowserAutoSyncPreferenceStorage implements AutoSyncPreferenceStorage {
  private readonly storage: Storage

  constructor(storage: Storage = defaultStorage()) { this.storage = storage }

  load(): boolean {
    return this.storage.getItem(AUTO_SYNC_PREFERENCE_KEY) === 'true'
  }

  save(enabled: boolean): void {
    this.storage.setItem(AUTO_SYNC_PREFERENCE_KEY, String(enabled))
    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.Event === 'function') globalThis.dispatchEvent(new Event(AUTO_SYNC_PREFERENCE_CHANGED_EVENT))
  }
}

export const autoSyncPreferenceStorage = new BrowserAutoSyncPreferenceStorage()
