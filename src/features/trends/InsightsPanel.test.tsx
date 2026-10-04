import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { RelationshipCandidate, TargetChangePoint } from '../../analytics/relationships/relationshipTypes.ts'
import { groupRelationshipFamilies } from '../../analytics/insights/insightFamilies.ts'
import { InsightCard, InsightsPanel } from './InsightsPanel.tsx'
import { TrendsScreen } from './TrendsScreen.tsx'

const candidate = { id: 'relationship/energy//sleep-lag', target: { descriptorId: 'energy', trackableId: 'energy', label: 'Energy', kind: 'numeric' }, predictor: { key: 'sleep-lag', label: 'Sleep — 1 day ago', description: 'Sleep recorded one day before.', source: { descriptorId: 'sleep', trackableId: 'sleep' }, transformation: { kind: 'lag', days: 1 }, valueType: 'number' }, strength: 'moderate', support: { sampleSize: 50, firstDate: '2026-01-01', lastDate: '2026-03-01' }, effectDirection: 'positive', improvement: .2, stability: { foldWinRate: .8 }, folds: [] } as unknown as RelationshipCandidate
const point = { id: 'change/energy//2026-02-01', target: candidate.target, date: '2026-02-01', effect: 1, strength: 5, preCount: 30, postCount: 30, supportStart: '2026-01-01', supportEnd: '2026-03-01', nearbyEvents: [] } as unknown as TargetChangePoint
const family = groupRelationshipFamilies([{ targetDescriptorId: 'energy', candidates: [candidate], ranked: [candidate], changePoints: [], regimes: {}, diagnostics: { featureCount: 1, targetOutcomeCount: 1, alignedPairCount: 50, omittedFeatureCount: 0 } }])[0]
const noop = () => undefined

describe('Trends Insights markup', () => {
  it('shows only Explore and Insights top-level navigation', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TrendsScreen /></MemoryRouter>)
    expect(html).toContain('Explore</button>'); expect(html).toContain('Insights</button>')
    expect(html).not.toContain('Forecast')
    expect(html).toContain('aria-current="page"')
  })
  it('shows a restrained loading state before discovery returns', () => {
    const html = renderToStaticMarkup(<InsightsPanel data={null} onExplore={noop} />)
    expect(html).toContain('Looking for patterns…')
    expect(html).toContain('role="status"')
  })
  it('renders the five review judgments, confidence choices, detail disclosure and Explore handoff', () => {
    const html = renderToStaticMarkup(<InsightCard item={{ kind: 'relationship', identity: family.identity, family, candidate }} onSave={noop} onRemove={noop} onExplore={noop} />)
    for (const label of ['Yes', 'Probably', 'I don’t know', 'Probably not', 'No', 'Low', 'Medium', 'High']) expect(html).toContain(label)
    expect(html).toContain('Save review'); expect(html).toContain('disabled=""')
    expect(html).toContain('View in Explore'); expect(html).toContain('Why am I seeing this?')
    expect(html).toContain('Moderate pattern')
    expect(html).toContain('Does this connection fit your experience?')
  })
  it('renders reviewed edit/reset controls and change-point language', () => {
    const review = { id: 'saved', relationshipIdentity: family.identity, kind: 'relationship' as const, targetDescriptorId: 'energy', targetTrackableId: 'energy', judgment: 'yes' as const, confidence: 'high' as const, evidenceSignature: 'old', titleAtReview: 'Energy tended to be higher.', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    const reviewed = renderToStaticMarkup(<InsightCard item={{ kind: 'relationship', identity: family.identity, family, candidate }} review={review} onSave={noop} onRemove={noop} onExplore={noop} />)
    expect(reviewed).toContain('Edit review'); expect(reviewed).toContain('Evidence has changed since you reviewed this.')
    const shift = renderToStaticMarkup(<InsightCard item={{ kind: 'change-point', identity: point.id, point }} onSave={noop} onRemove={noop} onExplore={noop} />)
    expect(shift).toContain('since around'); expect(shift).toContain('earlier and 30 later recorded values')
  })
})
