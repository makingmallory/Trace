export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

export interface MotionPreferenceSource {
  matches: boolean
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
}

export function browserMotionPreference(): MotionPreferenceSource | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY)
}

export function applyMotionPreference(target: Document, reduced: boolean): void {
  target.documentElement.dataset.reducedMotion = reduced ? 'reduce' : 'full'
}

export function watchMotionPreference(source: MotionPreferenceSource | null, target: Document): () => void {
  if (!source) { applyMotionPreference(target, false); return () => undefined }
  applyMotionPreference(target, source.matches)
  const listener = (event: { matches: boolean }) => applyMotionPreference(target, event.matches)
  source.addEventListener('change', listener)
  return () => source.removeEventListener('change', listener)
}
