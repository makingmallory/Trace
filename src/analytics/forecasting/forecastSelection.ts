import type { ForecastResult } from './forecastTypes.ts'

export const forecastSelectionKey = 'trace:forecast-targets'
export const forecastSelectionEvent = 'trace:forecast-selection-changed'

export function readForecastSelection(): string[] | null {
  try { const raw = globalThis.localStorage?.getItem(forecastSelectionKey); const parsed: unknown = raw ? JSON.parse(raw) : null; return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : null }
  catch { return null }
}

export function saveForecastSelection(ids: readonly string[]): void {
  try { globalThis.localStorage?.setItem(forecastSelectionKey, JSON.stringify(ids)); globalThis.dispatchEvent(new Event(forecastSelectionEvent)) }
  catch { /* Selection persistence is an optional convenience. */ }
}

export function defaultForecastSelection(results: readonly ForecastResult[]): string[] {
  return results.filter((item) => item.status === 'ready').slice(0, 4).map((item) => item.target.descriptorId)
}

export function homeForecastRows(results: readonly ForecastResult[], selected: readonly string[], limit = 3): ForecastResult[] {
  const order = new Map(selected.map((id, index) => [id, index]))
  return results.filter((item) => order.has(item.target.descriptorId) && item.status === 'ready')
    .sort((a, b) => ({ high: 2, moderate: 1, low: 0 })[b.confidence ?? 'low'] - ({ high: 2, moderate: 1, low: 0 })[a.confidence ?? 'low'] || (order.get(a.target.descriptorId)! - order.get(b.target.descriptorId)!))
    .slice(0, limit)
}
