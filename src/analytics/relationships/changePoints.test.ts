import { describe, expect, it } from 'vitest'
import { defaultRelationshipPolicy } from './relationshipDiscovery.ts'
import { detectTargetChangePoints, type TargetSeriesPoint } from './changePoints.ts'
import type { RelationshipTarget } from './relationshipTypes.ts'

const date = (index: number): string => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
const target: RelationshipTarget = { descriptorId: 'severity', trackableId: 'severity', label: 'Severity', measurementType: 'continuous', kind: 'numeric' }
const values = (length: number, value: (index: number) => number): TargetSeriesPoint[] => Array.from({ length }, (_, index) => ({ date: date(index), value: value(index), mapped: false }))

describe('target-specific change points', () => {
  it('detects a supported mean shift, retains regimes, and attaches nearby events as proximity only', () => {
    const eventDate = date(39)
    const result = detectTargetChangePoints(target, values(80, (index) => (index < 40 ? 2 : 8) + (index % 3) * .1),
      [{ recordId: 'event-1', date: eventDate, ownerTrackableId: 'procedure', label: 'Procedure' }], defaultRelationshipPolicy)
    expect(result.changePoints).toHaveLength(1)
    expect(result.changePoints[0]).toMatchObject({ date: date(40), preCount: 40, postCount: 40, nearbyEvents: [{ eventRecordId: 'event-1', relation: 'nearby-in-time', daysFromChange: -1 }] })
    expect(JSON.stringify(result.changePoints)).not.toMatch(/caus|trigger|effectOf/)
    expect(result.regimes).toHaveLength(2)
    expect(result.regimes[1]).toMatchObject({ startDate: date(40), current: true, observationCount: 40 })
  })

  it('rejects no shift, a tiny shift, and a shift too close to the edge', () => {
    expect(detectTargetChangePoints(target, values(80, (index) => index % 2), [], defaultRelationshipPolicy).changePoints).toEqual([])
    expect(detectTargetChangePoints(target, values(80, (index) => (index < 40 ? 1 : 1.01) + index % 2), [], defaultRelationshipPolicy).changePoints).toEqual([])
    expect(detectTargetChangePoints(target, values(80, (index) => index < 74 ? 1 : 10), [], defaultRelationshipPolicy).changePoints).toEqual([])
  })

  it('supports a binary rate shift without changing another target regime', () => {
    const binary: RelationshipTarget = { descriptorId: 'headache', trackableId: 'headache', label: 'Headache', measurementType: 'binary', kind: 'binary' }
    const shifted = detectTargetChangePoints(binary, values(80, (index) => index < 40 ? Number(index % 10 === 0) : Number(index % 10 !== 0)), [], defaultRelationshipPolicy)
    const stable = detectTargetChangePoints(target, values(80, (index) => index % 2), [], defaultRelationshipPolicy)
    expect(shifted.changePoints.length).toBeGreaterThan(0)
    expect(shifted.regimes.at(-1)!.startDate).not.toBe(date(0))
    expect(stable.regimes).toHaveLength(1)
    expect(stable.regimes[0].startDate).toBe(date(0))
  })
})
