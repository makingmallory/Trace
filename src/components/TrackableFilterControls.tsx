import type { Category } from '../domain/models/index.ts'

export function TrackableFilterControls({
  categories,
  search,
  categoryId,
  onSearchChange,
  onCategoryChange,
  searchLabel,
  placeholder,
}: {
  categories: readonly Category[]
  search: string
  categoryId: string
  onSearchChange: (value: string) => void
  onCategoryChange: (value: string) => void
  searchLabel: string
  placeholder: string
}) {
  return <div className="trackable-filter-controls">
    <label className="owned-trackables-search"><span className="sr-only">{searchLabel}</span><span className="search-control"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} /></span></label>
    <label className="category-filter"><span className="sr-only">Filter by category</span><select value={categoryId} onChange={(event) => onCategoryChange(event.target.value)}><option value="all">All Categories</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
  </div>
}
