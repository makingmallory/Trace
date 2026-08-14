export function firstGrapheme(value: string): string {
  if (!value) return ''
  if (typeof Intl.Segmenter === 'function') {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)[Symbol.iterator]().next().value
    return first?.segment ?? ''
  }
  const codePoints = Array.from(value)
  return codePoints.slice(0, 2).join('')
}
