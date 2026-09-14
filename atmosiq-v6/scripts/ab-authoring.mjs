/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * A/B evaluation harness for the report-authoring layer.
 *
 * ── The question ───────────────────────────────────────────────────────
 * Does making the writer organize the investigation before drafting it
 * produce a better report, or only a more elaborate pipeline? Two arms,
 * one variable:
 *
 *   ARM A — the writer as it stood before the authoring plan existed
 *   ARM B — the writer as it stands in the working tree
 *
 * Same evidence package, same model, same adapter, same request shape.
 * Only the system prompt differs.
 *
 * ── Arm A is immutable by construction ─────────────────────────────────
 * It is read from a pinned COMMIT, not from a file, so no edit to the
 * working tree can move the baseline. Its sha256 is asserted before any
 * call is made and the run aborts on mismatch. Arm B's hash is recorded
 * rather than pinned — it changes every time the authoring layer changes,
 * which is the point — so every result names the prompt that produced it.
 *
 * ── What it deliberately cannot do ─────────────────────────────────────
 * It calls the provider adapter directly. It does not import Supabase, it
 * does not go through the authenticated endpoint, it touches no
 * assessment record, no ledger, no credits and no browser storage. It
 * reads fixtures and writes one markdown file. An evaluation tool that
 * could modify what it evaluates is not an evaluation tool.
 *
 * That is a claim about what this file does NOT contain, so it is checked
 * the only way such a claim can be — by reading the file.
 * `tests/scripts/ab-authoring.test.ts` fails if a storage client, a second
 * write path or the authenticated endpoint appears here, and covers the
 * deterministic signals besides.
 *
 * ── Two halves, and only one of them is a measurement ──────────────────
 * The automatic half is deterministic and answers "did planning COST
 * anything" — sections lost to the audit, repetition, coverage, references
 * that did not resolve, tokens, dollars. The rubric half is a form a
 * person fills in while reading, and answers "did it GAIN anything".
 *
 * Those seven categories are judgment calls. A script that scored them
 * would be one model's opinion wearing the costume of a measurement, and
 * the whole point of this exercise is to find out whether a model's
 * opinion about report quality is worth anything. So it prints the form
 * and gets out of the way.
 *
 * ── Usage ──────────────────────────────────────────────────────────────
 *   npm run eval:ab                    # dry run: hashes, fixtures, cost. No calls.
 *   npm run eval:ab -- --run           # spends real money; needs ANTHROPIC_API_KEY
 *   npm run eval:ab -- --run --case messy
 *   npm run eval:ab -- --run --out /tmp/ab.md
 *
 * ── Why it boots Vite to read the engine ───────────────────────────────
 * It runs under plain `node`, but it cannot `import` the engine directly.
 * The `src/**` graph is ESM written in `.js` files inside a package with
 * no `"type": "module"`, so Node reads every one of them as CommonJS and
 * refuses the `export` keyword; several of its relative imports also carry
 * no file extension, which Node's ESM loader will not resolve either. The
 * SPA and the test suite both get past that through Vite's resolver, so
 * this loads the engine through the same one rather than keeping a second
 * copy of the resolution rules here. (CLAUDE.md pitfall #4 binds the
 * `api/**` graph, where Vercel runs plain Node ESM; this is `src/**`, and
 * the rule does not reach it.)
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

/**
 * The engine, resolved when the run starts rather than when this file is
 * parsed. Left null until `loadEngine()` fills it, so forgetting to boot
 * it is a TypeError at the first call and not an `undefined` quietly
 * flowing into a fixture.
 */
let ENGINE = null

async function loadEngine() {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    appType: 'custom',
    logLevel: 'error',
    // Nothing here reaches a browser, so there is no dependency graph to
    // pre-bundle; discovery would crawl the SPA and fail on it.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  })
  const load = (spec) => server.ssrLoadModule(spec)
  const [reportModel, scoring, legacy, chains, evidence, plan, audit, cih] = await Promise.all([
    load('/src/report/reportModel.js'),
    load('/src/engines/scoring.js'),
    load('/src/engines/scoring-legacy.js'),
    load('/src/engines/causalChains.js'),
    load('/src/report/evidencePackage.js'),
    load('/src/report/authoringPlan.js'),
    load('/src/report/narrativeAudit.js'),
    load('/src/engine/report/cih-validation.ts'),
  ])
  ENGINE = {
    assembleRenderModel: reportModel.assembleRenderModel,
    scoreZone: scoring.scoreZone,
    genRecs: legacy.genRecs,
    buildCausalChains: chains.buildCausalChains,
    buildEvidencePackage: evidence.buildEvidencePackage,
    packageForWriter: evidence.packageForWriter,
    validateAuthoringPlan: plan.validateAuthoringPlan,
    auditNarrative: audit.auditNarrative,
    summarizeAudit: audit.summarizeAudit,
    scanProseForBannedLanguage: cih.scanProseForBannedLanguage,
    fixture: load,
    close: () => server.close(),
  }
  return ENGINE
}

