/**
 * review_attached_document — reviewing another consultant's report.
 *
 * The reviewer has no field record, no measurements and no engine output.
 * The document is the only evidence, so the design rests on one rule: every
 * issue must quote the report, and every quotation is checked against the
 * source before the issue is returned.
 *
 * That check is the whole feature. A fabricated quotation would be worse
 * than no review at all — it is precisely the thing an assessor would rely
 * on without going back to the page.
 */
import { describe, it, expect } from 'vitest'
import { dispatchTool, REVIEW_WINDOW_CHARS } from '../../src/constants/field-assistant-tools'

const REPORT = [
  'SECTION 4. RESULTS.',
  'Carbon dioxide in Suite 200 reached 1,850 ppm, which exceeds the ASHRAE 62.1 limit of 1,000 ppm.',
  'Airborne spore counts confirm that the building is safe to occupy.',
  'SECTION 5. RECOMMENDATIONS. Increase outdoor air delivery to the east wing.',
].join('\n')

const row = {
  id: 'doc-1', name: 'romulus.pdf', kind: 'pdf',
  pages: 41, pages_read: 38, chars: REPORT.length, content: REPORT,
}

function store(rows = [row]) {
  const filters: Record<string, unknown> = {}
  const q: Record<string, unknown> = {
    select: () => q, order: () => q,
    eq: (c: string, v: unknown) => { filters[c] = v; return q },
    limit: async () => ({ data: rows }),
  }
  return { client: { from: () => q }, filters }
}

/** A stub upstream returning whatever the model is pretended to have said. */
function model(payload: unknown, opts: { ok?: boolean } = {}) {
  const calls: string[] = []
  return {
    calls,
    fetchFn: async (_url: string, init: { body: string }) => {
      calls.push(init.body)
      return {
        ok: opts.ok !== false,
        status: opts.ok === false ? 500 : 200,
        json: async () => ({
          content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
        }),
      }
    },
  }
}

const ctx = (m: ReturnType<typeof model>, s = store()) => ({
  supabase: s.client as never, conversationId: 'conv-1', userId: 'user-1',
  anthropicApiKey: 'k', fetchFn: m.fetchFn as never,
})

describe('an issue must be quotable from the report', () => {
  it('returns issues whose quotes are in the document', async () => {
    const m = model([{
      severity: 'blocking', category: 'citation_integrity',
      title: 'ASHRAE 62.1 cited as a CO2 limit',
      detail: 'ASHRAE 62.1 governs ventilation rate and contains no indoor CO2 limit.',
      quote: 'exceeds the ASHRAE 62.1 limit of 1,000 ppm',
    }])
    const r: any = await dispatchTool('review_attached_document', {}, ctx(m))
    expect(r.ok).toBe(true)
    expect(r.issue_count).toBe(1)
    expect(r.issues[0].severity).toBe('blocking')
    expect(r.dropped_unverifiable).toBeUndefined()
  })

  it('DROPS an issue whose quote is not in the document', async () => {
    // The failure this exists to prevent: a plausible-sounding quotation
    // the report never contained.
    const m = model([{
      severity: 'blocking', category: 'fabricated',
      title: 'Asbestos disturbance not addressed',
      detail: 'The report dismisses asbestos risk.',
      quote: 'asbestos-containing materials were determined not to be a concern',
    }])
    const r: any = await dispatchTool('review_attached_document', {}, ctx(m))
    expect(r.issue_count).toBe(0)
    expect(r.dropped_unverifiable).toBe(1)
  })

  it('drops an issue carrying no quote at all', async () => {
    const m = model([{ severity: 'warning', category: 'x', title: 'Something seems off', detail: 'No quote.' }])
    const r: any = await dispatchTool('review_attached_document', {}, ctx(m))
    expect(r.issue_count).toBe(0)
    expect(r.dropped_unverifiable).toBe(1)
  })

  it('matches a real quote across the line breaks PDF extraction inserts', async () => {
    // A model quoting accurately from text it was given can still differ by
    // whitespace alone. Requiring an exact match would drop true quotes.
    const m = model([{
      severity: 'warning', category: 'language_integrity', title: 'Overstated',
      detail: 'Spore counts are not evidence of occupant safety.',
      quote: 'Airborne spore counts    confirm that\n\n the building is safe to occupy.',
    }])
    const r: any = await dispatchTool('review_attached_document', {}, ctx(m))
    expect(r.issue_count).toBe(1)
  })

  it('accepts an empty review as a real answer', async () => {
    const r: any = await dispatchTool('review_attached_document', {}, ctx(model([])))
    expect(r.ok).toBe(true)
    expect(r.issue_count).toBe(0)
    // ...and tells the model not to turn silence into an endorsement.
    expect(r.instruction).toMatch(/rather than implying the report is endorsed/)
  })

  it('tolerates a code fence the prompt told it not to use', async () => {
    const m = model('```json\n[{"severity":"warning","category":"c","title":"t","detail":"d","quote":"Increase outdoor air delivery to the east wing."}]\n```')
    const r: any = await dispatchTool('review_attached_document', {}, ctx(m))
    expect(r.issue_count).toBe(1)
  })

  it('fails cleanly rather than inventing when the model returns prose', async () => {
    const r: any = await dispatchTool('review_attached_document', {}, ctx(model('I reviewed the report and it looks fine.')))
    expect(r.ok).toBe(false)
    expect(r.error).toBe('review_unparsable')
  })
})

