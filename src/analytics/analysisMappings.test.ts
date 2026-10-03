import { describe, expect, it } from 'vitest'
import type { AnalysisValueMapping } from '../domain/models/index.ts'
import { analysisMappingCompatibility, applyAnalysisMapping, mappingCoverage, sourceKeyForAnalysisValue } from './analysisMappings.ts'
import type { AnalysisValue } from './analysisModel.ts'

const timestamp = '2026-08-10T12:00:00.000Z'
const mapping: AnalysisValueMapping = {
  id: 'map', trackableId: 'volume', sourceTrackableVersion: 1, targetTrackableVersion: 2,
  targetMeasurementType: 'ordinal', ordinalOrder: ['option:low', 'option:high'],
  valueMappings: [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'Low' }],
  createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
}

describe('analysis value mappings', () => {
  it('retains raw provenance when producing a canonical user-mapped value', () => {
    const raw: AnalysisValue = { id: 'answer', localDate: '2026-08-10', display: '1', version: 1, versionName: 'Volume old', measurementType: 'ordinal', numericValue: 1 }
    expect(sourceKeyForAnalysisValue(raw)).toBe('number:1')
    expect(applyAnalysisMapping(raw, mapping)).toMatchObject({ display: 'Low', numericValue: 0, rawDisplay: '1', rawMeasurementType: 'ordinal', analysisMappingId: 'map', userMapped: true })
    expect(raw).toEqual({ id: 'answer', localDate: '2026-08-10', display: '1', version: 1, versionName: 'Volume old', measurementType: 'ordinal', numericValue: 1 })
  })

  it('leaves unmatched values unmapped and reports observation coverage', () => {
    expect(applyAnalysisMapping({ id: 'answer', localDate: '2026-08-10', display: '2', version: 1, versionName: 'Volume old', measurementType: 'ordinal', numericValue: 2 }, mapping)).toBeNull()
    expect(mappingCoverage(['number:1', 'number:2', 'number:1'], mapping.valueMappings)).toEqual({ mapped: 2, total: 3, percent: 67 })
  })

  it('rejects unsafe scalarization directions', () => {
    expect(analysisMappingCompatibility('nominal-multiselect', 'nominal-single')).toBe('incompatible')
    expect(analysisMappingCompatibility('duration', 'nominal-single')).toBe('incompatible')
    expect(analysisMappingCompatibility('nominal-single', 'continuous')).toBe('incompatible')
    expect(analysisMappingCompatibility('ordinal', 'ordinal')).toBe('supported')
  })
})
