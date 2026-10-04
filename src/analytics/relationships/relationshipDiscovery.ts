import type { AnalyticsProvider, TrendsData } from '../AnalyticsProvider.ts'
import { analysisSeriesOptions, buildAnalysisTrack, type AnalysisSeriesDescriptor, type AnalysisValue } from '../analysisModel.ts'
import { generateFeatureFrame } from '../features/featureEngine.ts'
import { snapshotForFeatureCutoff } from '../features/longitudinalIndex.ts'
import type { FeatureDefinition, FeatureMissingness, LongitudinalFeatureFrame } from '../features/featureTypes.ts'
import { detectTargetChangePoints, linkNearbyEvents, type ContextEvent, type TargetSeriesPoint } from './changePoints.ts'
import { pearson, spearman, validationSummary, walkForward, type AlignedPoint } from './temporalValidation.ts'
import type { RelationshipCandidate, RelationshipCatalog, RelationshipPolicy, RelationshipRequest, RelationshipStrength, RelationshipSupport, RelationshipTarget, ScreeningReason, TargetChangePoint, TargetRegime } from './relationshipTypes.ts'

export const defaultRelationshipPolicy: RelationshipPolicy = {
  minimumUsable: 30, minimumClassCases: 8, minimumCategoryCases: 8, minimumEventOccurrences: 3, minimumEventEpisodes: 3,
  minimumTraining: 18, minimumValidation: 6, minimumFolds: 3, maximumFolds: 5,
  minimumImprovement: .02, moderateImprovement: .08, strongImprovement: .16, minimumStandardizedEffect: .1, moderateStandardizedEffect: .2, strongStandardizedEffect: .3,
  minimumFoldWinRate: .6, minimumEffectConsistency: .2,
  redundancyCorrelation: .96, minimumChangeSide: 15, minimumChangeEffect: .8, minimumBinaryRateShift: .25, nearbyEventDays: 7,
}
const canonicalOptionId = (id: string): string => id.startsWith('option:') ? id.slice('option:'.length) : id

function policyFor(request: RelationshipRequest): RelationshipPolicy {
  const policy = { ...defaultRelationshipPolicy, ...request.relationshipPolicy }
  for (const key of ['minimumUsable', 'minimumClassCases', 'minimumCategoryCases', 'minimumEventOccurrences', 'minimumEventEpisodes', 'minimumTraining', 'minimumValidation', 'minimumFolds', 'maximumFolds', 'minimumChangeSide', 'nearbyEventDays'] as const) {
    if (!Number.isInteger(policy[key]) || policy[key] < (key === 'nearbyEventDays' ? 0 : 1)) throw new Error(`Invalid relationship policy: ${key}`)
  }
  if (policy.maximumFolds < policy.minimumFolds) throw new Error('maximumFolds must be at least minimumFolds.')
  for (const key of ['minimumImprovement', 'moderateImprovement', 'strongImprovement', 'minimumStandardizedEffect', 'moderateStandardizedEffect', 'strongStandardizedEffect', 'minimumFoldWinRate', 'minimumEffectConsistency', 'redundancyCorrelation', 'minimumChangeEffect', 'minimumBinaryRateShift'] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0) throw new Error(`Invalid relationship policy: ${key}`)
  }
  for (const key of ['minimumImprovement', 'moderateImprovement', 'strongImprovement', 'minimumStandardizedEffect', 'moderateStandardizedEffect', 'strongStandardizedEffect', 'minimumFoldWinRate', 'minimumEffectConsistency', 'redundancyCorrelation', 'minimumBinaryRateShift'] as const) {
    if (policy[key] > 1) throw new Error(`Relationship policy must be at most 1: ${key}`)
  }
  if (policy.minimumImprovement > policy.moderateImprovement || policy.moderateImprovement > policy.strongImprovement
    || policy.minimumStandardizedEffect > policy.moderateStandardizedEffect || policy.moderateStandardizedEffect > policy.strongStandardizedEffect) throw new Error('Relationship strength thresholds must increase by tier.')
  return policy
}

