import type {
  Category,
  DataRole,
  IconReference,
  InputType,
  EventTimingMode,
  JsonValue,
  Trackable,
  TrackableOption,
  TrackableVersion,
  ValueDirection,
  TrackableRecordSemantics,
} from '../models/index.ts'
import type { DataRepository } from '../../data/repository/DataRepository.ts'
import { isSupportedIcon } from '../../presets/iconLibrary.ts'
import { categoryPresets, getPresetById, presetPacks, trackablePresets, type TrackablePreset } from '../../presets/trackablePresets.ts'

export interface OptionDraft {
  optionId?: string
  label: string
  icon?: IconReference
}

export interface TrackableDraft {
  name: string
  description?: string
  categoryId: string
  inputType: InputType
  recordSemantics?: TrackableRecordSemantics
  quickLogEnabled?: boolean
  quickLogTimingMode?: EventTimingMode
  dataRole: DataRole
  valueDirection: ValueDirection
  unit?: string
  scaleMin?: number
  scaleMax?: number
  scaleStep?: number
  options?: readonly OptionDraft[]
  tags?: readonly string[]
  icon?: IconReference
  configuration?: Readonly<Record<string, JsonValue>>
}

export interface TrackableDetails {
  trackable: Trackable
  version: TrackableVersion
  options: readonly TrackableOption[]
}

export interface TrackableLibrary {
  categories: readonly Category[]
  active: readonly TrackableDetails[]
  archived: readonly TrackableDetails[]
}

export class TrackableValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues.join(' '))
    this.name = 'TrackableValidationError'
    this.issues = issues
  }
}

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

function optionStoredValue(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function validateDraft(draft: TrackableDraft): void {
  const issues: string[] = []
  if (!draft.name.trim()) issues.push('Name is required.')
  if (draft.name.trim().length > 100) issues.push('Name must be 100 characters or fewer.')
  if (!draft.categoryId) issues.push('Choose a category.')
  if (draft.recordSemantics && draft.recordSemantics !== 'daily_value' && draft.recordSemantics !== 'occurrence') issues.push('Choose Daily Value or Occurrence tracking.')
  if (draft.quickLogEnabled && draft.recordSemantics !== 'occurrence') issues.push('Quick Log is only available for Occurrence Trackables.')
  if (!isSupportedIcon(draft.icon)) issues.push('Choose a built-in icon or a short emoji.')

  if (draft.inputType === 'scale') {
    const { scaleMin, scaleMax, scaleStep } = draft
    if (![scaleMin, scaleMax, scaleStep].every((value) => Number.isFinite(value))) issues.push('Scale minimum, maximum, and step are required numbers.')
    else if (scaleMax! <= scaleMin!) issues.push('Scale maximum must be greater than minimum.')
    else if (scaleStep! <= 0 || scaleStep! > scaleMax! - scaleMin!) issues.push('Scale step must be greater than zero and no larger than the range.')
    else if ((scaleMax! - scaleMin!) / scaleStep! > 100) issues.push('Scale may contain at most 101 values.')
  }

  const choiceInput = draft.inputType === 'single_choice' || draft.inputType === 'multi_select'
  if (choiceInput) {
    const labels = (draft.options ?? []).map((option) => option.label.trim())
    if (labels.length < 2 || labels.some((label) => !label)) issues.push('Choice Trackables need at least two named options.')
    if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) issues.push('Option labels must be unique.')
    const values = labels.map(optionStoredValue)
    if (values.some((value) => !value) || new Set(values).size !== values.length) issues.push('Options must have distinct letters or numbers.')
  } else if ((draft.options?.length ?? 0) > 0) {
    issues.push('Options are only valid for single choice and multi-select Trackables.')
  }

  if (draft.inputType === 'duration' && draft.unit && draft.unit.trim().toLowerCase() !== 'minutes') issues.push('Duration Trackables are stored in minutes.')

  if (issues.length) throw new TrackableValidationError(issues)
}

