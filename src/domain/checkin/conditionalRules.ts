import type { ConditionalRule, JsonValue, Observation, ObservationAnswer, ObservationOptionSelection } from '../models/index.ts'

export interface RuleAnswer {
  answer: ObservationAnswer
  selectedOptionIds: readonly string[]
  source: 'stored' | 'presentation'
}

function comparableValue(answer: RuleAnswer): JsonValue | readonly string[] | undefined {
  if (answer.answer.state !== 'answered') return undefined
  const value = answer.answer.value
  if (value.kind === 'choice') return answer.selectedOptionIds
  return value.value
}

export function evaluateConditionalRule(
  rule: ConditionalRule | undefined,
  answers: ReadonlyMap<string, RuleAnswer>,
): boolean {
  if (!rule) return true
  const answer = answers.get(rule.sourceTrackableId)
  const value = answer ? comparableValue(answer) : undefined
  if (rule.operator === 'isAnswered') return value !== undefined
  if (value === undefined) return false

  const expected = rule.expectedValue
  switch (rule.operator) {
    case 'equals':
      return Array.isArray(value) ? value.includes(String(expected)) : value === expected
    case 'notEquals':
      return Array.isArray(value) ? !value.includes(String(expected)) : value !== expected
    case 'greaterThan':
      return typeof value === 'number' && typeof expected === 'number' && value > expected
    case 'lessThan':
      return typeof value === 'number' && typeof expected === 'number' && value < expected
    case 'contains':
      return Array.isArray(value)
        ? value.includes(String(expected))
        : typeof value === 'string' && typeof expected === 'string' && value.includes(expected)
    case 'anyOf':
      return Array.isArray(expected) && (
        Array.isArray(value)
          ? expected.some((candidate) => value.includes(String(candidate)))
          : expected.includes(value)
      )
    case 'containsAny':
      return Array.isArray(value) && Array.isArray(expected)
        && expected.some((candidate) => value.includes(String(candidate)))
  }
}

export function buildRuleAnswers(
  observations: readonly Observation[],
  selections: readonly ObservationOptionSelection[],
): ReadonlyMap<string, RuleAnswer> {
  return new Map(observations.filter((item) => !item.deletedAt).map((observation) => [
    observation.trackableId,
    {
      answer: observation.answer,
      selectedOptionIds: selections
        .filter((selection) => selection.observationId === observation.id && !selection.deletedAt)
        .map((selection) => selection.optionId),
      source: 'stored',
    },
  ]))
}

export function buildEffectiveRuleAnswers(
  observations: readonly Observation[],
  selections: readonly ObservationOptionSelection[],
  presentationAnswers: Readonly<Record<string, { answer: Observation['answer']; selectedOptionIds?: readonly string[] }>>,
): ReadonlyMap<string, RuleAnswer> {
  const effective = new Map(buildRuleAnswers(observations, selections))
  for (const [trackableId, saved] of Object.entries(presentationAnswers)) {
    if (effective.has(trackableId)) continue
    effective.set(trackableId, {
      answer: saved.answer,
      selectedOptionIds: [...new Set(saved.selectedOptionIds ?? [])],
      source: 'presentation',
    })
  }
  return effective
}