function targetOutcomes(descriptor: AnalysisSeriesDescriptor, values: readonly AnalysisValue[]): RelationshipTarget[] {
  const base = { descriptorId: descriptor.id, trackableId: descriptor.trackableId, ...(descriptor.ownerTrackableId ? { ownerTrackableId: descriptor.ownerTrackableId } : {}), label: descriptor.name, measurementType: descriptor.measurementType }
  if (['continuous', 'count', 'duration', 'time'].includes(descriptor.measurementType)) return [{ ...base, kind: 'numeric' }]
  if (descriptor.measurementType === 'ordinal') return [{ ...base, kind: 'ordinal' }]
  if (descriptor.measurementType === 'binary' || descriptor.measurementType === 'event') return [{ ...base, kind: 'binary' }]
  const options = new Map(values.flatMap((value) => value.categories ?? []).map((option) => [canonicalOptionId(option.id), option.label]))
  return [...options].sort(([a], [b]) => a.localeCompare(b)).map(([optionId, optionLabel]) => ({ ...base, kind: 'binary', optionId, optionLabel }))
}

function outcomesByDate(data: TrendsData, descriptor: AnalysisSeriesDescriptor, values: readonly AnalysisValue[], target: RelationshipTarget, request: RelationshipRequest): Map<string, { value: number; mapped: boolean }> {
  const records = new Map(data.logRecords.map((record) => [record.id, record]))
  const observations = new Map(data.observations.map((observation) => [observation.id, observation]))
  const selected = new Map<string, { value: number; mapped: boolean; order: string }>()
  for (const item of values) {
    if (item.localDate < request.startDate || item.localDate > request.endDate) continue
    const observation = observations.get(item.id)
    const record = records.get(observation?.logRecordId ?? item.id)
    if (!record) continue
    if (request.asOfTimestamp && [record.createdAt, record.updatedAt, observation?.createdAt, observation?.updatedAt].some((stamp) => stamp && stamp > `${item.localDate}T23:59:59.999Z`)) continue
    const outcome = target.optionId ? Number(Boolean(item.categories?.some((category) => canonicalOptionId(category.id) === target.optionId)))
      : descriptor.measurementType === 'event' ? 1 : item.booleanValue === undefined ? item.numericValue : Number(item.booleanValue)
    if (outcome === undefined || !Number.isFinite(outcome)) continue
    const order = record.startTime ?? observation?.createdAt ?? record.createdAt
    const old = selected.get(item.localDate)
    if (!old || old.order <= order) selected.set(item.localDate, { value: outcome, mapped: Boolean(item.analysisMappingId), order })
  }
  if (descriptor.measurementType === 'event') for (const assertion of data.trackableDailyAssertions) {
    if (assertion.trackableId !== descriptor.trackableId || assertion.status !== 'did_not_occur' || assertion.date < request.startDate || assertion.date > request.endDate || selected.has(assertion.date)) continue
    selected.set(assertion.date, { value: 0, mapped: false, order: assertion.recordedAt })
  }
  return new Map([...selected].map(([date, item]) => [date, { value: item.value, mapped: item.mapped }]))
}

function contexts(data: TrendsData, frame: LongitudinalFeatureFrame): ContextEvent[] {
  const events = new Map<string, ContextEvent>()
  const records = new Map(data.logRecords.filter((record) => record.recordKind === 'quick_log').map((record) => [record.id, record]))
  for (const record of records.values()) {
    if (!record.trackableId) continue
    const definition = data.trackableVersions.find((version) => version.trackableId === record.trackableId && version.version === record.trackableVersion)
    events.set(record.id, { recordId: record.id, date: record.localDate, ownerTrackableId: record.trackableId, label: definition?.name ?? record.trackableId })
  }
  const observations = new Map(data.observations.map((item) => [item.id, item]))
  for (const descriptor of analysisSeriesOptions(data).filter((item) => item.ownerTrackableId)) {
    const track = buildAnalysisTrack(data, descriptor, 'all', frame.dates.at(-1) ?? '9999-12-31')
    for (const value of track.values) {
      const record = records.get(observations.get(value.id)?.logRecordId ?? '')
      if (!record) continue
      for (const category of value.categories ?? []) {
        const optionId = canonicalOptionId(category.id)
        const predicate = { ownerTrackableId: descriptor.ownerTrackableId!, fieldDescriptorId: descriptor.id, fieldTrackableId: descriptor.trackableId, optionId }
        events.set(`${record.id}/${descriptor.id}/${optionId}`, { recordId: record.id, date: record.localDate, ownerTrackableId: descriptor.ownerTrackableId!, label: `${descriptor.name}: ${category.label}`, predicate })
      }
    }
  }
  return [...events.values()]
}

