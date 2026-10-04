import type { AnalyticsProvider, TrendsData } from '../AnalyticsProvider.ts'
import { buildLongitudinalIndex, missingForDate, type IndexedCanonicalValue, type IndexedSource, type LongitudinalIndex } from './longitudinalIndex.ts'
import type { EventPredicate, FeatureCell, FeatureDefinition, FeatureFamily, FeatureGenerationRequest, FeaturePolicy, FeatureProvenance, FeatureSource, FeatureTransformation, LongitudinalFeatureFrame } from './featureTypes.ts'

export const defaultFeaturePolicy: FeaturePolicy = {
  lagDays: [1, 2, 3, 7, 14],
  categoricalLagDays: [1, 7],
  rollingDays: [3, 7, 14, 30],
  eventCountDays: [7, 30, 90],
  postEventDays: [3, 7, 14, 30],
  maximumCategoricalCardinality: 8,
  maximumStructuredPredicates: 6,
  maximumFeatures: 256,
  families: ['lag', 'rolling', 'event', 'calendar'],
}

const dayMilliseconds = 86_400_000

function dateNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid local date: ${date}`)
  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) throw new Error(`Invalid local date: ${date}`)
  return parsed / dayMilliseconds
}

function localDate(day: number): string { return new Date(day * dayMilliseconds).toISOString().slice(0, 10) }
function key(...parts: readonly (string | number)[]): string { return parts.map((part) => encodeURIComponent(String(part))).join('/') }
function canonicalOptionId(id: string): string { return id.startsWith('option:') ? id.slice(7) : id }
function uniquePositive(values: readonly number[]): number[] { return [...new Set(values)].filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b) }

function policyFor(overrides: Partial<FeaturePolicy> = {}): FeaturePolicy {
  return {
    ...defaultFeaturePolicy,
    ...overrides,
    lagDays: uniquePositive(overrides.lagDays ?? defaultFeaturePolicy.lagDays),
    categoricalLagDays: uniquePositive(overrides.categoricalLagDays ?? defaultFeaturePolicy.categoricalLagDays),
    rollingDays: uniquePositive(overrides.rollingDays ?? defaultFeaturePolicy.rollingDays),
    eventCountDays: uniquePositive(overrides.eventCountDays ?? defaultFeaturePolicy.eventCountDays),
    postEventDays: uniquePositive(overrides.postEventDays ?? defaultFeaturePolicy.postEventDays),
    maximumCategoricalCardinality: Math.max(0, Math.floor(overrides.maximumCategoricalCardinality ?? defaultFeaturePolicy.maximumCategoricalCardinality)),
    maximumStructuredPredicates: Math.max(0, Math.floor(overrides.maximumStructuredPredicates ?? defaultFeaturePolicy.maximumStructuredPredicates)),
    maximumFeatures: Math.max(1, Math.floor(overrides.maximumFeatures ?? defaultFeaturePolicy.maximumFeatures)),
    families: [...new Set(overrides.families ?? defaultFeaturePolicy.families)],
  }
}

function cell(value: number | boolean | null, missingness: FeatureCell['missingness'], provenance: readonly FeatureProvenance[] = [], observedCount?: number): FeatureCell {
  return { value, missingness, provenance, ...(observedCount === undefined ? {} : { observedCount }) }
}

function sourceOptions(index: LongitudinalIndex, source: IndexedSource): readonly { id: string; label: string }[] {
  const current = index.data.trackables.find((trackable) => trackable.id === source.source.trackableId)
  const version = current?.currentVersion
  const options = index.data.trackableOptions.filter((option) => option.trackableId === source.source.trackableId && option.trackableVersion === version && option.active)
  const known = new Map(options.map((option) => [option.optionId, option.label]))
  for (const lane of source.track.lanes) if (!known.has(canonicalOptionId(lane.id))) known.set(canonicalOptionId(lane.id), lane.label)
  return [...known].map(([id, label]) => ({ id, label })).sort((a, b) => a.id.localeCompare(b.id))
}

function valueDefinitions(index: LongitudinalIndex, source: IndexedSource, policy: FeaturePolicy, targetTrackableId?: string): FeatureDefinition[] {
  const { descriptor, source: identity } = source
  if (descriptor.ownerTrackableId) return [] // Structured event fields enter through event predicates.
  const type = descriptor.measurementType
  if (type === 'event') return []
  const definitions: FeatureDefinition[] = []
  const numeric = type === 'continuous' || type === 'count' || type === 'duration' || type === 'time'
  const ordinal = type === 'ordinal'
  const binary = type === 'binary'
  const choices = type === 'nominal-single' || type === 'nominal-multiselect' || ordinal
  if (policy.families.includes('lag')) {
    for (const days of policy.lagDays) if (numeric || binary || ordinal) definitions.push({
      key: key('lag', descriptor.id, numeric ? 'numeric' : binary ? 'binary' : 'ordinal-rank', days),
      label: `${descriptor.name} — ${days} day${days === 1 ? '' : 's'} ago`,
      description: `${descriptor.name} recorded ${days} day${days === 1 ? '' : 's'} before the feature date.`,
      family: 'lag', source: identity,
      transformation: { kind: 'lag', days, encoding: numeric ? 'numeric' : binary ? 'binary' : 'ordinal-rank' },
      valueType: binary ? 'boolean' : ordinal ? 'ordinal-rank' : 'number',
      ...(ordinal ? { ordinalDistanceMeaningful: false as const } : {}),
    })
    if (choices) {
      const options = sourceOptions(index, source)
      if (options.length <= policy.maximumCategoricalCardinality) for (const option of options) for (const days of policy.categoricalLagDays) definitions.push({
        key: key('lag', descriptor.id, type === 'nominal-multiselect' ? 'multi-indicator' : 'category-indicator', option.id, days),
        label: `${descriptor.name}: ${option.label} — ${days} day${days === 1 ? '' : 's'} ago`,
        description: `Whether ${option.label} was selected for ${descriptor.name} ${days} day${days === 1 ? '' : 's'} ago.`,
        family: 'lag', source: identity,
        transformation: { kind: 'lag', days, encoding: type === 'nominal-multiselect' ? 'multi-indicator' : 'category-indicator', optionId: option.id },
        valueType: 'boolean',
      })
    }
  }
  if (policy.families.includes('rolling') && descriptor.trackableId !== targetTrackableId && (numeric || ordinal)) for (const days of policy.rollingDays) {
    const statistics = ordinal ? ['min', 'max', 'observed-count'] as const : ['mean', 'min', 'max', 'standard-deviation', 'observed-count', 'slope'] as const
    for (const statistic of statistics) {
      const minimumObservations = statistic === 'slope' || statistic === 'standard-deviation' ? 2 : statistic === 'observed-count' ? 0 : 1
      const title = ({ mean: 'Average', min: 'Minimum', max: 'Maximum', 'standard-deviation': 'Standard deviation of', 'observed-count': 'Observed count of', slope: 'Trend in' })[statistic]
      definitions.push({
        key: key('rolling', descriptor.id, statistic, days),
        label: `${title} ${descriptor.name} — previous ${days} days`,
        description: `${title} ${descriptor.name} over the ${days} calendar days ending on the feature date; minimum ${minimumObservations} observation${minimumObservations === 1 ? '' : 's'}.`,
        family: 'rolling', source: identity,
        transformation: { kind: 'rolling', days, statistic, minimumObservations },
        valueType: ordinal && statistic !== 'observed-count' ? 'ordinal-rank' : 'number',
        ...(ordinal && statistic !== 'observed-count' ? { ordinalDistanceMeaningful: false as const } : {}),
      })
    }
  }
  return definitions
}

interface EventOccurrence { day: number; provenance: FeatureProvenance; availableAt: string }
interface EventIndex { predicate: EventPredicate; label: string; source: FeatureSource; occurrences: readonly EventOccurrence[]; explicitNoByDate: ReadonlyMap<string, string> }

function eventPredicates(index: LongitudinalIndex, policy: FeaturePolicy): EventIndex[] {
  const result: EventIndex[] = []
  let structuredCount = 0
  for (const parent of index.sources.filter((source) => source.descriptor.measurementType === 'event')) {
    const explicitNoByDate = new Map(index.data.trackableDailyAssertions.filter((assertion) => assertion.trackableId === parent.descriptor.trackableId && assertion.status === 'did_not_occur').map((assertion) => [assertion.date, [assertion.createdAt, assertion.updatedAt].sort().at(-1)!]))
    const records = parent.track.values.flatMap((value) => {
      const record = index.recordsById.get(value.id)
      return record ? [{ day: dateNumber(value.localDate), availableAt: [record.createdAt, record.updatedAt].sort().at(-1)!, provenance: { recordId: record.id, localDate: value.localDate, trackableId: parent.descriptor.trackableId, trackableVersion: value.version, canonicalValue: value.display } }] : []
    })
    result.push({ predicate: { ownerTrackableId: parent.descriptor.trackableId }, label: parent.descriptor.name, source: parent.source, occurrences: records, explicitNoByDate })
    for (const field of index.sources.filter((source) => source.descriptor.ownerTrackableId === parent.descriptor.trackableId && ['nominal-single', 'nominal-multiselect', 'ordinal'].includes(source.descriptor.measurementType))) {
      const options = sourceOptions(index, field)
      if (options.length > policy.maximumCategoricalCardinality) continue
      const canonicalByRecord = new Map<string, IndexedCanonicalValue[]>()
      for (const values of field.byDate.values()) for (const item of values) {
        const entries = canonicalByRecord.get(item.provenance.recordId) ?? []
        entries.push(item); canonicalByRecord.set(item.provenance.recordId, entries)
      }
      for (const option of options) {
        if (structuredCount >= policy.maximumStructuredPredicates) break
        const matches = records.flatMap((event) => {
          const matching = canonicalByRecord.get(event.provenance.recordId)?.find((item) => item.value.categories?.some((category) => canonicalOptionId(category.id) === option.id))
          return matching ? [{ day: event.day, availableAt: [event.availableAt, matching.availableAt].sort().at(-1)!, provenance: matching.provenance }] : []
        })
        if (!matches.length) continue // Only observed structured predicates become default candidates.
        result.push({ predicate: { ownerTrackableId: parent.descriptor.trackableId, fieldDescriptorId: field.descriptor.id, fieldTrackableId: field.descriptor.trackableId, optionId: option.id }, label: `${field.descriptor.name}: ${option.label}`, source: field.source, occurrences: matches, explicitNoByDate })
        structuredCount++
      }
    }
  }
  return result.map((event) => ({ ...event, occurrences: [...event.occurrences].sort((a, b) => a.day - b.day || a.provenance.recordId.localeCompare(b.provenance.recordId)) }))
}

function eventKey(predicate: EventPredicate): string { return key(predicate.ownerTrackableId, predicate.fieldDescriptorId ?? '', predicate.optionId ?? '') }

function eventDefinitions(events: readonly EventIndex[], policy: FeaturePolicy, targetTrackableId?: string): FeatureDefinition[] {
  if (!policy.families.includes('event')) return []
  const result: FeatureDefinition[] = []
  for (const event of events) {
    if (targetTrackableId === event.predicate.ownerTrackableId) continue
    const add = (statistic: Extract<FeatureTransformation, { kind: 'event' }>['statistic'], label: string, days?: number) => result.push({
      key: key('event', eventKey(event.predicate), statistic, days ?? ''), label, description: label,
      family: 'event', source: event.source,
      transformation: { kind: 'event', statistic, predicate: event.predicate, ...(days ? { days } : {}) },
      valueType: statistic === 'occurred-today' || statistic === 'post-window' ? 'boolean' : 'number',
    })
    add('occurred-today', `${event.label} — occurred today`)
    add('count-today', `${event.label} — count today`)
    add('days-since', `Days since ${event.label}`)
    for (const days of policy.eventCountDays) add('count-window', `${event.label} — count in previous ${days} days`, days)
    for (const days of policy.postEventDays) add('post-window', `${event.label} — within ${days} days after event`, days)
  }
  return result
}

function calendarDefinitions(policy: FeaturePolicy): FeatureDefinition[] {
  if (!policy.families.includes('calendar')) return []
  const definitions: FeatureDefinition[] = [{ key: 'calendar/weekend', label: 'Weekend', description: 'Whether the feature date is Saturday or Sunday.', family: 'calendar', transformation: { kind: 'calendar', statistic: 'weekend' }, valueType: 'boolean' }]
  for (const period of ['weekday', 'month', 'day-of-month'] as const) for (const component of ['sin', 'cos'] as const) definitions.push({
    key: key('calendar', period, component), label: `${period === 'weekday' ? 'Day of week' : period === 'month' ? 'Month' : 'Day of month'} — ${component}`,
    description: `Cyclic ${component} component for ${period}; use with its paired component.`, family: 'calendar',
    transformation: { kind: 'calendar', statistic: 'cyclic', period, component, pairKey: key('calendar', period) }, valueType: 'number',
  })
  return definitions
}

function latestValue(source: IndexedSource, date: string, availabilityCutoff?: string): IndexedCanonicalValue | undefined {
  const values = source.byDate.get(date)
  return availabilityCutoff ? values?.findLast((item) => item.availableAt <= availabilityCutoff) : values?.at(-1)
}

function lagCell(index: LongitudinalIndex, source: IndexedSource, date: string, transformation: Extract<FeatureTransformation, { kind: 'lag' }>, availabilityCutoff?: string): FeatureCell {
  const lagDate = localDate(dateNumber(date) - transformation.days)
  const found = latestValue(source, lagDate, availabilityCutoff)
  if (!found) return cell(null, missingForDate(index, source, lagDate, availabilityCutoff))
  const { value, provenance } = found
  if (transformation.encoding === 'binary') return typeof value.booleanValue === 'boolean' ? cell(value.booleanValue, 'observed', [provenance]) : cell(null, 'unavailable')
  if (transformation.encoding === 'category-indicator' || transformation.encoding === 'multi-indicator') {
    if (!value.categories) return cell(null, 'unavailable')
    const selected = value.categories.some((category) => canonicalOptionId(category.id) === transformation.optionId)
    return cell(selected, selected ? 'observed' : 'observed-zero', [provenance])
  }
  return value.numericValue === undefined ? cell(null, 'unavailable') : cell(value.numericValue, 'observed', [provenance])
}

function rollingCell(source: IndexedSource, date: string, transformation: Extract<FeatureTransformation, { kind: 'rolling' }>, availabilityCutoff?: string): FeatureCell {
  const end = dateNumber(date)
  const samples: { x: number; y: number; provenance: FeatureProvenance }[] = []
  for (let day = end - transformation.days + 1; day <= end; day++) {
    const found = latestValue(source, localDate(day), availabilityCutoff)
    if (found?.value.numericValue !== undefined) samples.push({ x: day, y: found.value.numericValue, provenance: found.provenance })
  }
  const provenance = samples.map((sample) => sample.provenance)
  const count = samples.length
  if (transformation.statistic === 'observed-count') return cell(count, count ? 'observed' : 'observed-zero', provenance, count)
  if (count < transformation.minimumObservations) return cell(null, 'insufficient-observations', provenance, count)
  const values = samples.map((sample) => sample.y)
  const mean = values.reduce((sum, value) => sum + value, 0) / count
  let result: number
  switch (transformation.statistic) {
    case 'mean': result = mean; break
    case 'min': result = Math.min(...values); break
    case 'max': result = Math.max(...values); break
    case 'standard-deviation': result = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1)); break
    case 'slope': {
      const meanX = samples.reduce((sum, sample) => sum + sample.x, 0) / count
      const varianceX = samples.reduce((sum, sample) => sum + (sample.x - meanX) ** 2, 0)
      result = varianceX ? samples.reduce((sum, sample) => sum + (sample.x - meanX) * (sample.y - mean), 0) / varianceX : 0
      break
    }
  }
  return cell(result, 'observed', provenance, count)
}

function lastIndexAtOrBefore(events: readonly EventOccurrence[], day: number): number {
  let low = 0; let high = events.length
  while (low < high) { const middle = Math.floor((low + high) / 2); if (events[middle].day <= day) low = middle + 1; else high = middle }
  return low - 1
}

function eventCell(event: EventIndex, date: string, transformation: Extract<FeatureTransformation, { kind: 'event' }>, availabilityCutoff?: string): FeatureCell {
  const day = dateNumber(date)
  const events = availabilityCutoff ? event.occurrences.filter((item) => item.availableAt <= availabilityCutoff) : event.occurrences
  const last = lastIndexAtOrBefore(events, day)
  const recent = last >= 0 ? events[last] : undefined
  if (transformation.statistic === 'days-since') return recent ? cell(day - recent.day, 'observed', [recent.provenance]) : cell(null, 'no-prior-event')
  if (transformation.statistic === 'post-window') {
    const matched = recent && day - recent.day <= transformation.days! ? recent : undefined
    return cell(Boolean(matched), matched ? 'observed' : 'no-recorded-event', matched ? [matched.provenance] : [])
  }
  const days = transformation.statistic === 'count-window' ? transformation.days! : 1
  const before = lastIndexAtOrBefore(events, day - days)
  const matches = events.slice(before + 1, last + 1)
  const explicitNoAt = event.explicitNoByDate.get(date)
  const emptyStatus = days === 1 && explicitNoAt && (!availabilityCutoff || explicitNoAt <= availabilityCutoff) ? 'explicit-no' : 'no-recorded-event'
  if (transformation.statistic === 'occurred-today') return cell(matches.length > 0, matches.length ? 'observed' : emptyStatus, matches.map((item) => item.provenance))
  return cell(matches.length, matches.length ? 'observed' : emptyStatus, matches.map((item) => item.provenance), matches.length)
}

function calendarCell(date: string, transformation: Extract<FeatureTransformation, { kind: 'calendar' }>): FeatureCell {
  const utc = new Date(`${date}T00:00:00Z`)
  const weekday = utc.getUTCDay()
  if (transformation.statistic === 'weekend') return cell(weekday === 0 || weekday === 6, 'observed')
  const period = transformation.period
  const cycle = period === 'weekday' ? { position: weekday, length: 7 } : period === 'month' ? { position: utc.getUTCMonth(), length: 12 } : { position: utc.getUTCDate() - 1, length: new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 0)).getUTCDate() }
  const angle = 2 * Math.PI * cycle.position / cycle.length
  return cell(transformation.component === 'sin' ? Math.sin(angle) : Math.cos(angle), 'observed')
}

/** One row represents information available by the end of that local date. */
export function generateFeatureFrame(data: TrendsData, request: FeatureGenerationRequest): LongitudinalFeatureFrame {
  const start = dateNumber(request.startDate); const end = dateNumber(request.endDate); const cutoff = dateNumber(request.asOfDate)
  if (start > end || end > cutoff) throw new Error('Feature dates must be ordered and cannot exceed asOfDate.')
  if (request.asOfTimestamp && !Number.isFinite(Date.parse(request.asOfTimestamp))) throw new Error('asOfTimestamp must be a valid timestamp.')
  const policy = policyFor(request.policy)
  const index = buildLongitudinalIndex(data, request.asOfDate, request.asOfTimestamp, request.trackableIds)
  const events = eventPredicates(index, policy)
  const eventByKey = new Map(events.map((event) => [eventKey(event.predicate), event]))
  const sourceById = new Map(index.sources.map((source) => [source.descriptor.id, source]))
  const candidates = [
    ...index.sources.flatMap((source) => valueDefinitions(index, source, policy, request.targetTrackableId)),
    ...eventDefinitions(events, policy, request.targetTrackableId),
    ...calendarDefinitions(policy),
  ]
  const catalog = candidates.slice(0, policy.maximumFeatures)
  const dates = Array.from({ length: end - start + 1 }, (_, offset) => localDate(start + offset))
  const rows = dates.map((date) => {
    const cells: Record<string, FeatureCell> = {}
    const availabilityCutoff = request.asOfTimestamp ? date === request.asOfDate ? request.asOfTimestamp : `${date}T23:59:59.999Z` : undefined
    for (const definition of catalog) {
      const transform = definition.transformation
      if (transform.kind === 'calendar') cells[definition.key] = calendarCell(date, transform)
      else if (transform.kind === 'event') {
        const event = eventByKey.get(eventKey(transform.predicate))
        cells[definition.key] = event ? eventCell(event, date, transform, availabilityCutoff) : cell(null, 'unavailable')
      } else {
        const source = sourceById.get(definition.source!.descriptorId)
        cells[definition.key] = !source ? cell(null, 'unavailable') : transform.kind === 'lag' ? lagCell(index, source, date, transform, availabilityCutoff) : rollingCell(source, date, transform, availabilityCutoff)
      }
    }
    return { date, asOfDate: date, cells }
  })
  return { dates, catalog, rows, omittedCandidateCount: candidates.length - catalog.length }
}

export async function generateFeatureFrameFromProvider(provider: Pick<AnalyticsProvider, 'loadTrendsData'>, request: FeatureGenerationRequest): Promise<LongitudinalFeatureFrame> {
  return generateFeatureFrame(await provider.loadTrendsData(), request)
}

/** Fixture diagnostic only; this has no UI or persistence dependency. */
export function formatFeatureFrame(frame: LongitudinalFeatureFrame, keys: readonly string[] = frame.catalog.map((item) => item.key)): string {
  const labels = new Map(frame.catalog.map((item) => [item.key, item.label]))
  const lines = [`date\t${keys.map((item) => labels.get(item) ?? item).join('\t')}`]
  for (const row of frame.rows) lines.push(`${row.date}\t${keys.map((item) => {
    const found = row.cells[item]
    if (!found) return '—'
    const value = found.value === null ? '∅' : String(found.value)
    const origins = found.provenance.map((source) => `${source.recordId}@v${source.trackableVersion}${source.mappingId ? `#${source.mappingId}` : ''}`).join(',')
    return `${value} [${found.missingness}${origins ? `; ${origins}` : ''}]`
  }).join('\t')}`)
  return lines.join('\n')
}

export function featureCatalog(frame: LongitudinalFeatureFrame, families?: readonly FeatureFamily[]): readonly FeatureDefinition[] {
  return families ? frame.catalog.filter((item) => families.includes(item.family)) : frame.catalog
}
