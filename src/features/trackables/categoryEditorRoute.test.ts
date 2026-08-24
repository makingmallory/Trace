import { describe, expect, it } from 'vitest'
import { resolveCategoryEditorRoute } from './categoryEditorRoute.ts'

describe('category editor routes', () => {
  const categories = [{ id: 'category.skin' }, { id: 'category.mood' }]

  it('treats the dedicated new route as create mode', () => {
    expect(resolveCategoryEditorRoute('create', undefined, categories)).toEqual({ kind: 'create' })
  })

  it('resolves a valid category id as edit mode', () => {
    expect(resolveCategoryEditorRoute('edit', 'category.skin', categories)).toEqual({ kind: 'edit', categoryId: 'category.skin' })
  })

  it('keeps invalid category ids in the not-found state', () => {
    expect(resolveCategoryEditorRoute('edit', 'not-a-category', categories)).toEqual({ kind: 'not-found' })
  })
})