describe('what the review must carry with it', () => {
  it('names the part reviewed and offers to continue', async () => {
    const long = { ...row, content: 'x'.repeat(REVIEW_WINDOW_CHARS * 2), chars: REVIEW_WINDOW_CHARS * 2 }
    const r: any = await dispatchTool('review_attached_document', {}, ctx(model([]), store([long])))
    expect(r.reviewed_chars).toBe(`0-${REVIEW_WINDOW_CHARS} of ${REVIEW_WINDOW_CHARS * 2}`)
    expect(r.more_remains).toBe(true)
    expect(r.next_offset).toBe(REVIEW_WINDOW_CHARS)
    expect(r.instruction).toMatch(/Do not characterise the report as a whole from one window/)
  })

  it('carries the pages that were never extracted', async () => {
    const r: any = await dispatchTool('review_attached_document', {}, ctx(model([])))
    expect(r.basis).toContain('Only pages 1-38 of 41 were extracted')
  })

  it('refuses an offset past the end instead of reviewing nothing', async () => {
    const r: any = await dispatchTool('review_attached_document', { offset: 999_999 }, ctx(model([])))
    expect(r.ok).toBe(false)
    expect(r.error).toBe('nothing_to_review')
  })

  it('passes a focus through without disabling the standing checks', async () => {
    const m = model([])
    await dispatchTool('review_attached_document', { focus: 'the mold section' }, ctx(m))
    expect(m.calls[0]).toContain('the mold section')
    const sent = JSON.parse(m.calls[0])
    expect(sent.system).toContain('QUOTE, ALWAYS')
    expect(sent.system).toContain('ABSENCE PROVES NOTHING')
  })

  it('scopes the document to this conversation and user', async () => {
    const s = store()
    await dispatchTool('review_attached_document', { document_id: 'doc-1' }, ctx(model([]), s))
    expect(s.filters.conversation_id).toBe('conv-1')
    expect(s.filters.user_id).toBe('user-1')
  })

  it('degrades cleanly with no model available', async () => {
    const s = store()
    const r: any = await dispatchTool('review_attached_document', {}, {
      supabase: s.client as never, conversationId: 'conv-1', userId: 'user-1',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('review_unavailable')
  })
})

describe('the prompt governs what a review may conclude', () => {
  // A review of someone else's work is the easiest place in the product to
  // over-claim: the model has read text, not evidence, and a verdict on a
  // professional's competence is not what an assessor asked for.
  it('forbids adding unverified observations beside verified issues', async () => {
    const { FIELD_ASSISTANT_ROLE_PROMPT: P } = await import('../../src/constants/field-assistant-prompt')
    expect(P).toContain('# Reviewing someone else\'s report (hard rule)')
    expect(P).toMatch(/Report ONLY what review_attached_document verified/)
    expect(P).toMatch(/never present it beside the verified issues/)
  })

  it('forbids reading absence from a window as absence from the report', async () => {
    const { FIELD_ASSISTANT_ROLE_PROMPT: P } = await import('../../src/constants/field-assistant-prompt')
    expect(P).toMatch(/A window is not the report/)
    expect(P).toMatch(/recommendations and limitations usually sit at the back/)
  })

  it('forbids an empty result being reported as an endorsement', async () => {
    const { FIELD_ASSISTANT_ROLE_PROMPT: P } = await import('../../src/constants/field-assistant-prompt')
    expect(P).toMatch(/It is not an endorsement, a clearance/)
  })

  it('requires findings be raised as questions, not verdicts on the author', async () => {
    const { FIELD_ASSISTANT_ROLE_PROMPT: P } = await import('../../src/constants/field-assistant-prompt')
    expect(P).toMatch(/questions a reviewer would raise, not as verdicts on their competence/)
  })

  it('routes review away from eyeballing an excerpt', async () => {
    const { FIELD_ASSISTANT_ROLE_PROMPT: P } = await import('../../src/constants/field-assistant-prompt')
    expect(P).toMatch(/Never review from the inline excerpt or from a read window by eye/)
  })
})
