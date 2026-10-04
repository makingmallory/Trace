import type { TrendsData } from '../AnalyticsProvider.ts'
import { buildRuleAnswers, evaluateConditionalRule } from '../../domain/checkin/conditionalRules.ts'

export interface RoutineCoverage {
  routineQuestion: boolean
  expectedQuestion: boolean
  eligibleDays: number
  answeredDays: number
  ineligibleDays: number
  unknownEligibilityDays: number
  eligibleButUnansweredDays: number
  coverage: number | null
  routinelyAnswered: boolean
}

/** A completed-check-in denominator avoids treating days without a check-in as question refusals. */
export const insightCoveragePolicy = { minimumEligibleDays: 14, routinelyAnsweredFraction: .8 } as const

function weekday(date: string): number { const [year, month, day] = date.split('-').map(Number); return new Date(year, month - 1, day).getDay() }

export function routineCoverage(data: TrendsData, trackableId: string, policy = insightCoveragePolicy): RoutineCoverage {
  const items = (data.routineItems ?? []).filter((item) => item.target.kind === 'trackable' && item.target.trackableId === trackableId)
  const base = { routineQuestion: items.length > 0, expectedQuestion: items.some((item) => item.completionBehavior === 'expected') }
  let eligibleDays = 0; let answeredDays = 0; let ineligibleDays = 0; let unknownEligibilityDays = 0
  const byRecord = new Map<string, typeof data.observations[number][]>()
  for (const observation of data.observations) if (!observation.deletedAt) byRecord.set(observation.logRecordId, [...(byRecord.get(observation.logRecordId) ?? []), observation])
  const selectionsByObservation = new Map<string, typeof data.observationSelections[number][]>()
  for (const selection of data.observationSelections) if (!selection.deletedAt) selectionsByObservation.set(selection.observationId, [...(selectionsByObservation.get(selection.observationId) ?? []), selection])
  for (const record of data.logRecords) {
    if (record.deletedAt || record.recordKind !== 'routine' || record.status !== 'completed' || !record.routineId) continue
    const item = items.find((entry) => entry.routineId === record.routineId && entry.enabled && entry.createdAt <= record.createdAt && (!entry.deletedAt || entry.deletedAt > record.createdAt) && (entry.frequency === 'every_day' || (entry.weekdays ?? []).includes(weekday(record.localDate))))
    if (!item) continue
    const observations = byRecord.get(record.id) ?? []
    const answers = buildRuleAnswers(observations, observations.flatMap((observation) => selectionsByObservation.get(observation.id) ?? []))
    if (item.conditionalRule) {
      const source = answers.get(item.conditionalRule.sourceTrackableId)
      if (!source || source.answer.state !== 'answered') { unknownEligibilityDays++; continue }
      if (!evaluateConditionalRule(item.conditionalRule, answers)) { ineligibleDays++; continue }
    }
    eligibleDays++
    if (observations.some((observation) => observation.trackableId === trackableId && observation.answer.state === 'answered')) answeredDays++
  }
  const coverage = eligibleDays ? answeredDays / eligibleDays : null
  return { ...base, eligibleDays, answeredDays, ineligibleDays, unknownEligibilityDays, eligibleButUnansweredDays: eligibleDays - answeredDays,
    coverage, routinelyAnswered: eligibleDays >= policy.minimumEligibleDays && coverage !== null && coverage >= policy.routinelyAnsweredFraction }
}
