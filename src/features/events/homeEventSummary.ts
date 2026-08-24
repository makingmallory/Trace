import type { LogRecord } from '../../domain/models/index.ts'
import { formatEventTiming } from '../../domain/events/eventTiming.ts'
import { quickLogEditPath } from './quickLogNavigation.ts'

export function homeEventTiming(record: LogRecord): string {
  const timing = formatEventTiming(record)
  return timing === 'Date only' ? '' : timing
}

export function homeEventEditPath(recordId: string): string {
  return quickLogEditPath(recordId, '/')
}
