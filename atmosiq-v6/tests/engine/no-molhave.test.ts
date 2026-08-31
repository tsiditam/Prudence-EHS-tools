/**
 * TVOC is measured, never judged.
 *
 * `tvoc_molhave_concern` (500 µg/m³) and `tvoc_molhave_action` (3,000 µg/m³)
 * were the only basis on which AtmosFlow judged a total-VOC reading. Both were
 * removed in 2026-08, along with the WELL v2 target that offered a third
 * yardstick, and this file is the guard that two production comments name.
 *
 * ── Why they went ─────────────────────────────────────────────────────────
 * TVOC is a non-specific sum: it aggregates whatever a photoionization
 * detector responds to into one mass-equivalent number and identifies none of
 * it. No regulatory or consensus health-based limit exists for that quantity.
 * Mølhave's 1991 tiers are a chamber-study dose-response framework describing
 * how symptom likelihood varied across a defined 22-compound mixture — not a
 * limit anybody promulgated. Applying them produced a severity, a citation, a
 * client-facing finding, a live field advisory, a sampling recommendation and
 * a causal chain, all as though a limit existed.
 *
 * Captioning them "advisory" is what let them spread. A tier printed beside a
 * measured value reads as a limit however it is labelled, and every surface
 * that carried one also carried a disclaimer saying it was only advisory. The
 * disclaimer was the vector, not the fix.
 *
 * ── Why the guard is shaped this way ──────────────────────────────────────
 * The lesson from `editorial-engine-parity.test.ts`: pin the CLASS, not the
 * instances. A removal that only deletes the strings it can find leaves the
 * next one free to come back — and this removal touched twenty-odd files
 * across the engine, the registry, the profiles, three renderers, the DOCX,
 * the charts, the pre-review linter and every Jasper grounding surface.
 *
 * So there are two halves:
 *
 *   1. Behavioural assertions, per layer, driven through the real entry
 *      points at values that would have fired every removed branch. These
 *      catch a reintroduction that works.
 *   2. A source sweep over the shipped tree for a TVOC threshold in a
 *      RENDERED position — a string literal, not a comment. This catches a
 *      reintroduction that has not been wired up yet, and it is the half
 *      that generalises: it needs no list of the files that once had one.
 *
 * The sweep deliberately strips comments before matching. Every one of those
 * twenty files now carries a removal record that names the tiers and the
 * figures, and a guard that could not tell a record from a rendered string
 * would fire on its own documentation — which is how the first version of the
 * editorial-parity grep produced eight false positives.
 *
 * ── And what must REMAIN ──────────────────────────────────────────────────
 * Same trap `drain-pan-no-legionella.test.ts` names: an absence-only guard is
 * satisfied by deleting too much. Three things are pinned as required here.
 *
 *   * TVOC is still CAPTURED, converted between units, charted and reported.
 *     `vocConversion.js` is untouched — a logger reporting ppb feeding an
 *     engine field in µg/m³ is a factual question about the air, and getting
 *     it wrong is an error whether or not anything scores the result.
 *   * The report calls TVOC `not_evaluated`, NOT `acceptable`. Calling an
 *     unjudgeable reading acceptable is the more dangerous of the two errors
 *     available, and `OUTCOME_TO_SEV` used to map anything unknown to `'ok'`.
 *   * The renovation/off-gassing TO-17 sampling entry survives. It fires on a
 *     recorded SOURCE, not on a concentration, so it never needed a threshold
 *     to be defensible — and removing an over-reaching trigger must not leave
 *     a real one with nothing to say.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { CRITERIA, evaluateCriteria, allCriteria } from '../../src/constants/criteria'
import { STD, STANDARDS_MANIFEST } from '../../src/constants/standards'
import {
  profilesFor, defaultProfileId, parametersWithProfiles, resolveReference,
} from '../../src/utils/referenceProfiles'
import { paramReference } from '../../src/utils/sensorThresholds'
import { scoreZone } from '../../src/engines/scoring'
import { generateSamplingPlan } from '../../src/engines/sampling'
import { buildCausalChains } from '../../src/engines/causalChains'
import { evaluateLive } from '../../src/engines/liveAdvisor'
import { summarizeParameters } from '../../src/report/reportModel'
import * as NL from '../../src/report/narrativeLibrary'
import { TVOC_PROSE } from '../../src/engine/report/parameter-prose/gases-tvoc'
import { STANDARDS_CORPUS } from '../../src/constants/standards-corpus'
import { lookupExposureLimit, lookupHealthEffects } from '../../src/constants/iaq-knowledge-base'
import { STANDARDS_FOR_AGENT } from '../../src/constants/field-assistant-corpus'
import { checkCitationAntiPatterns } from '../../src/utils/preReviewValidator'

const ROOT = join(__dirname, '../..')
const DATE = { assessmentDate: '2026-07-15' }

/** Values spanning every tier boundary the removed criteria ever used. */
const TVOC_SWEEP = ['0', '1', '199', '200', '499', '500', '501', '2999', '3000', '3001', '25000', '99999']

