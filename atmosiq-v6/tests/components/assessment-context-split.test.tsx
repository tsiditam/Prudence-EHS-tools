// @vitest-environment jsdom
/**
 * AssessmentContext — split into data-being-edited and results contexts
 * (audit 2026-09 §6 Navigation and state).
 *
 * Pins:
 *   • a consumer of useAssessmentResults does NOT re-render when the
 *     assessor types (setZF / setQSField) — the reason for the split
 *   • setZF writes to the zone that is current at call time, even when
 *     setCurZone and setZF land in the same tick (no stale closure)
 *   • runScoring does not write zones mid-compute: the stored zones keep
 *     their identity; the outdoor-filled copy is returned instead
 *   • useAssessment still returns the merged object
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { AssessmentProvider, useAssessment, useAssessmentData, useAssessmentResults } from '../../src/contexts/AssessmentContext.jsx'

afterEach(() => cleanup())

let renders = { results: 0, data: 0 }
let dataApi: ReturnType<typeof useAssessmentData> | null = null
let resultsApi: ReturnType<typeof useAssessmentResults> | null = null
let mergedApi: ReturnType<typeof useAssessment> | null = null

function ResultsProbe() {
  renders.results++
  resultsApi = useAssessmentResults()
  return <span data-testid="scores">{resultsApi.zoneScores.length}</span>
}
function DataProbe() {
  renders.data++
  dataApi = useAssessmentData()
  return <span data-testid="zone0-t">{String(dataApi.zones[0]?.t ?? '')}</span>
}
function MergedProbe() {
  mergedApi = useAssessment()
  return null
}

function mount() {
  renders = { results: 0, data: 0 }
  return render(
    <AssessmentProvider>
      <ResultsProbe />
      <DataProbe />
      <MergedProbe />
    </AssessmentProvider>,
  )
}

describe('AssessmentContext split', () => {
  it('typing re-renders data consumers only', () => {
    mount()
    const before = { ...renders }
    act(() => { dataApi!.setZF('t', '72') })
    act(() => { dataApi!.setZF('rh', '45') })
    act(() => { dataApi!.setQSField('fn', 'Acme HQ') })
    expect(screen.getByTestId('zone0-t').textContent).toBe('72')
    expect(renders.data).toBeGreaterThan(before.data)
    expect(renders.results).toBe(before.results)
  })

  it('scoring re-renders results consumers', () => {
    mount()
    act(() => { dataApi!.setZF('zn', 'Office'); dataApi!.setZF('co2', '1200'); dataApi!.setZF('t', '74'); dataApi!.setZF('rh', '40') })
    const before = renders.results
    act(() => { dataApi!.runScoring() })
    expect(renders.results).toBeGreaterThan(before)
    expect(Number(screen.getByTestId('scores').textContent)).toBe(1)
  })

  it('setZF targets the zone current at call time (no stale closure)', () => {
    mount()
    act(() => { dataApi!.setZones([{ zn: 'A' }, { zn: 'B' }]) })
    // Same tick: move to zone 1 and write. A closure over curZone=0 would
    // have written into zone A.
    act(() => { dataApi!.setCurZone(1); dataApi!.setZF('t', '68') })
    expect(dataApi!.zones[0].t).toBeUndefined()
    expect(dataApi!.zones[1].t).toBe('68')
  })

  it('runScoring returns outdoor-filled zones without writing them back', () => {
    mount()
    const zones = [{ zn: 'A', co2: '900', co2o: '420' }, { zn: 'B', co2: '1100' }]
    act(() => { dataApi!.setZones(zones) })
    const stored = dataApi!.zones
    let out: ReturnType<typeof dataApi.runScoring> | undefined
    act(() => { out = dataApi!.runScoring() })
    expect(out!.zones[1].co2o).toBe('420')   // filled copy for callers
    expect(dataApi!.zones).toBe(stored)        // state untouched
    expect(dataApi!.zones[1].co2o).toBeUndefined()
    expect(out!.zScores).toHaveLength(2)
  })

  it('useAssessment still exposes the merged surface', () => {
    mount()
    expect(typeof mergedApi!.setZF).toBe('function')
    expect(typeof mergedApi!.runScoring).toBe('function')
    expect(Array.isArray(mergedApi!.zoneScores)).toBe(true)
    expect(mergedApi!.zones).toEqual([{}])
  })
})
