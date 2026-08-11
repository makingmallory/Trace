import type { LogRecord } from '../../domain/models/index.ts'
import { formatEventTiming } from '../../domain/events/eventTiming.ts'

export function homeEventTiming(record: LogRecord): string {
  const timing = formatEventTiming(record)
  return timing === 'Date only' ? '' : timing
}
