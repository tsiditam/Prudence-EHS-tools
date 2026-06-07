#!/usr/bin/env node
/**
 * Jasper output-quality eval harness (P1 item 6).
 *
 * Deterministic, fixture-based — mirrors scripts/acceptance-check.mjs so it
 * can be wired as an acceptance group (`npm run accept:jasper-eval`) and
 * gate future changes without network or a live model call.
 *
 * Each scenario in the config carries a fixture `answer` (a recorded Jasper
 * response), the `tool_calls` made that turn, and a `next_step_manual_score`.
 * We score four dimensions per scenario, reusing the production linter:
 *   1. truncation     — ends on a complete sentence, all four sections +
 *                       "IH Review Required" present.
 *   2. value_fidelity — every framework-adjacent concentration is tool-backed
 *                       (api/_jasper-lint.js checkUnbackedThresholds).
 *   3. leakage        — the output linter (lintJasperOutput) does not trip.
 *   4. next_step      — >= 3 specific numbered next steps + manual score >=
 *                       threshold.
 *
 * Exit 0 = every scenario passes every dimension. Exit 1 = a failure. Exit 2
 * = runner error. The scoring functions are exported for unit testing.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { argv, exit } from 'node:process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { lintJasperOutput, checkUnbackedThresholds } = require('../api/_jasper-lint.js')

const SECTIONS = [
  '## Assessment context',
  '## Screening interpretation',
  '## Recommended next steps',
  '## Defensibility note',
]
const MIN_NEXT_STEPS = 3
const DEFAULT_MIN_MANUAL = 0.6

export function scoreTruncation(answer) {
  const text = String(answer || '')
  const reasons = []
  for (const s of SECTIONS) if (!text.includes(s)) reasons.push(`missing section "${s}"`)
  if (!/IH Review Required\s*$/.test(text.trim())) reasons.push('does not end with "IH Review Required"')
  // Complete-sentence check: the body before the closing line should end on
  // terminal punctuation (not a mid-sentence cutoff).
  const beforeClose = text.replace(/IH Review Required\s*$/, '').trim()
  if (beforeClose && !/[.!?:)\]"”]$/.test(beforeClose)) reasons.push('body ends mid-sentence (truncation)')
  return { pass: reasons.length === 0, reasons }
}

export function scoreValueFidelity(answer, toolCalls = []) {
  const retrievalUsed = (toolCalls || []).some(
    (t) => t === 'lookup_exposure_limit' || t === 'search_standards_corpus',
  )
  const hits = checkUnbackedThresholds(String(answer || ''), { retrievalUsed })
  return { pass: hits.length === 0, reasons: hits.map((h) => `unbacked threshold "${h.term}"`) }
}

export function scoreLeakage(answer) {
  const hits = lintJasperOutput(String(answer || ''))
  return { pass: hits.length === 0, reasons: hits.map((h) => `prohibited phrasing "${h.term}" (${h.category})`) }
}

export function nextStepsSection(answer) {
  const text = String(answer || '')
  const start = text.indexOf('## Recommended next steps')
  if (start === -1) return ''
  const rest = text.slice(start + '## Recommended next steps'.length)
  const nextHeader = rest.indexOf('\n## ')
  return nextHeader === -1 ? rest : rest.slice(0, nextHeader)
}

export function scoreNextStep(answer, manualScore, minManual = DEFAULT_MIN_MANUAL) {
  const section = nextStepsSection(answer)
  const steps = (section.match(/^\s*\d+\.\s+\S/gm) || []).length
  const reasons = []
  if (steps < MIN_NEXT_STEPS) reasons.push(`only ${steps} numbered next steps; need >= ${MIN_NEXT_STEPS}`)
  const ms = typeof manualScore === 'number' ? manualScore : 0
  if (ms < minManual) reasons.push(`manual next-step score ${ms} < ${minManual}`)
  return { pass: reasons.length === 0, reasons, steps }
}

export function scoreScenario(scn, minManual = DEFAULT_MIN_MANUAL) {
  const dims = {
    truncation: scoreTruncation(scn.answer),
    value_fidelity: scoreValueFidelity(scn.answer, scn.tool_calls),
    leakage: scoreLeakage(scn.answer),
    next_step: scoreNextStep(scn.answer, scn.next_step_manual_score, minManual),
  }
  const pass = Object.values(dims).every((d) => d.pass)
  return { id: scn.id, label: scn.label, pass, dims }
}

// ── CLI runner ─────────────────────────────────────────────────────────
function main() {
  const ANSI = { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' }
  const i = argv.indexOf('--config')
  const configPath = i > -1 ? argv[i + 1] : 'scripts/acceptance/jasper-eval.json'
  const full = resolve(join(process.cwd(), configPath))
  if (!existsSync(full)) {
    console.log(`${ANSI.red}Config not found: ${full}${ANSI.reset}`)
    exit(2)
  }
  let config
  try {
    config = JSON.parse(readFileSync(full, 'utf8'))
  } catch (e) {
    console.log(`${ANSI.red}Failed to parse config: ${e.message}${ANSI.reset}`)
    exit(2)
  }
  const minManual = typeof config.minManualScore === 'number' ? config.minManualScore : DEFAULT_MIN_MANUAL
  console.log(`${ANSI.bold}Jasper Output-Quality Eval${ANSI.reset}`)
  console.log(`${ANSI.dim}Config: ${configPath} — ${config.scenarios.length} scenarios${ANSI.reset}\n`)

  let failed = 0
  for (const scn of config.scenarios) {
    const r = scoreScenario(scn, minManual)
    if (r.pass) {
      console.log(`${ANSI.green}✓ PASS${ANSI.reset}  ${r.id}  ${r.label || ''}`)
    } else {
      failed += 1
      console.log(`${ANSI.red}✗ FAIL${ANSI.reset}  ${r.id}  ${r.label || ''}`)
      for (const [dim, res] of Object.entries(r.dims)) {
        if (!res.pass) console.log(`        ${ANSI.red}${dim}: ${res.reasons.join('; ')}${ANSI.reset}`)
      }
    }
  }

  console.log(`\n${ANSI.bold}Summary${ANSI.reset}`)
  console.log(`  Passed: ${ANSI.green}${config.scenarios.length - failed}${ANSI.reset}`)
  console.log(`  Failed: ${failed > 0 ? ANSI.red : ANSI.dim}${failed}${ANSI.reset}`)
  if (failed > 0) {
    console.log(`\n${ANSI.red}${ANSI.bold}JASPER EVAL FAILED${ANSI.reset}`)
    exit(1)
  }
  console.log(`\n${ANSI.green}${ANSI.bold}JASPER EVAL PASSED${ANSI.reset}`)
  exit(0)
}

// Run only when invoked directly (not when imported by the unit test).
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
if (invokedDirectly) main()