function eventSupport(frame: LongitudinalFeatureFrame, definition: FeatureDefinition, startDate?: string): { count: number; episodes: number } {
  if (definition.transformation.kind !== 'event') return { count: 0, episodes: 0 }
  const predicate = definition.transformation.predicate
  const occurrence = frame.catalog.find((item) => item.transformation.kind === 'event' && item.transformation.statistic === 'occurred-today' && JSON.stringify(item.transformation.predicate) === JSON.stringify(predicate))
  if (!occurrence) return { count: 0, episodes: 0 }
  const events = new Map<string, string>()
  for (const row of frame.rows) {
    if (startDate && row.date < startDate) continue
    for (const provenance of row.cells[occurrence.key]?.provenance ?? []) events.set(provenance.recordId, row.date)
  }
  const days = [...new Set(events.values())].sort().map((date) => Date.parse(`${date}T00:00:00Z`) / 86_400_000)
  return { count: events.size, episodes: days.filter((day, index) => index === 0 || day - days[index - 1] > 1).length }
}

function support(points: readonly AlignedPoint[], totalOutcomeDates: number, binaryTarget: boolean, event?: { count: number; episodes: number }): RelationshipSupport {
  const predictorStatusCounts: Partial<Record<FeatureMissingness, number>> = {}
  for (const point of points) if (point.predictorStatus) predictorStatusCounts[point.predictorStatus] = (predictorStatusCounts[point.predictorStatus] ?? 0) + 1
  return { sampleSize: points.length, firstDate: points[0]?.date ?? null, lastDate: points.at(-1)?.date ?? null,
    missingnessRate: totalOutcomeDates ? 1 - points.length / totalOutcomeDates : 1, mappedHistoricalValues: points.some((point) => point.mapped),
    predictorStatusCounts, ...(binaryTarget ? { targetPositiveCount: points.filter((point) => point.y === 1).length, targetNegativeCount: points.filter((point) => point.y === 0).length } : {}),
    ...(event ? { eventCount: event.count, eventEpisodes: event.episodes, targetObservations: points.length } : {}) }
}

function association(points: readonly AlignedPoint[], target: RelationshipTarget, definition: FeatureDefinition): { method: RelationshipCandidate['rawAssociation']['method']; value: number | null; effect: number | null; standardized: number | null } {
  const x = points.map((point) => point.x); const y = points.map((point) => point.y)
  const binaryX = definition.valueType === 'boolean'
  const method = target.kind === 'ordinal' || definition.valueType === 'ordinal-rank' ? 'spearman' : target.kind === 'binary' && binaryX ? 'rate-difference' : target.kind === 'binary' ? 'point-biserial' : binaryX ? 'pearson' : 'spearman'
  const correlation = method === 'spearman' ? spearman(x, y) : pearson(x, y)
  const ones = points.filter((point) => point.x === 1); const zeros = points.filter((point) => point.x === 0)
  const difference = ones.length && zeros.length ? ones.reduce((sum, point) => sum + point.y, 0) / ones.length - zeros.reduce((sum, point) => sum + point.y, 0) / zeros.length : null
  const centerX = x.reduce((sum, value) => sum + value, 0) / x.length
  const centerY = y.reduce((sum, value) => sum + value, 0) / y.length
  const variance = x.reduce((sum, value) => sum + (value - centerX) ** 2, 0)
  const slope = variance ? x.reduce((sum, value, index) => sum + (value - centerX) * (y[index] - centerY), 0) / variance : null
  return { method, value: method === 'rate-difference' ? difference : correlation, effect: target.kind === 'ordinal' ? correlation : binaryX ? difference : slope, standardized: correlation }
}

function strength(improvement: number, foldWinRate: number, consistency: number, effectConsistency: number, standardizedEffect: number, sampleSize: number, policy: RelationshipPolicy): RelationshipStrength {
  if (improvement < policy.minimumImprovement || foldWinRate < policy.minimumFoldWinRate || consistency < .67 || effectConsistency < policy.minimumEffectConsistency || standardizedEffect < policy.minimumStandardizedEffect) return 'insufficient'
  if (improvement >= policy.strongImprovement && standardizedEffect >= policy.strongStandardizedEffect && sampleSize >= policy.minimumUsable * 2 && foldWinRate >= .8 && consistency >= .8 && effectConsistency >= .5) return 'strong'
  if (improvement >= policy.moderateImprovement && standardizedEffect >= policy.moderateStandardizedEffect && sampleSize >= policy.minimumUsable && foldWinRate >= .67) return 'moderate'
  return 'weak'
}