// ── Arm A: pinned, hashed, immutable ───────────────────────────────────

/** The commit carrying the writer as it was before the authoring plan. */
const ARM_A_COMMIT = '7b774c2'
const ARM_A_PATH = 'atmosiq-v6/api/_report-sections-prompt.js'
/** Captured from that commit. A mismatch aborts the run. */
const ARM_A_SHA256 = 'f3ef0ce180b96dece009a257b2d572b4cb6dd9d5c66536df2927122edc944e80'

const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')

/**
 * Load a CommonJS prompt module out of git without writing it to disk.
 *
 * Reading from a commit rather than a file is what makes the baseline
 * immutable: there is no version of this on disk for anyone to edit.
 */
function loadArmA() {
  let source
  try {
    source = execFileSync('git', ['show', `${ARM_A_COMMIT}:${ARM_A_PATH}`], { encoding: 'utf8' })
  } catch (e) {
    fail(`could not read arm A from commit ${ARM_A_COMMIT}: ${(e && e.message) || e}`)
  }
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', source)(mod, mod.exports, () => {
    throw new Error('arm A must not require anything')
  })
  const prompt = mod.exports.REPORT_SECTIONS_SYSTEM_PROMPT
  if (!prompt) fail('arm A carried no REPORT_SECTIONS_SYSTEM_PROMPT')
  return prompt
}

const fail = (msg) => { console.error(`ab-authoring: ${msg}`); process.exit(1) }

// ── Fixtures: three kinds of investigation ─────────────────────────────
//
// The clean case is the easiest and the least informative. The messy one
// is where the planning layer either earns its keep or manufactures a
// throughline that is not there, so it is the case to read first.

const CASES = {
  clean: { label: 'clean / complete — nothing found', path: '/src/constants/demoDataClean.js', prefix: 'DEMO_CLEAN_' },
  thin: { label: 'thin / ambiguous — few findings, competing pathways', path: '/src/constants/demoDataHcho.js', prefix: 'DEMO_HCHO_' },
  messy: { label: 'messy — many zones, mixed findings, negatives, competing pathways', path: '/src/constants/demoDataFindings.js', prefix: 'DEMO_FINDINGS_' },
}

async function buildFixture(key) {
  const spec = CASES[key]
  const mod = await ENGINE.fixture(spec.path)
  const building = mod[`${spec.prefix}BUILDING`]
  const zones = mod[`${spec.prefix}ZONES`]
  const presurvey = mod[`${spec.prefix}PRESURVEY`]
  if (!building || !zones) fail(`fixture ${key} is missing its building or zones`)

  // Date pinned: the comfort band is seasonal, and an unpinned fixture
  // scores differently by the month it runs in (CLAUDE.md pitfall #3).
  const zoneScores = zones.map((z) => ENGINE.scoreZone(z, { ...building, assessmentDate: '2026-06-10' }))
  const causalChains = ENGINE.buildCausalChains(zones, building, zoneScores)
  const model = ENGINE.assembleRenderModel({
    building, presurvey, zones, zoneScores, causalChains,
    recs: ENGINE.genRecs(zoneScores, building),
    profile: { name: 'Evaluation Fixture', certs: ['CIH'], firm: 'PSEC' },
    id: `AB-${key.toUpperCase()}`, ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })

  const pkg = ENGINE.buildEvidencePackage(model, { zoneScores, causalChains })
  return { key, label: spec.label, pkg, wire: ENGINE.packageForWriter(pkg) }
}

// ── Deterministic signals ──────────────────────────────────────────────

