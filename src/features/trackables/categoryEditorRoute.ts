export type CategoryEditorRoute =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly categoryId: string }
  | { readonly kind: 'not-found' }

/**
 * Keeps route intent separate from a category identifier. In particular, the
 * create route has no identifier, so it can never be mistaken for one.
 */
export function resolveCategoryEditorRoute(mode: 'create' | 'edit', categoryId: string | undefined, categories: readonly { id: string }[]): CategoryEditorRoute {
  if (mode === 'create') return { kind: 'create' }
  if (!categoryId || !categories.some((category) => category.id === categoryId)) return { kind: 'not-found' }
  return { kind: 'edit', categoryId }
}
