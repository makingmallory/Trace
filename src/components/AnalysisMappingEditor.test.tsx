import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AnalyticsProvider } from '../analytics/AnalyticsProvider.ts'
import type { AnalysisMappingOpportunity } from '../analytics/analysisModel.ts'
import { AnalysisMappingEditor } from './AnalysisMappingEditor.tsx'

const provider = { providerId: 'test' } as AnalyticsProvider
const opportunity: AnalysisMappingOpportunity = {
  trackableId: 'severity', sourceVersion: 1, targetVersion: 2, sourceName: 'Severity', targetName: 'Severity',
  sourceMeasurementType: 'ordinal', targetRawMeasurementType: 'nominal-single', targetMeasurementType: 'nominal-single',
  compatibility: 'supported', status: 'unmapped-historical', coverage: { mapped: 0, total: 2, percent: 0 },
  sourceValues: [{ value: 'number:1', label: '1', observedCount: 2 }, { value: 'number:2', label: '2', observedCount: 1 }],
  targetValues: [{ value: 'option:low', label: 'Low', observedCount: 0 }, { value: 'option:high', label: 'High', observedCount: 0 }],
}

describe('AnalysisMappingEditor', () => {
  it('renders a compact row mapping table with an explicit unmapped choice', () => {
    const markup = renderToStaticMarkup(createElement(AnalysisMappingEditor, { opportunity, provider, onClose: () => undefined }))
    expect(markup).toContain('Match older values to the current format')
    expect(markup).toContain('Old value')
    expect(markup).toContain('<strong>1</strong>')
    expect(markup).toContain('Leave unmapped')
    expect(markup).toContain('Save mapping')
    expect(markup).not.toContain(' v1')
  })
})
