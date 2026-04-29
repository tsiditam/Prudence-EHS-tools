#!/usr/bin/env node
/**
 * v2.3 acceptance runner.
 *
 * Reads scripts/acceptance/v2.3.json and runs each criterion's
 * checks against the rendered fixture .txt files (and against the
 * engine source for engine_version_equals). Exits 0 iff every
 * criterion passes; 1 otherwise.
 *
 * Before running checks, this script invokes the fixture renderer
 * to produce /tmp/acceptance-report*.docx + .txt.
 */

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const CONFIG_PATH = resolve(__dirname, 'v2.3.json')

function colorize(s, code) {
  return process.stdout.isTTY ? `[${code}m${s}[0m` : s
}
const green = s => colorize(s, '32')
const red = s => colorize(s, '31')
const yellow = s => colorize(s, '33')
const dim = s => colorize(s, '90')

function readEngineVersion() {
  const path = resolve(PROJECT_ROOT, 'src', 'engine', 'types', 'citation.ts')
  const src = readFileSync(path, 'utf-8')
  const m = /ENGINE_VERSION\s*=\s*'([^']+)'/.exec(src)
  if (!m) throw new Error('ENGINE_VERSION not found in citation.ts')
  return m[1]
}

function runCheck(check) {
  switch (check.type) {
    case 'rendered_contains': {
      if (!existsSync(check.reportPath)) {
        return { pass: false, reason: `Fixture file missing: ${check.reportPath}` }
      }
      const text = readFileSync(check.reportPath, 'utf-8')
      const found = text.includes(check.needle)
      return found
        ? { pass: true }
        : { pass: false, reason: `Needle "${check.needle}" not found in ${check.reportPath}` }
    }
    case 'rendered_excludes': {
      if (!existsSync(check.reportPath)) {
        return { pass: false, reason: `Fixture file missing: ${check.reportPath}` }
      }
      const text = readFileSync(check.reportPath, 'utf-8')
      const found = text.includes(check.needle)
      return found
        ? { pass: false, reason: `Forbidden needle "${check.needle}" present in ${check.reportPath}` }
        : { pass: true }
    }
    case 'engine_version_equals': {
      const actual = readEngineVersion()
      return actual === check.expected
        ? { pass: true }
        : { pass: false, reason: `Engine version is ${actual}, expected ${check.expected}` }
    }
    case 'vitest_passes': {
      const r = spawnSync('npx', ['vitest', 'run'], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, VITEST_RENDER_FIXTURES: '' },
      })
      if (r.status === 0) return { pass: true }
      return { pass: false, reason: `vitest exited ${r.status}\n${((r.stdout || '') + (r.stderr || '')).slice(-2000)}` }
    }
    default:
      return { pass: false, reason: `Unknown check type: ${check.type}` }
  }
}

function renderFixtures() {
  console.log(dim('[acceptance] rendering fixtures...'))
  const r = spawnSync(
    'npm',
    ['run', '--silent', 'render:acceptance:v2.3'],
    { cwd: PROJECT_ROOT, stdio: 'inherit' },
  )
  if (r.status !== 0) {
    console.error(red('[acceptance] FATAL: fixture renderer exited non-zero'))
    process.exit(1)
  }
}

function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  console.log(`\n${colorize('AtmosFlow ' + config.version, '36')} — acceptance runner\n`)

  renderFixtures()

  console.log()
  let totalPass = 0
  let totalFail = 0
  for (const criterion of config.criteria) {
    const results = criterion.checks.map(runCheck)
    const passed = results.every(r => r.pass)
    if (passed) {
      totalPass++
      console.log(`  ${green('✓')} ${criterion.id} — ${dim(criterion.label)}`)
    } else {
      totalFail++
      console.log(`  ${red('✗')} ${criterion.id} — ${criterion.label}`)
      for (const r of results) {
        if (!r.pass) console.log(`      ${red('reason:')} ${r.reason}`)
      }
    }
  }

  console.log()
  if (totalFail === 0) {
    console.log(`${green('PASS')} ${totalPass} / ${totalPass} criteria\n`)
    process.exit(0)
  } else {
    console.log(`${red('FAIL')} ${totalFail} of ${totalPass + totalFail} criteria\n`)
    process.exit(1)
  }
}

main()
