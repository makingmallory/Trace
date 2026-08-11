import { registerPlugin } from '@capacitor/core'
import { checkInEngine } from '../features/checkin/checkInEngine.ts'
import { isNativeAndroid } from './nativeRuntime.ts'

export type WidgetCheckInState = 'not_started' | 'draft' | 'completed'

export interface WidgetSnapshot {
  schemaVersion: 1
  routineId: string | null
  routineName: string
  checkInAvailable: boolean
  checkInState: WidgetCheckInState
  updatedAt: string
}

interface TraceWidgetPlugin {
  update(options: { snapshot: string }): Promise<void>
}

const TraceWidget = registerPlugin<TraceWidgetPlugin>('TraceWidget')

export function sanitizeWidgetSnapshot(value: unknown): WidgetSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<WidgetSnapshot>
  const states: readonly unknown[] = ['not_started', 'draft', 'completed']
  if (candidate.schemaVersion !== 1 || typeof candidate.routineName !== 'string' ||
      typeof candidate.checkInAvailable !== 'boolean' || !states.includes(candidate.checkInState) ||
      typeof candidate.updatedAt !== 'string' ||
      !(candidate.routineId === null || typeof candidate.routineId === 'string')) return null
  return candidate as WidgetSnapshot
}

export function serializeWidgetSnapshot(snapshot: WidgetSnapshot): string {
  return JSON.stringify(snapshot)
}

export async function buildWidgetSnapshot(now = new Date()): Promise<WidgetSnapshot> {
  const [configuration, state] = await Promise.all([
    checkInEngine.getConfiguration(),
    checkInEngine.getTodayState(),
  ])
  return {
    schemaVersion: 1,
    routineId: configuration.routine?.id ?? null,
    routineName: configuration.routine?.name ?? 'Daily Check-In',
    checkInAvailable: Boolean(configuration.routine && configuration.questions.length),
    checkInState: state,
    updatedAt: now.toISOString(),
  }
}

export async function publishWidgetSnapshot(): Promise<void> {
  if (!isNativeAndroid()) return
  const snapshot = await buildWidgetSnapshot()
  await TraceWidget.update({ snapshot: serializeWidgetSnapshot(snapshot) })
}