// ───────────────────────────────────────────────────────────────────────────
// 1. The registry
// ───────────────────────────────────────────────────────────────────────────
describe('criteria registry', () => {
  it('has no tvoc key at all — absent, not empty', () => {
    // Absent rather than `tvoc: []` on purpose. `evaluateCriteria` returns
    // null for a missing parameter, and an empty array would still advertise
    // TVOC as a parameter the registry has an opinion about.
    expect('tvoc' in CRITERIA).toBe(false)
  })

  it('registers no criterion for tvoc under any id', () => {
    for (const c of allCriteria() as Array<Record<string, unknown>>) {
      expect(String(c.parameter ?? ''), JSON.stringify(c.id)).not.toBe('tvoc')
      expect(String(c.id ?? ''), 'criterion id').not.toMatch(/tvoc|molhave|mølhave/i)
    }
  })

  it.each(TVOC_SWEEP)('evaluateCriteria("tvoc", %s) returns null', (v) => {
    expect(evaluateCriteria('tvoc', Number(v))).toBeNull()
    expect(evaluateCriteria('tvoc', Number(v), 'screening_continuous')).toBeNull()
  })
})

describe('threshold constants', () => {
  it('STD.c carries no tvoc block', () => {
    expect((STD as Record<string, any>).c.tvoc).toBeUndefined()
  })

  it('the standards manifest lists nothing to cite for TVOC', () => {
    for (const name of Object.keys(STANDARDS_MANIFEST)) {
      expect(name, 'manifest entry').not.toMatch(/molhave|mølhave|tvoc/i)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 2. Reference lines — the chart, the card, the monitoring report
// ───────────────────────────────────────────────────────────────────────────
describe('reference profiles', () => {
  it('does not advertise tvoc as offering a choice of yardstick', () => {
    // The key must be ABSENT, not empty: `parametersWithProfiles` returns
    // `Object.keys(PROFILES)`, so `tvoc: []` would still list it in the UI as
    // a parameter with references to pick between.
    expect(parametersWithProfiles()).not.toContain('tvoc')
  })

  it('resolves no profile, no default and no reference for tvoc', () => {
    expect(profilesFor('tvoc')).toEqual([])
    expect(defaultProfileId('tvoc')).toBeNull()
    for (const id of ['molhave', 'molhave-action', 'well', 'none', 'default']) {
      for (const unit of ['µg/m³', 'mg/m³', 'ppb', 'ppm', '']) {
        expect(resolveReference('tvoc', id, { unit }), `${id}/${unit}`).toBeNull()
      }
    }
  })

  it('the WELL target went too — TVOC has no selectable reference of any kind', () => {
    // The pricing of this decision: WELL v2 survives for pm25, pm10 and co,
    // where a criterion backs it. It did not survive for TVOC, because
    // "opt-in" does not rescue a number with nothing behind it.
    expect(resolveReference('tvoc', 'well', { unit: 'µg/m³' })).toBeNull()
  })

  it('the Logger Studio card shows the reading and no line', () => {
    for (const unit of ['µg/m³', 'ppb', 'mg/m³', 'ppm']) {
      const ref = paramReference('tvoc', { unit }) as Record<string, any>
      expect(ref.limit, unit).toBeNull()
      expect(ref.band, unit).toBeNull()
      expect(ref.refs, unit).toEqual([])
      // But it does explain itself. A blank card teaches nothing.
      expect(String(ref.note), unit).toMatch(/no consensus health-based limit/i)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 3. The engine — findings, sampling, chains, live advisory
// ───────────────────────────────────────────────────────────────────────────
const findingsFor = (zone: Record<string, unknown>) =>
  ((scoreZone({ zn: 'Zone 1', su: 'office', ...zone } as never, DATE as never) as never as any).cats || [])
    .flatMap((c: any) => c.r || [])

describe('scoring', () => {
  it.each(TVOC_SWEEP)('raises no finding at tv=%s', (tv) => {
    for (const f of findingsFor({ tv }) as Array<Record<string, unknown>>) {
      expect(String(f.p ?? ''), String(f.t)).not.toBe('tvoc')
      expect(String(f.t ?? ''), 'finding text').not.toMatch(/\bTVOC\b|total volatile/i)
    }
  })

  it('a TVOC reading changes nothing about the rest of the assessment', () => {
    // Fully inert, not merely silent: adding a TVOC value must not shift a
    // severity, a count or a gate anywhere else in the zone.
    const base = { co2: '1400', hc: '0.04', su: 'office' }
    const without = JSON.stringify(findingsFor(base))
    for (const tv of TVOC_SWEEP) {
      expect(JSON.stringify(findingsFor({ ...base, tv })), `tv=${tv}`).toBe(without)
    }
  })
})

describe('sampling plan', () => {
  it.each(TVOC_SWEEP)('a TVOC concentration of %s triggers no speciation', (tv) => {
    const { plan } = generateSamplingPlan([{ zn: 'Z', tv }] as never, {} as never)
    expect(plan.filter((p: any) => /VOC Speciation/i.test(String(p.type)))).toEqual([])
  })

  it('but a recorded renovation source still does — that entry needs no threshold', () => {
    const { plan } = generateSamplingPlan(
      [{ zn: 'Z', src_internal: ['New furniture / carpet / paint'], rn: 'Yes' }] as never,
      {} as never,
    )
    const voc = plan.find((p: any) => /VOC Speciation/i.test(String(p.type))) as any
    expect(voc, 'source-triggered TO-17 entry').toBeTruthy()
    expect(String(voc.method)).toMatch(/TO-17/)
    // It fires on the SOURCE, so its hypothesis may not describe a level.
    expect(String(voc.hypothesis)).not.toMatch(/elevated|exceed|above|\bTVOC\b/i)
  })

  it('still names a missing outdoor TVOC baseline as a data gap', () => {
    // A gap statement is not a judgement. Without an outdoor reading you
    // cannot say whether an indoor value is building-related at all — which
    // is true precisely because there is no threshold to fall back on.
    const { outdoorGaps } = generateSamplingPlan([{ zn: 'Z', tv: '900' }] as never, {} as never)
    expect(outdoorGaps.join(' ')).toMatch(/Outdoor TVOC baseline/i)
  })
})

describe('causal chains', () => {
  // `buildCausalChains` walks zoneScores and indexes into zones, reading the
  // score's `cats` — so the fixture has to be a real `scoreZone` output, not
  // a stub. That is the point: the chain sees exactly what the engine saw.
  const chemical = (zone: Record<string, unknown>) => {
    const z = { zn: 'Z', su: 'office', src_internal: ['New furniture / carpet / paint'], sy: ['Eye irritation', 'Headache'], ...zone }
    const zs = scoreZone(z as never, DATE as never)
    return (buildCausalChains([z] as never, {} as never, [zs] as never) as any[])
      .filter((c) => /Chemical/i.test(String(c.type)))
  }

  it.each(TVOC_SWEEP)('TVOC at %s builds no chemical chain on its own', (tv) => {
    expect(chemical({ tv })).toEqual([])
  })

  it('HCHO still builds one — the chain rests on a measurement with a limit behind it', () => {
    const c = chemical({ hc: String(STD.c.hcho.niosh + 0.05) })
    expect(c).toHaveLength(1)
    expect(c[0].evidence.join(' ')).toMatch(/HCHO/)
    expect(c[0].evidence.join(' ')).not.toMatch(/TVOC/i)
  })

  it('adding TVOC never raises the confidence of a chain it is not evidence for', () => {
    // The `weighChain` property, applied here: an inert parameter must not
    // become corroboration by the back door.
    const hc = String(STD.c.hcho.niosh + 0.05)
    const plain = chemical({ hc })[0]
    for (const tv of TVOC_SWEEP) {
      expect(chemical({ hc, tv })[0].confidence, `tv=${tv}`).toEqual(plain.confidence)
    }
  })
})

describe('live advisor', () => {
  it.each(TVOC_SWEEP)('issues no field advisory at tvoc=%s', (tv) => {
    for (const a of evaluateLive({ tvoc: Number(tv), tv: Number(tv) }) as Array<Record<string, unknown>>) {
      expect(String(a.id ?? ''), JSON.stringify(a)).not.toMatch(/tvoc|voc/i)
      expect(String(a.message ?? a.text ?? ''), 'advisory text').not.toMatch(/\bTVOC\b/i)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4. The report — outcome token, basis column, prose
// ───────────────────────────────────────────────────────────────────────────
describe('report model', () => {
  it.each(TVOC_SWEEP)('classifies tv=%s as not_evaluated, never acceptable', (tv) => {
    const p = (summarizeParameters([{ tv }] as never) as Record<string, any>).tvoc
    expect(p.outcome).toBe('not_evaluated')
    expect(p.outcome).not.toBe('acceptable')
  })

  it('states no basis in the column that names what a reading was compared against', () => {
    const p = (summarizeParameters([{ tv: '445' }] as never) as Record<string, any>).tvoc
    expect(String(p.basis)).not.toMatch(/molhave|mølhave|WELL|LEED|advisory tier/i)
    expect(String(p.basis)).toMatch(/no applicable threshold/i)
  })

  it('still reports the measurement — removal is not suppression', () => {
    const p = (summarizeParameters([{ tv: '410' }, { tv: '480' }] as never) as Record<string, any>).tvoc
    expect(p.mean).toBe(445)
    expect(p.unit).toBe('µg/m³')
  })

  it('renders a distinct severity token, not a silent fallback to "ok"', () => {
    // `OUTCOME_TO_SEV[x] || 'ok'` would have printed TVOC as Acceptable.
    const docx = readFileSync(join(ROOT, 'src/components/docx/sections-atmosflow.js'), 'utf8')
    expect(docx).toMatch(/not_evaluated:\s*\{[^}]*label:\s*'Not evaluated'/)
  })
})

describe('narrative and prose', () => {
  const stats = { min: 410, max: 480, mean: 445, n: 2, unit: 'µg/m³' }

  it('the TVOC narrative says the same thing whatever outcome it is handed', () => {
    // The count-invariance idea applied to a parameter with no verdict: if
    // the sentence can move, something is judging.
    const said = new Set(
      ['acceptable', 'advisory', 'elevated', 'priority', 'not_evaluated', undefined]
        .map((o) => (NL as any).OBSERVED.tvoc(stats, o)),
    )
    expect(said.size).toBe(1)
    expect([...said][0]).not.toMatch(/molhave|mølhave/i)
  })

  it('the reference framework no longer lists TVOC among what readings are compared against', () => {
    const rf = String((NL as any).REFERENCE_FRAMEWORK)
    expect(rf).not.toMatch(/molhave|mølhave/i)
    expect(rf).toMatch(/TVOC is deliberately absent/i)
  })

  it('parameter prose cites no dose-response paper as an applicable standard', () => {
    for (const s of TVOC_PROSE.applicableStandards) {
      expect(s.source).not.toMatch(/molhave|mølhave|1991/i)
    }
    expect(TVOC_PROSE.applicableStandards.map((s) => s.source).join(' ')).toMatch(/TO-17/)
  })

  it('the prose summary is identical whether the engine found something or not', () => {
    // TVOC can never produce a finding, so `withinStandards` is permanently
    // true. A template that read it would print "within" over every reading
    // ever taken — a verdict dressed as a fact.
    const range = { count: 2, low: 410, high: 480, average: 445, unit: 'µg/m³', elevatedInZones: ['Z1'] }
    const said = new Set(
      [true, false, null].map((w) => TVOC_PROSE.summaryTemplate({ ...range, withinStandards: w } as never)),
    )
    expect(said.size).toBe(1)
    expect([...said][0]).not.toMatch(/within|above typical|molhave|mølhave/i)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 5. Jasper's grounding — the corpus, the lookup tables, the linter
// ───────────────────────────────────────────────────────────────────────────
describe('assistant grounding', () => {
  it('the standards corpus holds no TVOC dose-response entry', () => {
    for (const c of STANDARDS_CORPUS as Array<Record<string, any>>) {
      expect(String(c.id), 'corpus id').not.toMatch(/molhave|mølhave/i)
      expect(String(c.citation ?? ''), `corpus citation ${c.id}`).not.toMatch(/molhave|mølhave/i)
    }
  })

  it('the LEED 500 µg/m³ entry survives but says AtmosFlow applies nothing', () => {
    // Kept on purpose: an assessor meets that figure in a green-building
    // specification and needs to know what it is. What it must never be is a
    // yardstick, so the entry now says so in its own text.
    const leed = (STANDARDS_CORPUS as Array<Record<string, any>>)
      .find((c) => c.id === 'tvoc-500-green-building-target')
    expect(leed, 'the LEED target entry').toBeTruthy()
    expect(String(leed!.text)).toMatch(/AtmosFlow itself applies NO TVOC threshold/i)
  })

  it('the exposure-limit lookup returns no TVOC number under any agency', () => {
    const row = lookupExposureLimit('tvoc') as Record<string, any> | null
    expect(row, 'tvoc is still a known analyte').toBeTruthy()
    for (const k of ['osha', 'niosh', 'acgih', 'epa', 'idlh']) expect(row![k], k).toBeNull()
    expect(row!.other, 'the "other" agency list is where the tiers lived').toEqual([])
    expect(JSON.stringify(row)).not.toMatch(/molhave|mølhave/i)
  })

  it('the health-effects lookup states no concentration for a TVOC symptom', () => {
    const row = lookupHealthEffects('tvoc') as Record<string, any>
    for (const a of row.acute) expect(a.threshold, JSON.stringify(a)).toBeNull()
    expect(JSON.stringify(row)).not.toMatch(/molhave|mølhave/i)
  })

  it('the cached grounding block tells the assistant TVOC has no limit', () => {
    expect(STANDARDS_FOR_AGENT).not.toMatch(/molhave|mølhave/i)
    expect(STANDARDS_FOR_AGENT).toMatch(/TVOC: no exposure limit exists/i)
  })
})

describe('pre-review linter', () => {
  // Issue ids are namespaced `anti-<rule>-<source>`; `category` carries the
  // rule cleanly, which is what we want to assert on.
  const flags = (text: string) =>
    (checkCitationAntiPatterns({ narrative: text } as never) as any[])
      .map((i) => String(i.category ?? '').replace(/^anti_pattern_/, ''))

  it.each([
    'TVOC exceeded the 500 µg/m³ guideline in Zone 3.',
    'Total VOCs were below the advisory limit.',
    'TVOCs were within the applicable threshold.',
    'TVOC complies with the green-building standard.',
  ])('flags a TVOC comparison: %s', (text) => {
    expect(flags(text)).toContain('tvoc-cited-against-a-threshold')
  })

  it.each([
    'TVOC averaged 445 µg/m³ across the three zones measured.',
    'TVOC is a non-specific sum and identifies no individual compound; speciate per EPA Method TO-17.',
  ])('leaves a descriptive TVOC statement alone: %s', (text) => {
    expect(flags(text)).not.toContain('tvoc-cited-against-a-threshold')
  })

  it('reads the label the report actually prints, not only the acronym', () => {
    // "Total VOCs (TVOC)" is the parameter label in reportModel, the DOCX
    // criteria table and the prose. A rule that only knew "TVOC" would miss
    // the phrasing the deliverable uses most.
    expect(flags('Total volatile organic compounds were within the guideline.'))
      .toContain('tvoc-cited-against-a-threshold')
  })

  it('no longer demands a citation that does not exist', () => {
    // The old rule flagged any TVOC interpretation that did NOT cite Mølhave.
    // Left in place it would fire on every honest sentence above and tell the
    // assessor to add a reference the platform had just deleted. A removal in
    // one place can require an INVERSION in another.
    expect(flags('TVOC averaged 445 µg/m³.').join(' ')).not.toMatch(/without-molhave/i)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 6. The class guard — a TVOC threshold in a rendered position, anywhere
// ───────────────────────────────────────────────────────────────────────────
describe('no TVOC threshold survives in shipped text', () => {
  const DIRS = ['src', 'api', 'lib']
  const EXT = /\.(js|jsx|ts|tsx)$/
  const SKIP = /node_modules|\.test\.|__snapshots__/

  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (SKIP.test(p)) continue
      if (statSync(p).isDirectory()) out.push(...walk(p))
      else if (EXT.test(p)) out.push(p)
    }
    return out
  }

  /**
   * Strip comments so a removal RECORD cannot fail its own guard. Every file
   * touched by this change carries one, and each names the tiers and their
   * figures on purpose — deleting the reasoning along with the code is how a
   * decision gets silently re-litigated a year later.
   *
   * `<!-- -->` goes too. PrintReport builds its document as one long HTML
   * template literal, so the only place to leave a note beside the row that
   * was deleted is an HTML comment — which is a comment in the emitted
   * document exactly as `//` is one in the source.
   *
   * Crude but correct for the danger being checked: `//` and `/* *\/` are
   * blanked, and a `//` inside a string (a URL) can only ever cause a false
   * NEGATIVE on the rest of that line, never a false positive.
   */
  const stripComments = (src: string) =>
    src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  /**
   * Strings that PROHIBIT the comparison rather than make it. A guard that
   * cannot tell a ban from an assertion fires on the machinery built to
   * enforce it.
   *
   * Exact matches, deliberately — a pattern-shaped exemption would quietly
   * grow to cover the next real one. Anything new still fails, and adding to
   * this list is a decision somebody has to write down.
   */
  const PROHIBITIONS = new Set([
    // phrases/contaminants.ts — `bannedAlternatives`: the wording the
    // over-claim guardrail exists to reject.
    'TVOC exceeds limit',
    // preReviewValidator.js — the id and title of the lint rule that flags a
    // TVOC comparison in narrative or recommendation text.
    'tvoc-cited-against-a-threshold',
    'TVOC compared against a threshold',
    // standards-corpus.js — the LEED green-building entry, kept on purpose
    // (an assessor meets that figure in a specification and needs to know
    // what it is). Its own text says AtmosFlow applies no TVOC threshold,
    // asserted separately above.
    'tvoc-500-green-building-target',
    'General / LEED 500 µg/m³ TVOC target (green-building convention)',
    // field-assistant-prompt.js — an example question, whose answer is that
    // there is no limit.
    'why is there no TVOC limit?',
  ])

  const files = DIRS.flatMap((d) => walk(join(ROOT, d)))

  it('sweeps a non-trivial tree (guard against the walker silently finding nothing)', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('names the author of the tiers nowhere outside a comment', () => {
    const bad: string[] = []
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'))
      if (/molhave|mølhave/i.test(code)) bad.push(relative(ROOT, f))
    }
    expect(bad, 'Mølhave in rendered code').toEqual([])
  })

  it('states no TVOC figure as a limit, threshold, tier or target', () => {
    // Two shapes, both drawn from what actually shipped: a TVOC word near one
    // of the retired figures, and a TVOC word near a judgement verb. Either
    // is a comparison the platform can no longer make.
    const FIGURE = /\btvocs?\b[^;'"`\n]{0,80}\b(?:500|3,?000|25,?000|0\.2|218|219)\b|\b(?:500|3,?000|25,?000)\b[^;'"`\n]{0,40}\btvocs?\b/i
    const VERDICT = /\btvocs?\b[^;'"`\n]{0,80}\b(?:limit|threshold|tier|guideline|advisory|exceed(?:s|ed|ing)?|elevated|acceptable)\b/i
    const bad: Array<string> = []
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'))
      for (const m of code.match(/'[^'\n]{12,400}'|"[^"\n]{12,400}"|`[^`]{12,900}`/g) || []) {
        // A sentence that says the platform applies NO threshold has to be
        // allowed to name the concept it is denying.
        if (/\bno\b[^.]{0,60}\b(?:consensus|health-based|applicable|regulatory)\b[^.]{0,40}\blimit\b/i.test(m)) continue
        if (/applies\s+(?:no|none)\b/i.test(m)) continue
        if (/not (?:evaluated|judged|compared|scored)|compares? (?:it )?to nothing/i.test(m)) continue
        if (PROHIBITIONS.has(m.slice(1, -1))) continue
        if (FIGURE.test(m) || VERDICT.test(m)) bad.push(`${relative(ROOT, f)}: ${m.slice(0, 140)}`)
      }
    }
    expect(bad, 'TVOC compared to something in shipped text').toEqual([])
  })
})
