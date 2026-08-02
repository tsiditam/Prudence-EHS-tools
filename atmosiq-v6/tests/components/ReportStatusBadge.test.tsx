// @vitest-environment jsdom
/**
 * The shared report-status badge.
 *
 * This component exists because there was no shared one: every surface
 * that showed report state composed its own chip with its own hardcoded
 * string, which is how a single phrase ended up meaning three different
 * things in three different places. The point of the tests below is that
 * the badge takes its words from the lifecycle module and never invents
 * its own.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ReportStatusBadge from '../../src/components/ui/ReportStatusBadge'
import {
  REPORT_PROFILES, REPORT_STATUS, REPORT_PROFILE_VALUES, REPORT_STATUS_VALUES,
  statusLabel,
} from '../../src/constants/reportLifecycle'

const { SCREENING, PROFESSIONAL } = REPORT_PROFILES
const { DRAFT, IN_REVIEW, REVIEWED, FINAL } = REPORT_STATUS

afterEach(cleanup)

describe('ReportStatusBadge', () => {
  it('renders the lifecycle module’s label, not its own wording', () => {
    for (const status of REPORT_STATUS_VALUES) {
      cleanup()
      render(<ReportStatusBadge status={status} profile={PROFESSIONAL} />)
      expect(screen.getByTestId('report-status-badge').textContent)
        .toContain(statusLabel(PROFESSIONAL, status))
    }
  })

  it('says Final plainly for a finished screening report', () => {
    render(<ReportStatusBadge status={FINAL} profile={SCREENING} />)
    expect(screen.getByTestId('report-status-badge').textContent).toContain('Final')
  })

  it('does not call a screening draft "pending professional review"', () => {
    render(<ReportStatusBadge status={DRAFT} profile={SCREENING} />)
    const text = screen.getByTestId('report-status-badge').textContent || ''
    expect(text).toContain('Draft')
    expect(text).not.toMatch(/pending/i)
  })

  it('does say pending review on a professional draft', () => {
    render(<ReportStatusBadge status={DRAFT} profile={PROFESSIONAL} />)
    expect(screen.getByTestId('report-status-badge').textContent)
      .toMatch(/Pending Professional Review/i)
  })

  it('names the reviewed state', () => {
    render(<ReportStatusBadge status={REVIEWED} profile={PROFESSIONAL} />)
    expect(screen.getByTestId('report-status-badge').textContent)
      .toContain('Professionally Reviewed')
  })

  it('exposes status and profile as data attributes for filters and tests', () => {
    render(<ReportStatusBadge status={IN_REVIEW} profile={PROFESSIONAL} />)
    const el = screen.getByTestId('report-status-badge')
    expect(el.getAttribute('data-status')).toBe(IN_REVIEW)
    expect(el.getAttribute('data-profile')).toBe(PROFESSIONAL)
  })

  it('can append the profile for lists that mix report types', () => {
    render(<ReportStatusBadge status={FINAL} profile={SCREENING} showProfile />)
    expect(screen.getByTestId('report-status-badge').textContent)
      .toMatch(/Screening Assessment/)
  })

  it('never renders the old blanket stamp, in any combination', () => {
    for (const profile of REPORT_PROFILE_VALUES) {
      for (const status of REPORT_STATUS_VALUES) {
        cleanup()
        render(<ReportStatusBadge status={status} profile={profile} showProfile />)
        expect(screen.getByTestId('report-status-badge').textContent || '')
          .not.toMatch(/IH Review Required/i)
      }
    }
  })

  it('renders something sensible when handed nothing', () => {
    // A record predating the lifecycle can reach a list with no status.
    render(<ReportStatusBadge status={undefined as never} profile={undefined} />)
    expect(screen.getByTestId('report-status-badge').textContent).toContain('Draft')
  })
})
