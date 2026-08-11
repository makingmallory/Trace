import type { IconReference } from '../domain/models/index.ts'

export interface BuiltInIcon {
  id: string
  label: string
  glyph: string
}

export const builtInIcons: readonly BuiltInIcon[] = [
  { id: 'sparkle', label: 'Sparkle', glyph: '✦' },
  { id: 'heart', label: 'Heart', glyph: '♥' },
  { id: 'moon', label: 'Moon', glyph: '☾' },
  { id: 'sun', label: 'Sun', glyph: '☀' },
  { id: 'drop', label: 'Drop', glyph: '◆' },
  { id: 'cycle', label: 'Cycle', glyph: '↻' },
  { id: 'pulse', label: 'Pulse', glyph: '⌁' },
  { id: 'health', label: 'Health', glyph: '✚' },
  { id: 'capsule', label: 'Treatment', glyph: '◒' },
  { id: 'activity', label: 'Activity', glyph: '↗' },
  { id: 'note', label: 'Notes', glyph: '≡' },
  { id: 'clock', label: 'Time', glyph: '◷' },
]

export function iconGlyph(reference: IconReference | undefined): string {
  if (!reference) return builtInIcons[0].glyph
  if (reference.type === 'emoji') return reference.value
  return builtInIcons.find((icon) => icon.id === reference.value)?.glyph ?? builtInIcons[0].glyph
}

export function isSupportedIcon(reference: IconReference | undefined): boolean {
  if (!reference) return true
  if (reference.type === 'emoji') return reference.value.trim().length > 0 && reference.value.length <= 16
  return reference.type === 'library' && builtInIcons.some((icon) => icon.id === reference.value)
}
