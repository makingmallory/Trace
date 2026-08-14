import type { Category } from '../domain/models/index.ts'

/** Shared, identity-stable category accents. Explicit colors always win. */
export const categoryColorSuggestions = ['#9b27d9', '#ec2d91', '#7b61ff', '#ff8a22', '#2588df', '#16a077'] as const

function normalizedColor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const compact = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(compact)) return compact.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(compact)) return `#${compact.slice(1).split('').map((part) => part + part).join('')}`.toLowerCase()
  return undefined
}

function stableIndex(value: string): number {
  let hash = 0
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return Math.abs(hash) % categoryColorSuggestions.length
}

export function effectiveCategoryColor(category: Pick<Category, 'id' | 'color'>): string {
  return normalizedColor(category.color) ?? categoryColorSuggestions[stableIndex(category.id)]
}

export function normalizeCategoryColor(value: string): string {
  const color = normalizedColor(value)
  if (!color) throw new Error('Choose a valid color.')
  return color
}
