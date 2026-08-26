/**
 * The `read_monitoring_report` dispatcher, and the rules it ships with.
 *
 * The dispatcher itself is nearly trivial — it projects an object the client
 * already built, exactly as `assess_investigation` does, because a second
 * derivation on the server would be a second opinion about a document that has
 * already gone to a client.
 *
 * What is NOT trivial is the `usage_rules` array. Scope decision (2026-08):
 * Jasper EXPLAINS this report and does not review it, and the locked status
 * vocabulary is the report's own careful language. Neither constraint can be
 * enforced by a data shape, so both ride on the tool result — and a rule that
 * quietly disappears is indistinguishable from one nobody wrote. These tests
 * are what make the rules load-bearing.
 */
import { describe, it, expect } from 'vitest'
import { dispatchTool, FIELD_ASSISTANT_TOOLS } from '../../src/constants/field-assistant-tools.js'

const REPORT = {
  present: true,
  generated_at: '2026-07-19T14:02:00.000Z',
  file_name: 'Meridian_IEMR.docx',
  edition: 'client',
  report_version: 'v1.0',
  site: 'Meridian Commerce Tower — Suite 300',
  qualitative_only: false,
  calibration: { status: 'ok', note: null },
  parameters: [{ param: 'co2', label: 'Carbon dioxide', status: { id: 'above', label: 'Above Reference', reason: null } }],
  highlights: [],
  data_quality: [],
  limitations: ['Fixed-location monitoring.'],
  truncated: false,
}

const call = (assessmentContext: unknown) =>
  dispatchTool('read_monitoring_report', {}, { assessmentContext } as never)

describe('it reads what the client derived, and computes nothing', () => {
  it('returns the projection untouched', async () => {
    const out: any = await call({ monitoring_report: REPORT })
    expect(out.status).toBe('ok')
    // Identity, not a copy that drifted. The dispatcher must not reshape,
    // re-round, or re-order anything on its way through.
    expect(out.report).toEqual(REPORT)
  })

  it.each([
    ['no context at all', undefined],
    ['a context with no report', { zones: [] }],
    ['an explicit null', { monitoring_report: null }],
    ['a projection that is not present', { monitoring_report: { present: false } }],
    ['a non-object', 'report'],
  ])('%s returns no_report rather than inventing one', async (_label, ctx) => {
    const out: any = await call(ctx)
    expect(out.status).toBe('no_report')
    expect(out.report).toBeUndefined()
  })

  it('the no_report message tells Jasper what to do instead', async () => {
    // Logger data can be loaded with no report generated. Saying only "no
    // report" invites Jasper to answer from nothing; the message routes it to
    // the logger summary and forbids describing a report that does not exist.
    const out: any = await call({})
    expect(out.message).toMatch(/logger data/i)
    expect(out.message).toMatch(/do not describe a monitoring report/i)
  })

  it('never throws, whatever it is handed', async () => {
    for (const bad of [null, undefined, 0, '', [], { monitoring_report: [] }]) {
      await expect(call(bad)).resolves.toBeTruthy()
    }
  })
})

describe('the usage rules carry the constraints a data shape cannot', () => {
  const rulesText = async () => {
    const out: any = await call({ monitoring_report: REPORT })
    return (out.usage_rules as string[]).join('\n')
  }

  it('ships a non-empty rule set', async () => {
    const out: any = await call({ monitoring_report: REPORT })
    expect(Array.isArray(out.usage_rules)).toBe(true)
    expect(out.usage_rules.length).toBeGreaterThanOrEqual(8)
  })

  it('says explain, not review — the scope decision', async () => {
    const t = await rulesText()
    expect(t).toMatch(/EXPLAIN this report; do not review it/i)
    expect(t).toMatch(/do not volunteer criticism/i)
  })

  it('forbids reading a withheld comparison as a verdict', async () => {
    // The single most misreadable thing in the document: the statistics print
    // while the comparison is withdrawn.
    const t = await rulesText()
    expect(t).toMatch(/Not Established/)
    expect(t).toMatch(/never describe such a parameter as within, above, or outside/i)
    expect(t).toMatch(/qualitative_only/)
  })

  it('protects the locked status vocabulary', async () => {
    const t = await rulesText()
    for (const term of ['elevated', 'safe', 'acceptable', 'compliant']) {
      expect(t.toLowerCase(), `${term} is not named as forbidden`).toContain(term)
    }
    expect(t).toMatch(/Within Reference/)
    expect(t).toMatch(/Outside Reference/)
  })

  it('stops a positional statistic being read as a time-weighted average', async () => {
    // pct_above counts individual readings. Calling that an 8-hour TWA is how
    // `CO — EXCEEDS OSHA PEL` shipped once already.
    const t = await rulesText()
    expect(t).toMatch(/time-weighted average/i)
    expect(t).toMatch(/do not describe either as meeting or failing/i)
    expect(t).toMatch(/8-hour or 24-hour/i)
  })

  it('binds citations to the reference the assessor actually chose', async () => {
    const t = await rulesText()
    expect(t).toMatch(/do not name a different standard/i)
  })

  it('treats an absent parameter as unmeasured, not as acceptable', async () => {
    const t = await rulesText()
    expect(t).toMatch(/was not measured rather than implying it was measured and found acceptable/i)
  })
})

describe('the tool is registered honestly', () => {
  const tool: any = FIELD_ASSISTANT_TOOLS.find((t: any) => t.name === 'read_monitoring_report')

  it('is in the catalog and takes no arguments', () => {
    expect(tool).toBeTruthy()
    expect(tool.input_schema.type).toBe('object')
    expect(tool.input_schema.required).toEqual([])
  })

  it('tells the model when to prefer it over the two neighbouring tools', () => {
    // Without this the model reaches for read_attached_document (lossy text
    // extraction of our own document) or answers from the raw logger summary.
    expect(tool.description).toMatch(/read_attached_document/)
    expect(tool.description).toMatch(/logger data summary/i)
    expect(tool.description).toMatch(/no_report/)
    expect(tool.description).toMatch(/EXPLAIN the report, not to review/i)
  })
})
