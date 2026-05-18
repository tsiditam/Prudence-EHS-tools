// @vitest-environment jsdom
/**
 * ReadinessPanel — UI surface tests.
 *
 * Pins the contract:
 *   • Renders green "Ready for sign-off" pill on a clean assessment
 *   • Renders the amber "Defensibility gaps" pill when gaps exist and
 *     lists each gap entry with its humanized kind label
 *   • Renders the red "Cannot finalize yet" pill when finalization
 *     blockers exist
 *   • The "Ask the copilot what's next" CTA fires onAskCopilot with
 *     the computed verdict
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ReadinessPanel from '../../src/components/ReadinessPanel'

function cleanAssessment(overrides: Record<string, unknown> = {}) {
  return {
    assessmentMode: 'SCREENING',
    presurvey: {
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
      ps_assessor: 'J. Smith, CIH, CSP',
    },
    building: { fn: 'Demo Tower', ht: 'VAV with rooftop AHU' },
    client: {
      name: 'Demo Holdings LLC',
      contact_name: 'Pat Doe',
      contact_role: 'Facility Manager',
      requested_by: 'Pat Doe',
    },
    zones: [{ zn: 'Zone 1', co2: '850', co2o: '420', meas_conditions: 'Yes' }],
    zoneScores: [{ zoneName: 'Zone 1', cats: [{ l: 'Vent', r: [{ t: 'OK', sev: 'low' }] }] }],
    photos: { 'Zone 1': [{ id: 'p1' }] },
    recs: { imm: [], eng: [], adm: [], mon: [] },
    confidence: 'Medium',
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('ReadinessPanel', () => {
  it('renders the "Ready for sign-off" status on a clean assessment', () => {
    render(<ReadinessPanel assessment={cleanAssessment()} onAskCopilot={() => {}} />)
    // Status pill label + summary line both carry the phrase.
    expect(screen.getAllByText(/Ready for sign-off/i).length).toBeGreaterThan(0)
  })

  it('renders the "Defensibility gaps" status and lists the gap kinds', () => {
    render(
      <ReadinessPanel
        assessment={cleanAssessment({
          zones: [{ zn: 'Zone 1', co2: '1180' /* no co2o */, meas_conditions: 'Yes' }],
        })}
        onAskCopilot={() => {}}
      />,
    )
    // "Defensibility gaps" shows up twice — status pill + section header.
    expect(screen.getAllByText(/Defensibility gaps/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Missing outdoor CO₂ baseline/i)).toBeTruthy()
  })

  it('renders the "Cannot finalize yet" status when blockers exist', () => {
    render(
      <ReadinessPanel
        assessment={cleanAssessment({
          client: { name: 'Not Specified', contact_name: '', contact_role: '' },
        })}
        onAskCopilot={() => {}}
      />,
    )
    expect(screen.getByText(/Cannot finalize yet/i)).toBeTruthy()
    // Surface at least one of the named blockers (client name)
    expect(screen.getByText(/Client name is empty/i)).toBeTruthy()
  })

  it('fires onAskCopilot with the verdict when the CTA is tapped', () => {
    const onAsk = vi.fn()
    render(<ReadinessPanel assessment={cleanAssessment()} onAskCopilot={onAsk} />)
    fireEvent.click(screen.getByText(/Ask the copilot what's next/i))
    expect(onAsk).toHaveBeenCalledOnce()
    const verdict = onAsk.mock.calls[0][0]
    expect(verdict.status).toBe('ready')
    expect(verdict.ready).toBe(true)
  })
})
