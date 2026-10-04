import type { InsightItem } from './insightFeed.ts'

export interface InsightPresentation { title: string; strength: string; support: string; context?: string; details: string }
const day = (date: string) => new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`))

export function presentInsight(item: InsightItem): InsightPresentation {
  if (item.kind === 'change-point') {
    const point = item.point
    const target = point.target.optionLabel ? `${point.target.optionLabel} (${point.target.label})` : point.target.label
    const direction = point.effect >= 0 ? 'higher' : 'lower'
    const nearby = point.nearbyEvents.slice(0, 2).map((event) => `${event.label} was recorded ${Math.abs(event.daysFromChange)} day${Math.abs(event.daysFromChange) === 1 ? '' : 's'} ${event.daysFromChange < 0 ? 'before' : 'after'} this shift.`).join(' ')
    return { title: `${target} has generally been ${direction} since around ${day(point.date)}.`, strength: 'Noticeable shift', support: `${point.preCount} earlier and ${point.postCount} later recorded values`, ...(nearby ? { context: nearby } : {}), details: `Compared recorded values from ${point.supportStart} through ${point.supportEnd}. The estimated shift date is approximate. Nearby events are shown only as timing context.` }
  }
  const c = item.candidate
  const family = item.family
  const target = c.target.optionLabel ? `${c.target.optionLabel} (${c.target.label})` : c.target.label
  const isBinary = c.target.kind === 'binary'
  const direction = family.direction === 'negative' ? (isBinary ? 'less common' : 'lower') : (isBinary ? 'more common' : 'higher')
  const source = family.sourceLabel
  const context = family.broadFamily === 'value-level' ? `during periods when ${source} was higher`
    : family.broadFamily === 'value-variability' ? `when ${source} varied more`
    : family.broadFamily === 'value-trend' ? `when ${source} was rising faster`
    : family.broadFamily === 'binary-state' ? `when ${source} was Yes`
    : family.broadFamily === 'option-presence' ? `when ${source} was selected`
    : family.broadFamily === 'event-frequency' ? `when ${source} was recorded more often`
    : family.broadFamily === 'event-proximity' ? `around recorded ${source} events`
    : family.broadFamily === 'weekend' ? 'on weekends' : `alongside ${source}`
  const title = `${target} tended to be ${direction} ${context}.`
  const support = c.support.eventEpisodes ? `Across ${c.support.eventEpisodes} event episodes · ${c.support.sampleSize} recorded comparisons` : `${c.support.sampleSize} recorded comparisons${c.support.firstDate && c.support.lastDate ? ` · ${day(c.support.firstDate)}–${day(c.support.lastDate)}` : ''}`
  const later = c.folds.length && c.stability.foldWinRate >= .6 ? 'This pattern also held up on later recorded dates.' : 'Later-date checks were mixed.'
  const regime = c.currentRegimeSupport ? ` ${c.currentRegimeSupport.sampleSize} comparisons are in the current period.` : ''
  const strength = c.strength === 'strong' ? 'Strong pattern' : c.strength === 'moderate' ? 'Moderate pattern' : c.strength === 'weak' ? 'Weak pattern' : 'No longer supported by screening'
  const temporal = family.temporalSummary ? `The clearest signal appeared ${family.temporalSummary}.` : undefined
  const variants = family.members.length > 1 ? `Trace also checked ${family.members.length - 1} related timing or summary variants; ${c.predictor.label} was the strongest defensible representative.` : `The strongest technical check was ${c.predictor.label}.`
  return { title, strength, support, ...(temporal ? { context: temporal } : {}), details: `${variants} ${later}${regime} Only usable recorded comparisons count; an unrecorded response is not treated as No.` }
}
