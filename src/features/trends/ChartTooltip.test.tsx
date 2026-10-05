import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChartTooltip } from './ChartTooltip.tsx'

describe('shared chart tooltip presentation', () => {
  it('renders compact, positioned inspection content for Forecast and Explore markers', () => {
    const html = renderToStaticMarkup(<ChartTooltip tooltip={{ id: 'point', title: 'Tue, Oct 6', lines: ['Energy Level: 4', 'Likely range: 3–5', 'Confidence: Moderate'], x: 50, y: 25 }} />)
    expect(html).toContain('chart-tooltip--below'); expect(html).toContain('Tue, Oct 6'); expect(html).toContain('Energy Level: 4'); expect(html).toContain('Confidence: Moderate')
  })
  it('keeps edge markers within the chart directionally', () => {
    const html = renderToStaticMarkup(<ChartTooltip tooltip={{ id: 'edge', title: 'Sep 28', lines: ['Acne Location', 'Chin, Temples, Jaw, Cheeks'], x: 4, y: 72 }} />)
    expect(html).toContain('chart-tooltip--left'); expect(html).toContain('Chin, Temples, Jaw, Cheeks')
  })
})