function temporalQualifier(definition: FeatureDefinition): string {
  const transform = definition.transformation
  if (transform.kind === 'lag') return `${transform.days} day${transform.days === 1 ? '' : 's'} earlier`
  if (transform.kind === 'rolling') return `previous ${transform.days} days`
  if (transform.kind === 'event') return transform.days ? `${transform.days}-day ${transform.statistic}` : transform.statistic
  return transform.period ?? 'calendar'
}

function similar(a: RelationshipCandidate, b: RelationshipCandidate, frame: LongitudinalFeatureFrame, policy: RelationshipPolicy): boolean {
  if (a.target.descriptorId !== b.target.descriptorId || a.target.optionId !== b.target.optionId || a.predictor.family !== b.predictor.family || a.predictor.source?.descriptorId !== b.predictor.source?.descriptorId) return false
  const left = a.predictor.transformation; const right = b.predictor.transformation
  if (left.kind === 'calendar' || right.kind === 'calendar') return false
  if (left.kind === 'lag' && right.kind === 'lag' && (left.encoding !== right.encoding || left.optionId !== right.optionId)) return false
  if (left.kind === 'event' && right.kind === 'event' && JSON.stringify(left.predicate) !== JSON.stringify(right.predicate)) return false
  const daysA = 'days' in left ? left.days ?? 1 : 1
  const daysB = 'days' in right ? right.days ?? 1 : 1
  if (Math.max(daysA, daysB) / Math.min(daysA, daysB) > 2) return false
  const paired = frame.rows.flatMap((row) => {
    const x = row.cells[a.predictor.key]?.value; const y = row.cells[b.predictor.key]?.value
    return x === null || x === undefined || y === null || y === undefined ? [] : [[Number(x), Number(y)]]
  })
  return paired.length >= policy.minimumUsable && Math.abs(pearson(paired.map((pair) => pair[0]), paired.map((pair) => pair[1])) ?? 0) >= policy.redundancyCorrelation
}