const WRITABLE = ['executive_summary', 'discussion', 'conceptual_site_model', 'recommendations_prose', 'parameter_background']

/** Every (key, text) pair a sections object carries, background flattened. */
function flatten(sections) {
  const out = []
  for (const key of WRITABLE) {
    const v = sections && sections[key]
    if (typeof v === 'string' && v.trim()) out.push([key, v.trim()])
    else if (key === 'parameter_background' && v && typeof v === 'object') {
      for (const [p, t] of Object.entries(v)) {
        if (typeof t === 'string' && t.trim()) out.push([`parameter_background.${p}`, t.trim()])
      }
    }
  }
  return out
}

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * How much of the prose repeats itself.
 *
 * Two readings, because they catch different faults. A repeated SENTENCE
 * is one section restating another verbatim. A repeated 6-word SHINGLE is
 * the subtler one — the same clause reworked across sections, which is
 * exactly the incoherence a planning pass is supposed to reduce.
 */
function repetition(flat) {
  const sentences = []
  for (const [, text] of flat) {
    for (const piece of String(text).split(/(?<=[.!?])\s+/)) {
      const n = norm(piece)
      if (n.split(' ').length >= 5) sentences.push(n)
    }
  }
  const seenS = new Set()
  let dupSentences = 0
  for (const s of sentences) { if (seenS.has(s)) dupSentences++; else seenS.add(s) }

  const shingles = []
  for (const [, text] of flat) {
    const w = norm(text).split(' ')
    for (let i = 0; i + 6 <= w.length; i++) shingles.push(w.slice(i, i + 6).join(' '))
  }
  const counts = new Map()
  for (const g of shingles) counts.set(g, (counts.get(g) || 0) + 1)
  const repeated = [...counts.values()].filter((n) => n > 1).reduce((a, n) => a + (n - 1), 0)

  return {
    sentences: sentences.length,
    duplicate_sentences: dupSentences,
    shingles: shingles.length,
    repeated_shingles: repeated,
    repeat_rate: shingles.length ? Number((repeated / shingles.length).toFixed(4)) : 0,
  }
}

/** Distinctive content words of a phrase, for coverage proxies. */
const STOP = new Set('the a an and or of to in for on at by with from as is are was were be been this that these those it its their there which within into over under after before during per not no all any each more most other such only own same than then so'.split(' '))
const contentWords = (s) => norm(s).split(' ').filter((w) => w.length > 4 && !STOP.has(w))

/**
 * Coverage proxies — labeled as proxies because that is what they are.
 *
 * Prose does not cite ids, so "did the report address this recommendation"
 * cannot be measured exactly. Sharing a distinctive content word is a
 * weak signal on its own and a useful one COMPARATIVELY: both arms are
 * measured the same way against the same register, so a difference
 * between them means something even though the absolute number does not.
 */
/**
 * The part of a zone label a writer would actually type.
 *
 * Labels carry their own annotations — `Room 214 (refurnished — logger
 * location)` — and no report names a zone that way. Matching the whole
 * normalized label would read zero on every arm of every case, which
 * looks like a measurement and is a broken one, so the qualifier is cut
 * at the first parenthesis or dash and the name is what remains.
 */