function versionDefinition(draft: TrackableDraft): string {
  return JSON.stringify({
    name: draft.name.trim(), description: draft.description?.trim() || undefined, inputType: draft.inputType,
    recordSemantics: draft.recordSemantics ?? 'daily_value', quickLogTimingMode: draft.quickLogTimingMode,
    unit: draft.unit?.trim() || undefined, valueDirection: draft.valueDirection,
    scaleMin: draft.scaleMin, scaleMax: draft.scaleMax, scaleStep: draft.scaleStep,
    configuration: draft.configuration ?? {},
    options: (draft.options ?? []).map((option) => ({ optionId: option.optionId, label: option.label.trim() })),
  })
}

export class TrackableEngine {
  private initialization: Promise<void> | null = null
  private readonly repository: DataRepository
  private readonly now: () => Date
  private readonly createId: () => string

  constructor(repository: DataRepository, now: () => Date = () => new Date(), createId: () => string = () => crypto.randomUUID()) {
    this.repository = repository
    this.now = now
    this.createId = createId
  }

  initialize(): Promise<void> {
    if (!this.initialization) this.initialization = this.seedCategories()
    return this.initialization
  }

  private timestamp(): string { return this.now().toISOString() }

  private async seedCategories(): Promise<void> {
    for (const item of trackablePresets) validateDraft(this.presetDraft(item))
    if ((await this.repository.getAll('categories')).length > 0) return
    const timestamp = this.timestamp()
    await this.repository.saveMany('categories', categoryPresets.map((preset) => ({
      id: preset.id, name: preset.name, sortOrder: preset.sortOrder, active: true,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    })))
  }

  async getLibrary(): Promise<TrackableLibrary> {
    await this.initialize()
    const [categories, trackables, versions, options] = await Promise.all([
      this.repository.getAll('categories'), this.repository.getAll('trackables'),
      this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions'),
    ])
    const details = trackables.map((trackable) => {
      const version = versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
      if (!version) throw new Error(`Trackable ${trackable.id} is missing version ${trackable.currentVersion}.`)
      return {
        trackable, version,
        options: options.filter((item) => item.trackableId === trackable.id && item.trackableVersion === trackable.currentVersion).sort((a, b) => a.sortOrder - b.sortOrder),
      }
    })
    return {
      categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
      active: details.filter(({ trackable }) => trackable.active && !trackable.deletedAt),
      archived: details.filter(({ trackable }) => !trackable.active && !trackable.deletedAt),
    }
  }

