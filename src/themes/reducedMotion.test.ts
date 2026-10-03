import { describe, expect, it } from 'vitest'
import { REDUCED_MOTION_MEDIA_QUERY, watchMotionPreference, type MotionPreferenceSource } from './motionPreference.ts'

class FakeMotionPreference implements MotionPreferenceSource {
  private listener: ((event: { matches: boolean }) => void) | null = null
  matches: boolean
  constructor(matches: boolean) { this.matches = matches }
  addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) { this.listener = listener }
  removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) { if (this.listener === listener) this.listener = null }
  change(matches: boolean) { this.matches = matches; this.listener?.({ matches }) }
}

describe('reduced-motion preference', () => {
  it('uses the OS media preference and reacts while Trace is open', () => {
    expect(REDUCED_MOTION_MEDIA_QUERY).toBe('(prefers-reduced-motion: reduce)')
    const source = new FakeMotionPreference(true)
    const dataset: Record<string, string> = {}
    const target = { documentElement: { dataset } } as unknown as Document
    const stop = watchMotionPreference(source, target)
    expect(dataset.reducedMotion).toBe('reduce')
    source.change(false)
    expect(dataset.reducedMotion).toBe('full')
    stop()
    source.change(true)
    expect(dataset.reducedMotion).toBe('full')
  })
})