const zoneKey = (label) => norm(String(label).split(/\s*[(—–-]/)[0])

function coverage(flat, wire) {
  const prose = flat.map(([, t]) => norm(t)).join(' ')
  const hit = (s) => {
    const w = contentWords(s)
    return w.length > 0 && w.some((x) => prose.includes(x))
  }
  const recs = wire.recommendation_options || []
  const findings = wire.findings || []
  const zones = [...new Set(findings.map((f) => f.zone).filter(Boolean))]
  return {
    register_entries: recs.length,
    register_touched: recs.filter((r) => hit(r.action)).length,
    findings_total: findings.length,
    findings_touched: findings.filter((f) => hit(f.text)).length,
    zones_total: zones.length,
    zones_named: zones.filter((z) => { const k = zoneKey(z); return Boolean(k) && prose.includes(k) }).length,
  }
}

/** The audit and the liability floor, per section, exactly as production runs them. */
function gates(flat, pkg) {
  const perSection = {}
  let blocked = 0
  let banned = 0
  for (const [key, text] of flat) {
    const issues = ENGINE.auditNarrative(text, pkg, { requireUnconditional: false })
    const summary = ENGINE.summarizeAudit(issues)
    let hits = []
    try { hits = ENGINE.scanProseForBannedLanguage(text) } catch { hits = [] }
    if (!summary.supported) blocked++
    if (hits.length) banned++
    perSection[key] = {
      supported: summary.supported,
      blocking: summary.blocking,
      warnings: summary.warnings,
      rules: [...new Set(issues.map((i) => i.id))],
      banned_terms: hits.map((h) => h.term),
    }
  }
  return { blocked_sections: blocked, sections_with_banned_language: banned, per_section: perSection }
}

// ── One arm, one fixture ───────────────────────────────────────────────

/**
 * One CommonJS module out of `api/**`, through Node's own interop.
 *
 * These are the real server modules, imported unchanged — the prompt the
 * endpoint sends and the adapter it calls. Node hands a CJS
 * `module.exports` back as the namespace's `default`; the fallback covers
 * a named export the lexer managed to detect.
 */
const cjs = async (spec) => {
  const ns = await import(spec)
  return ns.default || ns
}

async function runArm({ name, system, fixture, apiKey, dry }) {
  const { requestReportSections, estimateCost, MODEL } = await cjs('../api/_report-authoring-provider.js')

  if (dry) {
    const payload = { evidence: fixture.wire }
    const approxIn = Math.ceil((system.length + JSON.stringify(payload).length) / 4)
    return { name, dry: true, approx_input_tokens: approxIn, model: MODEL, estimated_cost_usd: estimateCost(approxIn, 1200) }
  }

  const result = await requestReportSections({
    apiKey,
    system,
    payload: { evidence: fixture.wire },
    fetchFn: globalThis.fetch,
    subject: 'Report sections are',
  })
  if (!result.ok) return { name, failed: result.failure, detail: result.detail || '' }

  const envelope = result.envelope || {}
  const sections = envelope.sections && typeof envelope.sections === 'object' && !Array.isArray(envelope.sections)
    ? envelope.sections
    : envelope
  const rawPlan = envelope.authoring_plan && typeof envelope.authoring_plan === 'object' && !Array.isArray(envelope.authoring_plan)
    ? envelope.authoring_plan
    : null

  const flat = flatten(sections)
  // Validated against the EXACT wire package this arm was sent — the same
  // object, not a rebuild, so a reference that resolves here is one the
  // writer really was given.
  const planCheck = rawPlan ? ENGINE.validateAuthoringPlan(rawPlan, fixture.wire) : null

  return {
    name,
    model: result.model,
    usage: result.usage,
    cost_usd: result.cost,
    sections_present: flat.map(([k]) => k),
    sections_absent: WRITABLE.filter((k) => !flat.some(([x]) => x === k || x.startsWith(`${k}.`))),
    words: Object.fromEntries(flat.map(([k, t]) => [k, words(t)])),
    words_total: flat.reduce((a, [, t]) => a + words(t), 0),
    repetition: repetition(flat),
    coverage: coverage(flat, fixture.wire),
    gates: gates(flat, fixture.pkg),
    plan: planCheck && {
      present: true,
      usable: planCheck.usable,
      all_references_resolve: planCheck.rejected.length === 0,
      unresolved: planCheck.rejected.map((r) => `${r.field || r.reason}:${r.detail || ''}`),
      fields_used: Object.entries(planCheck.plan)
        .filter(([, v]) => (Array.isArray(v) ? v.length : Boolean(v)))
        .map(([k]) => k),
    },
    sections,
  }
}

// ── The human rubric ───────────────────────────────────────────────────

const RUBRIC = [
  ['Coherence', 'do the sections read as one investigation, or five essays'],
  ['Factual accuracy', 'every figure, zone and criterion matches the record'],
  ['Section agreement', 'no two sections say different things about the same subject'],
  ['Recommendation usefulness', 'the framing helps a reader act, and adds nothing the register lacks'],
  ['Repetition', 'nothing is said twice; 5 = no avoidable repetition'],
  ['Unsupported interpretation', 'nothing asserted the package does not carry; 5 = none'],
  ['Assessor cleanup required', 'how much editing before issue; 5 = none'],
]

function rubricForm(caseKey) {
  const rows = RUBRIC.map(([name, why]) =>
    `| ${name} | ☐ 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5 | ☐ 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5 |  | _${why}_ |`)
  return [
    `### Rubric — ${caseKey}`,
    '',
    'Score each 1–5 for both arms. **A gap of 2 or more points requires a note**;',
    'a difference that large without a stated reason is a preference, not a finding.',
    '',
    '| Category | Arm A (no plan) | Arm B (plan) | Note (required if gap ≥ 2) | What it means |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '**Overall: which report would you send, and what made the difference?**',
    '',
    '> ',
    '',
  ].join('\n')
}

// ── Reporting ──────────────────────────────────────────────────────────

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : 'n/a')