/** Read-only target-scoped discovery. All predictor cells come from one generated feature frame. */
export function discoverRelationships(input: TrendsData, request: RelationshipRequest): RelationshipCatalog {
  const policy = policyFor(request)
  const data = snapshotForFeatureCutoff(input, request.asOfDate, request.asOfTimestamp)
  const descriptor = analysisSeriesOptions(data).find((item) => item.id === request.targetDescriptorId)
  if (!descriptor) throw new Error(`Unknown analysis target: ${request.targetDescriptorId}`)
  const selectedSources = request.sourceTrackableIds ? [...new Set([...request.sourceTrackableIds, descriptor.trackableId])] : undefined
  const frame = generateFeatureFrame(data, { startDate: request.startDate, endDate: request.endDate, asOfDate: request.asOfDate,
    ...(request.asOfTimestamp ? { asOfTimestamp: request.asOfTimestamp } : {}), ...(selectedSources ? { trackableIds: selectedSources } : {}),
    targetTrackableId: descriptor.trackableId, policy: { ...request.policy, ...(request.featureFamilies ? { families: request.featureFamilies } : {}) } })
  const track = buildAnalysisTrack(data, descriptor, 'all', request.asOfDate)
  const targets = targetOutcomes(descriptor, track.values)
  const candidates: RelationshipCandidate[] = []
  const changePoints: TargetChangePoint[] = []
  const regimes: Record<string, readonly TargetRegime[]> = {}
  let alignedPairCount = 0
  for (const target of targets) {
    const outcome = outcomesByDate(data, descriptor, track.values, target, request)
    const targetId = `${encodeURIComponent(target.descriptorId)}/${encodeURIComponent(target.optionId ?? '')}`
    const series: TargetSeriesPoint[] = [...outcome].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value }))
    const detected = detectTargetChangePoints(target, series, [], policy)
    changePoints.push(...detected.changePoints)
    regimes[targetId] = detected.regimes
    const currentStart = detected.regimes.at(-1)?.startDate
    const regimeStart = currentStart ?? request.startDate
    for (const predictor of frame.catalog) {
      if (request.sourceTrackableIds && predictor.source && !request.sourceTrackableIds.includes(predictor.source.trackableId) && !request.sourceTrackableIds.includes(predictor.source.ownerTrackableId ?? '')) continue
      // Same-day target values must not enter through a generated predictor.
      if (predictor.source?.trackableId === descriptor.trackableId && predictor.transformation.kind !== 'lag') continue
      const points: AlignedPoint[] = frame.rows.flatMap((row) => {
        const y = outcome.get(row.date); const cell = row.cells[predictor.key]
        return !y || !cell || cell.value === null || !Number.isFinite(Number(cell.value)) ? [] : [{ date: row.date, x: Number(cell.value), y: y.value,
          mapped: y.mapped || cell.provenance.some((source) => Boolean(source.mappingId)), predictorStatus: cell.missingness }]
      })
      alignedPairCount += points.length
      const events = predictor.family === 'event' ? eventSupport(frame, predictor) : undefined
      const full = support(points, outcome.size, target.kind === 'binary', events)
      const currentPoints = detected.changePoints.length ? points.filter((point) => point.date >= regimeStart) : []
      const current = currentPoints.length ? support(currentPoints, [...outcome.keys()].filter((date) => date >= regimeStart).length, target.kind === 'binary', events ? eventSupport(frame, predictor, regimeStart) : undefined) : undefined
      const currentFolds = request.evaluateCurrentRegime && currentPoints.length >= policy.minimumUsable ? walkForward(currentPoints, target.kind, policy) : []
      const currentValidation = currentFolds.length >= policy.minimumFolds ? validationSummary(currentFolds) : null
      const stats = points.length > 1 ? association(points, target, predictor) : { method: 'pearson' as const, value: null, effect: null, standardized: null }
      const xValues = new Set(points.map((point) => point.x))
      const positives = points.filter((point) => point.y === 1).length
      let reason: ScreeningReason | undefined
      if (points.length < policy.minimumUsable) reason = 'insufficient-history'
      else if (target.kind === 'binary' && Math.min(positives, points.length - positives) < (target.optionId ? policy.minimumCategoryCases : policy.minimumClassCases)) reason = target.optionId ? 'insufficient-category-support' : 'insufficient-classes'
      else if (events && (events.count < policy.minimumEventOccurrences || events.episodes < policy.minimumEventEpisodes)) reason = 'sparse-event'
      else if (xValues.size < 2) reason = 'constant-predictor'
      const folds = reason ? [] : walkForward(points, target.kind, policy)
      if (!reason && folds.length < policy.minimumFolds) reason = 'insufficient-folds'
      const validation = validationSummary(folds)
      if (!reason && (!validation || validation.improvement < policy.minimumImprovement)) reason = 'no-improvement'
      else if (!reason && Math.abs(stats.standardized ?? 0) < policy.minimumStandardizedEffect) reason = 'negligible-effect'
      else if (!reason && validation && (validation.winRate < policy.minimumFoldWinRate || validation.directionConsistency < .67 || validation.effectConsistency < policy.minimumEffectConsistency)) reason = 'unstable'
      const tier = reason || !validation ? 'insufficient' : strength(validation.improvement, validation.winRate, validation.directionConsistency, validation.effectConsistency, Math.abs(stats.standardized ?? 0), points.length, policy)
      const direction = stats.effect === null || Math.abs(stats.effect) < 1e-10 ? 'none' : stats.effect > 0 ? 'positive' : 'negative'
      candidates.push({ id: `relationship/${targetId}/${encodeURIComponent(predictor.key)}`, target, predictor, status: reason ? 'screened_out' : tier === 'weak' ? 'observed' : 'candidate', ...(reason ? { reason } : {}), strength: tier,
        support: full, rawAssociation: { method: stats.method, value: stats.value }, effectDirection: direction,
        effectMagnitude: stats.effect, standardizedEffect: stats.standardized, primaryMetric: target.kind === 'binary' ? 'brier' : target.kind === 'ordinal' ? 'ordinal-brier' : 'mae',
        baselineScore: validation?.baseline ?? null, validationScore: !reason && validation ? validation.candidate : null,
        improvement: validation?.improvement ?? null,
        stability: { foldWinRate: validation?.winRate ?? 0, directionConsistency: validation?.directionConsistency ?? 0, effectConsistency: validation?.effectConsistency ?? 0 },
        folds, ...(current ? { currentRegimeSupport: current } : {}), ...(currentValidation ? { currentRegimeValidation: { folds: currentFolds, baselineScore: currentValidation.baseline, candidateScore: currentValidation.candidate, improvement: currentValidation.improvement } } : {}), changePointIds: detected.changePoints.map((point) => point.id),
        explanation: { targetLabel: target.optionLabel ? `${target.label}: ${target.optionLabel}` : target.label, predictorLabel: predictor.label, temporalQualifier: temporalQualifier(predictor), direction, magnitude: stats.effect, supportCount: points.length, validationConfidence: tier },
        alignedDates: points.map((point) => point.date) })
    }
  }
  const tierRank: Record<RelationshipStrength, number> = { insufficient: 0, weak: 1, moderate: 2, strong: 3 }
  const ordered = [...candidates].sort((a, b) => tierRank[b.strength] - tierRank[a.strength]
    || (b.improvement ?? -Infinity) - (a.improvement ?? -Infinity)
    || b.stability.foldWinRate - a.stability.foldWinRate || a.id.localeCompare(b.id))
  const surfaced: RelationshipCandidate[] = []
  for (const candidate of ordered) {
    if (candidate.status === 'screened_out') continue
    const representative = surfaced.find((other) => similar(candidate, other, frame, policy))
    if (representative) { candidate.status = 'screened_out'; candidate.reason = 'redundant'; candidate.suppressedBy = representative.id; candidate.strength = 'insufficient'; candidate.validationScore = null }
    else surfaced.push(candidate)
  }
  const contextualChanges = changePoints.length ? linkNearbyEvents(changePoints, contexts(data, frame), policy) : changePoints
  return { targetDescriptorId: descriptor.id, candidates: [...candidates].sort((a, b) => a.id.localeCompare(b.id)), ranked: surfaced, changePoints: contextualChanges, regimes,
    diagnostics: { featureCount: frame.catalog.length, targetOutcomeCount: targets.length, alignedPairCount, omittedFeatureCount: frame.omittedCandidateCount } }
}