  async createCategory(name: string): Promise<Category> {
    await this.initialize()
    const cleanName = name.trim()
    if (!cleanName) throw new TrackableValidationError(['Category name is required.'])
    const categories = await this.repository.getAll('categories')
    if (categories.some((category) => category.name.toLowerCase() === cleanName.toLowerCase() && !category.deletedAt)) throw new TrackableValidationError(['Category names must be unique.'])
    const timestamp = this.timestamp()
    const category: Category = { id: this.createId(), name: cleanName, sortOrder: categories.length, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    await this.repository.save('categories', category)
    return category
  }

  async renameCategory(id: string, name: string): Promise<void> {
    const category = await this.requireCategory(id)
    const cleanName = name.trim()
    if (!cleanName) throw new TrackableValidationError(['Category name is required.'])
    const categories = await this.repository.getAll('categories')
    if (categories.some((item) => item.id !== id && item.name.toLowerCase() === cleanName.toLowerCase() && !item.deletedAt)) throw new TrackableValidationError(['Category names must be unique.'])
    await this.repository.save('categories', { ...category, name: cleanName, updatedAt: this.timestamp(), revision: category.revision + 1 })
  }

  async setCategoryActive(id: string, active: boolean): Promise<void> {
    const category = await this.requireCategory(id)
    await this.repository.save('categories', { ...category, active, updatedAt: this.timestamp(), revision: category.revision + 1 })
  }

  async reorderCategory(id: string, direction: -1 | 1): Promise<void> {
    const categories = [...await this.repository.getAll('categories')].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = categories.findIndex((category) => category.id === id)
    const swapIndex = index + direction
    if (index < 0 || swapIndex < 0 || swapIndex >= categories.length) return
    const timestamp = this.timestamp()
    const first = categories[index]
    const second = categories[swapIndex]
    await this.repository.saveMany('categories', [
      { ...first, sortOrder: second.sortOrder, updatedAt: timestamp, revision: first.revision + 1 },
      { ...second, sortOrder: first.sortOrder, updatedAt: timestamp, revision: second.revision + 1 },
    ])
  }

  async createFromPreset(presetId: string): Promise<TrackableDetails> {
    const item = getPresetById(presetId)
    if (!item) throw new TrackableValidationError(['Ready-made Trackable was not found.'])
    if (await this.isPresetActive(presetId)) throw new TrackableValidationError([`${item.name} is already in your active Trackables.`])
    return this.createTrackable(this.presetDraft(item))
  }

  async isPresetActive(presetId: string): Promise<boolean> {
    const item = getPresetById(presetId)
    if (!item) return false
    const { active } = await this.getLibrary()
    return active.some(({ trackable, version }) =>
      trackable.categoryId === item.categoryId
      && version.name.toLocaleLowerCase() === item.name.toLocaleLowerCase()
      && version.inputType === item.inputType,
    )
  }

  async createFromPack(packId: string): Promise<readonly TrackableDetails[]> {
    const pack = presetPacks.find((item) => item.id === packId)
    if (!pack) throw new TrackableValidationError(['Starter Pack was not found.'])
    const created: TrackableDetails[] = []
    for (const presetId of pack.presetIds) {
      if (!await this.isPresetActive(presetId)) created.push(await this.createFromPreset(presetId))
    }
    return created
  }

  private presetDraft(item: TrackablePreset): TrackableDraft {
    return { name: item.name, description: item.description, categoryId: item.categoryId, inputType: item.inputType, recordSemantics: 'daily_value', quickLogEnabled: false,
      dataRole: item.dataRole, valueDirection: item.valueDirection, unit: item.unit,
      scaleMin: item.scale?.min, scaleMax: item.scale?.max, scaleStep: item.scale?.step,
      options: item.options?.map((label) => ({ label })), tags: item.tags, icon: item.icon }
  }

  async createTrackable(draft: TrackableDraft): Promise<TrackableDetails> {
    await this.initialize()
    validateDraft(draft)
    await this.requireCategory(draft.categoryId)
    const timestamp = this.timestamp()
    const trackableId = this.createId()
    const trackable: Trackable = { id: trackableId, categoryId: draft.categoryId, active: true, archivedAt: null, currentVersion: 1,
      tags: normalizeTags(draft.tags), dataRole: draft.dataRole, recordSemantics: draft.recordSemantics ?? 'daily_value', quickLogEnabled: draft.recordSemantics === 'occurrence' && Boolean(draft.quickLogEnabled),
      quickLogTimingMode: draft.recordSemantics === 'occurrence' && draft.quickLogEnabled ? draft.quickLogTimingMode ?? 'either' : undefined,
      icon: draft.icon, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    const version = this.makeVersion(trackableId, 1, draft, timestamp)
    const options = this.makeOptions(trackableId, 1, draft.options ?? [], timestamp)
    await this.repository.save('trackables', trackable)
    await this.repository.save('trackableVersions', version)
    await this.repository.saveMany('trackableOptions', options)
    return { trackable, version, options }
  }

  async updateTrackable(id: string, draft: TrackableDraft): Promise<TrackableDetails> {
    validateDraft(draft)
    await this.requireCategory(draft.categoryId)
    const current = await this.getDetails(id)
    const currentDraft: TrackableDraft = {
      name: current.version.name, description: current.version.description, categoryId: current.trackable.categoryId,
      inputType: current.version.inputType, recordSemantics: current.trackable.recordSemantics ?? 'daily_value', quickLogEnabled: current.trackable.quickLogEnabled ?? false, quickLogTimingMode: current.trackable.quickLogTimingMode,
      dataRole: current.trackable.dataRole, valueDirection: current.version.valueDirection,
      unit: current.version.unit, scaleMin: current.version.scaleMin, scaleMax: current.version.scaleMax, scaleStep: current.version.scaleStep,
      options: current.options.filter((option) => option.active).map((option) => ({ optionId: option.optionId, label: option.label, icon: option.icon })),
      tags: current.trackable.tags, icon: current.trackable.icon, configuration: current.version.configuration,
    }
    const semanticChange = versionDefinition(currentDraft) !== versionDefinition(draft)
    const timestamp = this.timestamp()
    const recordSemantics = draft.recordSemantics ?? 'daily_value'
    const quickLogEnabled = recordSemantics === 'occurrence' && Boolean(draft.quickLogEnabled)
    const { behavior: _legacyBehavior, ...currentTrackable } = current.trackable
    const trackable: Trackable = { ...currentTrackable, categoryId: draft.categoryId, dataRole: draft.dataRole, recordSemantics, quickLogEnabled,
      quickLogTimingMode: quickLogEnabled ? draft.quickLogTimingMode ?? 'either' : undefined, tags: normalizeTags(draft.tags), icon: draft.icon,
      currentVersion: semanticChange ? current.trackable.currentVersion + 1 : current.trackable.currentVersion, updatedAt: timestamp, revision: current.trackable.revision + 1 }
    if (!semanticChange) {
      await this.repository.save('trackables', trackable)
      return { ...current, trackable }
    }

    const version = this.makeVersion(id, trackable.currentVersion, draft, timestamp)
    const options = this.makeOptions(id, trackable.currentVersion, draft.options ?? [], timestamp)
    await this.repository.save('trackableVersions', version)
    await this.repository.saveMany('trackableOptions', options)
    await this.repository.save('trackableVersions', { ...current.version, retiredAt: timestamp, updatedAt: timestamp, revision: current.version.revision + 1 })
    await this.repository.save('trackables', trackable)
    return { trackable, version, options }
  }

  async setTrackableActive(id: string, active: boolean): Promise<void> {
    const details = await this.getDetails(id)
    const timestamp = this.timestamp()
    await this.repository.save('trackables', { ...details.trackable, active, archivedAt: active ? null : timestamp, updatedAt: timestamp, revision: details.trackable.revision + 1 })
  }

  async getDetails(id: string): Promise<TrackableDetails> {
    const trackable = await this.repository.getById('trackables', id)
    if (!trackable) throw new TrackableValidationError(['Trackable was not found.'])
    const versions = await this.repository.getAll('trackableVersions')
    const version = versions.find((item) => item.trackableId === id && item.version === trackable.currentVersion)
    if (!version) throw new Error(`Trackable ${id} is missing its current version.`)
    const options = (await this.repository.getAll('trackableOptions')).filter((item) => item.trackableId === id && item.trackableVersion === trackable.currentVersion).sort((a, b) => a.sortOrder - b.sortOrder)
    return { trackable, version, options }
  }

  private makeVersion(trackableId: string, versionNumber: number, draft: TrackableDraft, timestamp: string): TrackableVersion {
    return { id: this.createId(), trackableId, version: versionNumber, name: draft.name.trim(), description: draft.description?.trim() || undefined,
      inputType: draft.inputType, scaleMin: draft.inputType === 'scale' ? draft.scaleMin : undefined,
      scaleMax: draft.inputType === 'scale' ? draft.scaleMax : undefined, scaleStep: draft.inputType === 'scale' ? draft.scaleStep : undefined,
      unit: draft.inputType === 'duration' ? 'minutes' : draft.unit?.trim() || undefined, valueDirection: draft.valueDirection, configuration: draft.configuration ?? {}, retiredAt: null,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
  }

  private makeOptions(trackableId: string, version: number, drafts: readonly OptionDraft[], timestamp: string): readonly TrackableOption[] {
    return drafts.map((draft, sortOrder) => {
      const optionId = draft.optionId ?? this.createId()
      return { id: `${optionId}:v${version}`, optionId, trackableId, trackableVersion: version, storedValue: optionStoredValue(draft.label), label: draft.label.trim(), icon: draft.icon,
        sortOrder, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    })
  }

  private async requireCategory(id: string): Promise<Category> {
    const category = await this.repository.getById('categories', id)
    if (!category || category.deletedAt) throw new TrackableValidationError(['Category was not found.'])
    return category
  }
}