function compareBlock(a, b) {
  if (a.failed || b.failed) {
    return `> One arm did not complete: A=${a.failed || 'ok'} B=${b.failed || 'ok'}. No comparison is possible.\n`
  }
  const rows = [
    ['sections produced', a.sections_present.length, b.sections_present.length],
    ['sections missing', a.sections_absent.join(', ') || '—', b.sections_absent.join(', ') || '—'],
    ['words total', a.words_total, b.words_total],
    ['duplicate sentences', a.repetition.duplicate_sentences, b.repetition.duplicate_sentences],
    ['repeated 6-word runs', `${a.repetition.repeated_shingles} (${(a.repetition.repeat_rate * 100).toFixed(1)}%)`, `${b.repetition.repeated_shingles} (${(b.repetition.repeat_rate * 100).toFixed(1)}%)`],
    ['register entries touched', `${a.coverage.register_touched}/${a.coverage.register_entries} (${pct(a.coverage.register_touched, a.coverage.register_entries)})`, `${b.coverage.register_touched}/${b.coverage.register_entries} (${pct(b.coverage.register_touched, b.coverage.register_entries)})`],
    ['findings touched', `${a.coverage.findings_touched}/${a.coverage.findings_total}`, `${b.coverage.findings_touched}/${b.coverage.findings_total}`],
    ['zones named', `${a.coverage.zones_named}/${a.coverage.zones_total}`, `${b.coverage.zones_named}/${b.coverage.zones_total}`],
    ['sections blocked by audit', a.gates.blocked_sections, b.gates.blocked_sections],
    ['sections with banned language', a.gates.sections_with_banned_language, b.gates.sections_with_banned_language],
    ['input / output tokens', `${a.usage.input_tokens} / ${a.usage.output_tokens}`, `${b.usage.input_tokens} / ${b.usage.output_tokens}`],
    ['cost (USD)', a.cost_usd, b.cost_usd],
  ]
  const lines = [
    '| Signal | Arm A (no plan) | Arm B (plan) |',
    '|---|---|---|',
    ...rows.map(([k, x, y]) => `| ${k} | ${x} | ${y} |`),
  ]
  if (b.plan) {
    lines.push('', '**Plan (arm B only)**', '',
      `- usable: \`${b.plan.usable}\``,
      `- every reference resolves: \`${b.plan.all_references_resolve}\``,
      `- fields used: ${b.plan.fields_used.join(', ') || '—'}`,
      b.plan.unresolved.length ? `- unresolved: ${b.plan.unresolved.join('; ')}` : '- unresolved: none')
  } else {
    lines.push('', '> Arm B returned no plan. Either the model ignored the wrapper, or the plan was not an object.')
  }
  return lines.join('\n')
}

