import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { TrackableDetails, TrackableLibrary } from '../../domain/trackables/TrackableEngine.ts'
import { iconGlyph } from '../../presets/iconLibrary.ts'
import { getPresetById, presetPacks, trackablePresets, type PresetPack, type TrackablePreset } from '../../presets/trackablePresets.ts'
import { TrackableEditor } from './TrackableEditor.tsx'
import { trackableEngine } from './trackableEngine.ts'
import { filterOwnedTrackableGroups, filterOwnedTrackables, filterPresetGroups, inputTypes, isPresetAlreadyActive } from './trackableUi.ts'
import { ActionIcon } from '../../components/ActionIcons.tsx'
import { InlineBackHeader } from '../../components/InlineBackHeader.tsx'
import { TrackableFilterControls } from '../../components/TrackableFilterControls.tsx'
import { isQuickLogEligible, recordSemanticsFor } from '../../domain/trackables/trackableSemantics.ts'
import { categoryColorSuggestions, effectiveCategoryColor } from '../../themes/categoryColors.ts'

function useTrackableLibrary() {
  const [library, setLibrary] = useState<TrackableLibrary | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => { setLibrary(await trackableEngine.getLibrary()) }, [])
  useEffect(() => { refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not open local Trackable data.')) }, [refresh])
  return { library, error, setError, refresh }
}

function Page({ eyebrow, title, description, backTo = '/trackables', children }: { eyebrow: string; title: string; description: string; backTo?: string; children: ReactNode }) {
  return <section className="screen trackables-screen"><header className="subpage-header"><InlineBackHeader to={backTo} label={eyebrow} ariaLabel="Back" /><h1>{title}</h1><p className="screen__description">{description}</p></header>{children}</section>
}

function Loading({ error }: { error: string }) {
  return <section className="screen"><div className="trackables-loading">{error || 'Opening your Trackable library…'}</div></section>
}

function typeLabel(details: TrackableDetails): string {
  if (details.version.inputType === 'scale' && details.version.scaleMin !== undefined && details.version.scaleMax !== undefined) {
    return `Scale (${details.version.scaleMin}\u2013${details.version.scaleMax})`
  }
  return inputTypes.find((type) => type.value === details.version.inputType)?.label ?? details.version.inputType
}

function TrackableCard({ details, onArchive }: { details: TrackableDetails; onArchive: () => void }) {
  return <article className="collection-card collection-row">
    <span className="collection-card__icon emoji-icon" aria-hidden="true">{iconGlyph(details.trackable.icon)}</span>
    <div className="collection-card__copy"><h3>{details.version.name}</h3><p>{recordSemanticsFor(details.trackable) === 'occurrence' ? `Occurrence${isQuickLogEligible(details.trackable) ? ' · Quick Log' : ''}` : typeLabel(details)}{details.version.unit ? ` · ${details.version.unit}` : ''}</p></div>
    <details className="overflow-menu"><summary aria-label={`Actions for ${details.version.name}`}><span aria-hidden="true">•••</span></summary><div className="overflow-menu__panel"><Link to={`/trackables/edit/${details.trackable.id}`}>Edit</Link>{isQuickLogEligible(details.trackable) ? <Link to={`/trackables/quick-log/${details.trackable.id}`}>Configure Details</Link> : null}<button type="button" onClick={onArchive}>Archive</button></div></details>
  </article>
}

function categoryAccentStyle(category: { id: string; color?: string }): CSSProperties {
  return { '--category-accent': effectiveCategoryColor(category) } as CSSProperties
}

export function TrackablesScreen() {
  const { library, error, setError, refresh } = useTrackableLibrary()
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [openCategories, setOpenCategories] = useState<ReadonlySet<string> | null>(null)
  if (!library) return <Loading error={error} />
  const groups = filterOwnedTrackableGroups(library.active, library.categories, search, categoryId)
  const searching = Boolean(search.trim())
  const defaultOpenId = filterOwnedTrackableGroups(library.active, library.categories, '', 'all')[0]?.category.id

  function toggleCategory(id: string) {
    setOpenCategories((current) => {
      const next = new Set(current ?? (defaultOpenId ? [defaultOpenId] : []))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function archive(details: TrackableDetails) {
    setError(''); setNotice('')
    try { await trackableEngine.setTrackableActive(details.trackable.id, false); await refresh(); setNotice(`${details.version.name} archived.`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not archive this Trackable.') }
  }

  return <section className="screen trackables-screen trackables-screen--collection">
    <header className="collection-hero page-header"><p className="eyebrow">Your collection</p><div className="collection-hero__title-row"><div><h1>Trackables</h1><p className="screen__description">Little pieces of your life, ready whenever you want to check in.</p><p className="collection-count"><strong>{library.active.length}</strong> active Trackable{library.active.length === 1 ? '' : 's'}</p></div><div className="collection-hero__actions"><Link className="bubble-action" to="/trackables/add" aria-label="Add Trackable" title="Add Trackable"><ActionIcon name="add" /></Link><Link className="bubble-action" to="/trackables/manage" aria-label="Manage Trackables" title="Manage Trackables"><ActionIcon name="settings" /></Link></div></div></header>
    {library.active.length > 0 ? <TrackableFilterControls categories={library.categories.filter((category) => category.active)} search={search} categoryId={categoryId} onSearchChange={setSearch} onCategoryChange={setCategoryId} searchLabel="Search My Trackables" placeholder="Search trackables…" /> : null}
    {notice && <p className="notice notice--success" role="status">{notice}</p>}{error && <p className="notice notice--error" role="alert">{error}</p>}
      {groups.length === 0 ? (searching || categoryId !== 'all') ? <div className="empty-state"><span>◇</span><h2>No Trackables Found</h2><p>Try a different name or category.</p></div> : <div className="empty-state"><span>✦</span><h2>Your collection is ready to grow</h2><p>Start with the Trackable Library, a Starter Pack, or something completely your own.</p><Link className="primary-button button-link" to="/trackables/add">Add your first Trackable</Link></div> : <div className="collection-groups">{groups.map(({ category, items }) => { const isOpen = searching || categoryId !== 'all' || (openCategories ? openCategories.has(category.id) : category.id === defaultOpenId); return <section className={`collection-group${isOpen ? ' is-open' : ''}`} style={categoryAccentStyle(category)} key={category.id}><button className="collection-group__heading" type="button" aria-expanded={isOpen} aria-controls={`category-${category.id}`} onClick={() => toggleCategory(category.id)}><span className="collection-group__title"><strong>{category.name}</strong><span>{items.length}</span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg></button>{isOpen ? <div className="collection-grid" id={`category-${category.id}`}>{items.map((details) => <TrackableCard key={details.trackable.id} details={details} onArchive={() => void archive(details)} />)}</div> : null}</section> })}</div>}
  </section>
}

const addChoices = [
  { to: '/trackables/library', icon: 'library', title: 'Trackable Library', description: 'Browse ready-made Trackables and add the ones you want.' },
  { to: '/trackables/packs', icon: 'packs', title: 'Starter Packs', description: 'Start with a curated collection and customize what gets added.' },
  { to: '/trackables/custom', icon: 'custom', title: 'Create Custom', description: 'Build a Trackable from scratch.' },
] as const

function AddChoiceIcon({ name }: { name: typeof addChoices[number]['icon'] }) {
  const paths = {
    library: <path d="M12 2c.5 5.8 4.2 9.5 10 10-5.8.5-9.5 4.2-10 10-.5-5.8-4.2-9.5-10-10 5.8-.5 9.5-4.2 10-10Z" />,
    packs: <><path d="M4 4h16v16H4z" /><path d="M4 10h16M10 4v16M15 4v16" /></>,
    custom: <path d="M12 5v14M5 12h14" />,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export function AddTrackableScreen() {
  return <section className="screen trackables-screen add-trackable-screen">
    <header className="add-trackable-screen__header page-header"><Link className="add-trackable-screen__back" to="/trackables"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg><span>Add Trackable</span></Link><h1>Choose your<br />starting point</h1><p className="screen__description">Browse one ready-made Trackable, choose a collection, or make something unique.</p></header>
    <div className="choice-grid add-trackable-choices">{addChoices.map((choice) => <Link className="choice-card" to={choice.to} key={choice.to}><span className="choice-card__icon" aria-hidden="true"><AddChoiceIcon name={choice.icon} /></span><div><h2>{choice.title}</h2><p>{choice.description}</p></div><b aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></b></Link>)}</div>
  </section>
}

export function PresetCard({ preset, added, busy, onAdd }: { preset: TrackablePreset; added: boolean; busy: boolean; onAdd: () => void }) {
  return <article className="preset-tile"><span className="collection-card__icon" aria-hidden="true">{iconGlyph(preset.icon)}</span><div><h3>{preset.name}</h3><p>{inputTypes.find((type) => type.value === preset.inputType)?.label}</p></div>{added && <span className="added-badge">✓ Added</span>}<button className="tile-action" type="button" disabled={busy || added} onClick={onAdd}>{busy ? 'Adding…' : added ? 'Added' : 'Add'}</button></article>
}

export function TrackableLibraryScreen() {
  const { library, error, setError, refresh } = useTrackableLibrary()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const groups = useMemo(() => library ? filterPresetGroups(trackablePresets, library.categories, search, categoryId) : [], [library, search, categoryId])
  if (!library) return <Loading error={error} />
  const activeTrackables = library.active

  async function add(preset: TrackablePreset) {
    if (isPresetAlreadyActive(preset, activeTrackables)) return
    setBusyId(preset.id); setError(''); setNotice('')
    try { await trackableEngine.createFromPreset(preset.id); await refresh(); setNotice(`${preset.name} added to your collection.`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add this ready-made Trackable.') }
    finally { setBusyId('') }
  }

  return <Page eyebrow="Add Trackable" title="Trackable Library" description="Search the ready-made library or wander through a category." backTo="/trackables/add">
    <TrackableFilterControls categories={library.categories} search={search} categoryId={categoryId} onSearchChange={setSearch} onCategoryChange={setCategoryId} searchLabel="Search Trackable Library" placeholder="Try mood, sleep, pain…" />
    {notice && <p className="notice notice--success" role="status">{notice}</p>}{error && <p className="notice notice--error" role="alert">{error}</p>}
    {groups.length === 0 ? <div className="empty-state"><span>◇</span><h2>No Trackables found</h2><p>Try a different search or category.</p></div> : <div className="preset-groups">{groups.map((group) => <section className="preset-group" key={group.category.id}><div className="collection-group__heading"><h2>{group.category.name}</h2><span>{group.presets.length}</span></div><div className="preset-grid">{group.presets.map((preset) => <PresetCard key={preset.id} preset={preset} added={isPresetAlreadyActive(preset, activeTrackables)} busy={busyId === preset.id} onAdd={() => void add(preset)} />)}</div></section>)}</div>}
    {busyId && <p className="sr-only" role="status">Adding Trackable…</p>}
  </Page>
}

export function PackCard({ pack, onAdd, busy, addedPresetIds = [] }: { pack: PresetPack; onAdd: (presetIds: readonly string[]) => void; busy: boolean; addedPresetIds?: readonly string[] }) {
  const [selected, setSelected] = useState<readonly string[]>(() => pack.presetIds.filter((id) => !addedPresetIds.includes(id)))
  const names = pack.presetIds.map((id) => getPresetById(id)).filter((item): item is TrackablePreset => Boolean(item))
  useEffect(() => setSelected((current) => current.filter((id) => !addedPresetIds.includes(id))), [addedPresetIds])
  function toggle(id: string) { if (!addedPresetIds.includes(id)) setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  return <article className="pack-card pack-card--expanded"><div><h2>{pack.name}</h2><p>{pack.description}</p><span>{pack.presetIds.length} Trackables</span></div><details><summary>View items</summary><fieldset><legend className="sr-only">Choose items from {pack.name}</legend>{names.map((item) => { const added = addedPresetIds.includes(item.id); return <label key={item.id} className={added ? 'is-added' : ''}><input type="checkbox" checked={!added && selected.includes(item.id)} disabled={added} onChange={() => toggle(item.id)} /><span>{item.name}</span>{added && <b>Added</b>}</label> })}</fieldset>{pack.futureItems && <p className="pack-future">Later milestones: {pack.futureItems.join(', ')}</p>}</details><button className="primary-button" disabled={busy || selected.length === 0} onClick={() => onAdd(selected)}>{busy ? 'Adding…' : selected.length === 0 ? 'All added' : `Add ${selected.length} selected`}</button></article>
}

export function StarterPacksScreen() {
  const { library, error, setError, refresh } = useTrackableLibrary()
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const addedPresetIds = useMemo(() => library ? trackablePresets.filter((preset) => isPresetAlreadyActive(preset, library.active)).map((preset) => preset.id) : [], [library])
  async function add(pack: PresetPack, ids: readonly string[]) {
    setBusyId(pack.id); setError(''); setNotice('')
    try { for (const id of ids) await trackableEngine.createFromPreset(id); await refresh(); setNotice(`${ids.length} Trackables from ${pack.name} added.`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add this pack.') }
    finally { setBusyId('') }
  }
  if (!library) return <Loading error={error} />
  return <Page eyebrow="Add Trackable" title="Starter Packs" description="Curated little collections—take the whole set or choose just what fits." backTo="/trackables/add">{notice && <p className="notice notice--success" role="status">{notice}</p>}{error && <p className="notice notice--error" role="alert">{error}</p>}<div className="packs-stack">{presetPacks.map((pack) => <PackCard key={pack.id} pack={pack} busy={busyId === pack.id} addedPresetIds={addedPresetIds} onAdd={(ids) => void add(pack, ids)} />)}</div></Page>
}

export function CustomTrackableScreen() {
  const navigate = useNavigate()
  const { library, error } = useTrackableLibrary()
  if (!library) return <Loading error={error} />
  return <Page eyebrow="Create Custom" title="Make it yours" description="Start simple. The details can always grow with you." backTo="/trackables/add"><section className="trackable-editor"><TrackableEditor library={library} onCancel={() => navigate('/trackables/add')} onSaved={() => navigate('/trackables')} /></section></Page>
}

export function EditTrackableScreen() {
  const navigate = useNavigate()
  const { trackableId = '' } = useParams()
  const { library, error } = useTrackableLibrary()
  const details = library?.active.find((item) => item.trackable.id === trackableId) ?? library?.archived.find((item) => item.trackable.id === trackableId)
  if (!library) return <Loading error={error} />
  if (!details) return <Page eyebrow="Edit Trackable" title="Trackable not found" description="It may have been removed or is unavailable."><Link className="primary-button button-link" to="/trackables">Return to Trackables</Link></Page>
  return <Page eyebrow="Edit Trackable" title={details.version.name} description="Customize it without changing what old records meant."><section className="trackable-editor"><TrackableEditor details={details} library={library} onCancel={() => navigate('/trackables')} onSaved={() => navigate('/trackables')} /></section></Page>
}

export function ManageTrackablesScreen() {
  return <Page eyebrow="Trackables" title="Manage" description="The housekeeping bits, tucked away until you need them."><div className="choice-grid choice-grid--manage"><Link className="choice-card manage-choice-card manage-choice-card--categories" to="/trackables/manage/categories"><span aria-hidden="true">▦</span><div><h2>Manage Categories</h2><p>Create, rename, reorder, hide, or show your groups.</p></div><b aria-hidden="true">›</b></Link><Link className="choice-card manage-choice-card manage-choice-card--archived" to="/trackables/manage/archived"><span aria-hidden="true">◇</span><div><h2>Archived Trackables</h2><p>Review or reactivate things you put away.</p></div><b aria-hidden="true">›</b></Link></div></Page>
}

export function ArchivedTrackablesScreen() {
  const { library, error, setError, refresh } = useTrackableLibrary()
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  if (!library) return <Loading error={error} />
  const categoryNames = new Map(library.categories.map((category) => [category.id, category.name]))
  const archived = filterOwnedTrackables(library.archived, library.categories, search, categoryId)
  async function reactivate(details: TrackableDetails) { try { await trackableEngine.setTrackableActive(details.trackable.id, true); await refresh(); setNotice(`${details.version.name} reactivated.`) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not reactivate this Trackable.') } }
  return <Page eyebrow="Manage" title="Archived Trackables" description="Nothing is lost here. Bring a Trackable back whenever it feels useful." backTo="/trackables/manage">{library.archived.length > 0 ? <TrackableFilterControls categories={library.categories} search={search} categoryId={categoryId} onSearchChange={setSearch} onCategoryChange={setCategoryId} searchLabel="Search Archived Trackables" placeholder="Search names or categories…" /> : null}{notice && <p className="notice notice--success" role="status">{notice}</p>}{error && <p className="notice notice--error" role="alert">{error}</p>}{library.archived.length === 0 ? <div className="empty-state"><span>◇</span><h2>Nothing archived</h2><p>Your tucked-away Trackables will appear here.</p></div> : archived.length === 0 ? <div className="empty-state"><span>◇</span><h2>No Trackables Found</h2><p>Try a different name or category.</p></div> : <div className="archived-grid">{archived.map((details) => <article className="archive-card archive-card--accented" style={categoryAccentStyle(library.categories.find((category) => category.id === details.trackable.categoryId) ?? { id: details.trackable.categoryId })} key={details.trackable.id}><span className="collection-card__icon" aria-hidden="true">{iconGlyph(details.trackable.icon)}</span><div><h3>{details.version.name}</h3><p>{categoryNames.get(details.trackable.categoryId)}</p></div><button className="secondary-button" onClick={() => void reactivate(details)}>Reactivate</button></article>)}</div>}</Page>
}

export function CategoriesScreen() {
  const { library, error, setError, refresh } = useTrackableLibrary()
  const [newCategory, setNewCategory] = useState('')
  const [notice, setNotice] = useState('')
  const [colorOpenId, setColorOpenId] = useState('')
  if (!library) return <Loading error={error} />
  async function action(task: () => Promise<unknown>, success: string) { setError(''); setNotice(''); try { await task(); await refresh(); setNotice(success) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update categories.') } }
  function create(event: FormEvent) { event.preventDefault(); void action(() => trackableEngine.createCategory(newCategory), 'Category created.').then(() => setNewCategory('')) }
  return <Page eyebrow="Manage" title="Categories" description="Arrange the shelves that hold your Trackables." backTo="/trackables/manage">{notice && <p className="notice notice--success" role="status">{notice}</p>}{error && <p className="notice notice--error" role="alert">{error}</p>}<section className="category-manager"><form className="category-create" onSubmit={create}><label className="form-field"><span>New Category</span><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Category name" required /></label><button className="primary-button">Add</button></form><ol className="category-list">{library.categories.map((category, index) => <li key={category.id} style={categoryAccentStyle(category)}><div className="category-list__row"><span className="drag-hint" aria-hidden="true">⋮⋮</span><div className="management-row__copy"><strong><i className="category-color-preview" aria-hidden="true" />{category.name}</strong><small>{category.active ? 'Visible' : 'Hidden'}</small></div><button type="button" className={`management-icon-button category-color-button${colorOpenId === category.id ? ' is-active' : ''}`} aria-label={`Set color for ${category.name}`} title="Set color" aria-expanded={colorOpenId === category.id} onClick={() => setColorOpenId((current) => current === category.id ? '' : category.id)}><ActionIcon name="palette" /></button><div className="category-actions"><button type="button" className="management-icon-button" aria-label={`Move ${category.name} Up`} title="Move Up" disabled={index === 0} onClick={() => void action(() => trackableEngine.reorderCategory(category.id, -1), 'Categories reordered.')}><ActionIcon name="moveUp" /></button><button type="button" className="management-icon-button" aria-label={`Move ${category.name} Down`} title="Move Down" disabled={index === library.categories.length - 1} onClick={() => void action(() => trackableEngine.reorderCategory(category.id, 1), 'Categories reordered.')}><ActionIcon name="moveDown" /></button><button type="button" className="management-icon-button" aria-label={`Rename ${category.name}`} title="Rename" onClick={() => { const name = window.prompt('Rename category', category.name); if (name !== null) void action(() => trackableEngine.renameCategory(category.id, name), 'Category renamed.') }}><ActionIcon name="edit" /></button><button type="button" className="management-icon-button" aria-label={`${category.active ? 'Hide' : 'Show'} ${category.name}`} title={category.active ? 'Hide' : 'Show'} onClick={() => void action(() => trackableEngine.setCategoryActive(category.id, !category.active), category.active ? 'Category hidden.' : 'Category shown.')}><ActionIcon name={category.active ? 'hide' : 'show'} /></button></div></div>{colorOpenId === category.id ? <div className="category-color-panel"><span className="category-color-suggestions">{categoryColorSuggestions.map((color) => <button key={color} type="button" className={effectiveCategoryColor(category) === color ? 'is-selected' : ''} style={{ '--swatch-color': color } as CSSProperties} aria-label={`Use ${color} for ${category.name}`} onClick={() => void action(() => trackableEngine.setCategoryColor(category.id, color), 'Category color updated.')} />)}</span><label>Custom<input type="color" value={effectiveCategoryColor(category)} onChange={(event) => void action(() => trackableEngine.setCategoryColor(category.id, event.target.value), 'Category color updated.')} /></label><button type="button" className="text-button" disabled={!category.color} onClick={() => void action(() => trackableEngine.setCategoryColor(category.id, undefined), 'Automatic category color restored.')}>Automatic</button></div> : null}</li>)}</ol></section></Page>
}