export async function discoverRelationshipsFromProvider(provider: Pick<AnalyticsProvider, 'loadTrendsData'>, request: RelationshipRequest): Promise<RelationshipCatalog> {
  return discoverRelationships(await provider.loadTrendsData(), request)
}

export function filterRelationshipCandidates(catalog: RelationshipCatalog, minimum: RelationshipStrength = 'weak'): readonly RelationshipCandidate[] {
  const order: RelationshipStrength[] = ['insufficient', 'weak', 'moderate', 'strong']
  return catalog.ranked.filter((candidate) => order.indexOf(candidate.strength) >= order.indexOf(minimum))
}

export function formatRelationshipDiagnostics(candidate: RelationshipCandidate): string {
  const lines = [`${candidate.target.label} <- ${candidate.predictor.label}`, `id=${candidate.id} status=${candidate.status}${candidate.reason ? ` reason=${candidate.reason}` : ''}`,
    `dates=${candidate.support.firstDate ?? 'none'}..${candidate.support.lastDate ?? 'none'} n=${candidate.support.sampleSize} missing=${candidate.support.missingnessRate.toFixed(3)}`,
    `association=${candidate.rawAssociation.method}:${candidate.rawAssociation.value ?? 'none'} baseline=${candidate.baselineScore ?? 'none'} candidate=${candidate.validationScore ?? 'none'} improvement=${candidate.improvement ?? 'none'}`,
    `stability=${candidate.stability.foldWinRate.toFixed(3)}/${candidate.stability.directionConsistency.toFixed(3)} changes=${candidate.changePointIds.join(',') || 'none'}`,
    `alignedDates=${candidate.alignedDates.join(',') || 'none'}`]
  for (const fold of candidate.folds) lines.push(`fold ${fold.trainStart}..${fold.trainEnd} -> ${fold.validationStart}..${fold.validationEnd} baseline=${fold.baselineScore} candidate=${fold.candidateScore} improvement=${fold.improvement}`)
  return lines.join('\n')
}