function sectionsBlock(arm) {
  if (arm.failed) return `_arm did not complete (${arm.failed})_`
  const flat = flatten(arm.sections)
  if (!flat.length) return '_no sections_'
  return flat.map(([k, t]) => {
    const g = arm.gates.per_section[k] || {}
    const flag = g.supported === false ? ' **[BLOCKED BY AUDIT]**' : ''
    const rules = g.rules && g.rules.length ? ` _(${g.rules.join(', ')})_` : ''
    return `#### ${k}${flag}${rules}\n\n${t}\n`
  }).join('\n')
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const has = (f) => argv.includes(f)
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }

  const dry = !has('--run')
  const only = val('--case')
  const out = val('--out')
  const keys = only ? [only] : Object.keys(CASES)
  for (const k of keys) if (!CASES[k]) fail(`unknown case "${k}"; expected one of ${Object.keys(CASES).join(', ')}`)

  // Arm A first, and its hash is a hard requirement: a baseline that can
  // drift is not a baseline.
  const armA = loadArmA()
  const armAHash = sha(armA)
  if (armAHash !== ARM_A_SHA256) {
    fail(`arm A hash mismatch.\n  expected ${ARM_A_SHA256}\n  got      ${armAHash}\n`
      + `  The pinned baseline at ${ARM_A_COMMIT} is not the prompt this harness was built against. `
      + 'Refusing to compare against an unknown baseline.')
  }
  const { REPORT_SECTIONS_SYSTEM_PROMPT: armB } = await cjs('../api/_report-sections-prompt.js')
  const armBHash = sha(armB)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!dry && !apiKey) fail('--run needs ANTHROPIC_API_KEY in the environment')

  // Both hashes are settled before the engine is booted, so a drifted
  // baseline costs nothing and a run that gets this far is comparable.
  await loadEngine()

  const head = [
    '# Authoring A/B — plan vs no plan',
    '',
    `Run: ${new Date().toISOString()}${dry ? '  ·  **DRY RUN — no provider calls made**' : ''}`,
    '',
    '| Arm | Source | Chars | sha256 |',
    '|---|---|---|---|',
    `| A (no plan) | pinned commit \`${ARM_A_COMMIT}\` | ${armA.length} | \`${armAHash.slice(0, 16)}…\` |`,
    `| B (plan) | working tree | ${armB.length} | \`${armBHash.slice(0, 16)}…\` |`,
    '',
    armAHash === armBHash
      ? '> **The two arms are identical.** There is nothing to compare.'
      : '> Arm A is read from a commit and hash-checked, so the baseline cannot drift. Arm B\'s hash is recorded, not pinned.',
    '',
  ]

  const body = []
  let total = 0
  for (const key of keys) {
    const fixture = await buildFixture(key)
    body.push(`\n---\n\n## Case: ${key} — ${fixture.label}`, '',
      `Package: ${fixture.wire.findings.length} findings · ${fixture.wire.recommendation_options.length} recommendations `
      + `· ${fixture.wire.pathways.length} pathways · ${JSON.stringify(fixture.wire).length} chars on the wire`, '')

    const a = await runArm({ name: 'A', system: armA, fixture, apiKey, dry })
    const b = await runArm({ name: 'B', system: armB, fixture, apiKey, dry })

    if (dry) {
      body.push(`Would call ${a.model} twice. Approx input ${a.approx_input_tokens} / ${b.approx_input_tokens} tokens; `
        + `estimated **$${((a.estimated_cost_usd || 0) + (b.estimated_cost_usd || 0)).toFixed(4)}** for this case.`, '')
      total += (a.estimated_cost_usd || 0) + (b.estimated_cost_usd || 0)
      continue
    }

    total += (a.cost_usd || 0) + (b.cost_usd || 0)
    body.push('### Deterministic signals', '', compareBlock(a, b), '',
      rubricForm(key),
      '<details><summary>Arm A output</summary>\n', sectionsBlock(a), '\n</details>', '',
      '<details><summary>Arm B output</summary>\n', sectionsBlock(b), '\n</details>', '')
  }

  const tail = ['', '---', '',
    `Total ${dry ? 'estimated ' : ''}cost: **$${total.toFixed(4)}**`, '',
    dry ? 'Re-run with `--run` to make the calls.' : 'Fill in the rubric while reading. The deterministic table says what planning COST; only the rubric says what it GAINED.', '']

  const doc = [...head, ...body, ...tail].join('\n')
  if (out) { writeFileSync(out, doc); console.log(`ab-authoring: wrote ${out}`) } else console.log(doc)
}

/**
 * The deterministic half, exported so it can be tested on its own.
 *
 * A signal nobody has ever seen move is not a signal, and these are the
 * numbers the whole comparison rests on — see
 * `tests/scripts/ab-authoring.test.ts`.
 */
export const __eval = { flatten, words, norm, repetition, coverage, zoneKey, rubricForm, sha, RUBRIC, ARM_A_SHA256, ARM_A_COMMIT, WRITABLE }

// Run only when invoked directly. Importing this file — which the guard
// test does — must not boot Vite, read git or call a provider.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((e) => fail((e && e.stack) || String(e)))
    // The SSR server holds the process open; the run is over either way,
    // so close it whether main resolved or the catch already exited.
    .finally(() => { if (ENGINE) ENGINE.close() })
}
