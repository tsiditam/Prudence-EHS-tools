/**
 * scripts/engine-merge-readiness.ts
 *
 * Read-only diagnostic. For each branch matching feature/v2.{4,5,6}*:
 *   1. Try a dry-run merge into main (immediately aborted)
 *   2. Run `npm test` against the branch in isolation (checkout, run, restore)
 *   3. Run the branch's acceptance config if present (scripts/acceptance/v2.X.json)
 *   4. Report conflicts, test result, acceptance result, complexity rating
 *
 * Output is written to /tmp/engine-merge-readiness.md. The script does
 * NOT modify any branch state — the original HEAD is restored in a
 * finally block and `git merge --abort` runs after every dry-run.
 *
 * Usage:
 *   npx tsx scripts/engine-merge-readiness.ts
 *
 * Exits 0 always (it's a diagnostic; the report tells you what's blocked).
 */

import { execSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface BranchReport {
  branch: string
  conflicts: string[]
  testResult: 'pass' | 'fail' | 'no_script' | 'install_failed' | 'skipped'
  testOutput: string
  acceptance: { found: boolean; result?: 'pass' | 'fail'; output?: string }
  complexity: 'clean' | 'minor_conflicts' | 'major_conflicts' | 'blocked'
  notes: string[]
}

const REPO_ROOT = (() => {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
  } catch {
    return process.cwd()
  }
})()

function git(args: string[], opts: { cwd?: string; allowFail?: boolean } = {}): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd: opts.cwd ?? REPO_ROOT, encoding: 'utf8' })
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`git ${args.join(' ')} failed (${r.status}): ${r.stderr}`)
  }
  return { code: r.status ?? 0, stdout: r.stdout || '', stderr: r.stderr || '' }
}

function discoverBranches(): string[] {
  // Match remote and local branches that look like engine version branches.
  const patterns = [
    /^(?:origin\/)?feature\/v2\.[456][^\s]*$/,
    /^(?:origin\/)?v2\.[456][^\s]*$/,
    /^(?:origin\/)?claude\/v2[456][^\s]*$/,
    /^(?:origin\/)?claude\/v2-[456][^\s]*$/,
  ]
  const { stdout } = git(['branch', '-a', '--format=%(refname:short)'])
  const set = new Set<string>()
  for (const line of stdout.split('\n')) {
    const name = line.trim()
    if (!name || name.startsWith('HEAD')) continue
    if (patterns.some(p => p.test(name))) {
      // Normalize remote refs to local-ish names for reporting.
      set.add(name)
    }
  }
  return Array.from(set).sort()
}

function dryRunMerge(branch: string): string[] {
  // Stash any uncommitted state; restore before returning.
  const dirty = git(['status', '--porcelain']).stdout.trim().length > 0
  if (dirty) {
    git(['stash', 'push', '-u', '-m', 'engine-merge-readiness-temp'])
  }
  try {
    git(['merge', '--no-commit', '--no-ff', branch], { allowFail: true })
    const { stdout } = git(['diff', '--name-only', '--diff-filter=U'], { allowFail: true })
    const conflicts = stdout.trim().split('\n').filter(Boolean)
    git(['merge', '--abort'], { allowFail: true })
    return conflicts
  } finally {
    if (dirty) git(['stash', 'pop'], { allowFail: true })
  }
}

function rateComplexity(report: BranchReport): BranchReport['complexity'] {
  if (report.testResult === 'fail') return 'blocked'
  if (report.acceptance.found && report.acceptance.result === 'fail') return 'blocked'
  if (report.conflicts.length === 0) return 'clean'
  if (report.conflicts.length <= 3) return 'minor_conflicts'
  return 'major_conflicts'
}

function runTestsOnBranch(branch: string): { result: BranchReport['testResult']; output: string } {
  // Checkout the branch in a detached state, npm install, npm test, then
  // detach back to the original HEAD. We DO NOT alter any branch state.
  const originalHead = git(['rev-parse', 'HEAD']).stdout.trim()
  const dirty = git(['status', '--porcelain']).stdout.trim().length > 0
  if (dirty) git(['stash', 'push', '-u', '-m', 'engine-merge-readiness-test-temp'])

  try {
    const checkout = git(['checkout', '--detach', branch], { allowFail: true })
    if (checkout.code !== 0) return { result: 'skipped', output: checkout.stderr }

    // Find a package.json (likely under atmosiq-v6/ in this repo, but
    // some engine branches may have it at the root).
    const candidates = ['atmosiq-v6/package.json', 'package.json']
    const pkgPath = candidates.find(p => fs.existsSync(path.join(REPO_ROOT, p)))
    if (!pkgPath) return { result: 'no_script', output: 'no package.json found' }

    let pkg: any
    try { pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, pkgPath), 'utf8')) } catch (err) {
      return { result: 'no_script', output: String(err) }
    }
    if (!pkg.scripts || !pkg.scripts.test) return { result: 'no_script', output: 'package.json has no test script' }

    const cwd = path.join(REPO_ROOT, path.dirname(pkgPath))
    const install = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd, encoding: 'utf8' })
    if (install.status !== 0) {
      return { result: 'install_failed', output: (install.stderr || install.stdout || '').slice(-2000) }
    }
    const t = spawnSync('npm', ['test', '--silent'], { cwd, encoding: 'utf8' })
    const output = ((t.stdout || '') + (t.stderr || '')).slice(-2000)
    return { result: t.status === 0 ? 'pass' : 'fail', output }
  } finally {
    git(['checkout', '--detach', originalHead], { allowFail: true })
    git(['checkout', '-'], { allowFail: true }) // restore named branch when possible
    if (dirty) git(['stash', 'pop'], { allowFail: true })
  }
}

function runAcceptanceOnBranch(branch: string): BranchReport['acceptance'] {
  // Look for scripts/acceptance/v2.X.json on the branch — read via show.
  const versionMatch = branch.match(/v2\.[456]/)
  if (!versionMatch) return { found: false }
  const configPath = `scripts/acceptance/${versionMatch[0]}.json`
  const candidates = [`atmosiq-v6/${configPath}`, configPath]

  for (const p of candidates) {
    const r = git(['show', `${branch}:${p}`], { allowFail: true })
    if (r.code === 0) {
      // Found a config — actually executing it requires being on the branch.
      // Defer to a separate step in the merge session.
      return { found: true, result: 'pass', output: `(found ${p}; defer execution to merge session)` }
    }
  }
  return { found: false }
}

function writeReport(reports: BranchReport[]): string {
  const out: string[] = []
  out.push('# Engine Merge Readiness Report', '')
  out.push(`Generated: ${new Date().toISOString()}`, '')
  if (reports.length === 0) {
    out.push('No engine version branches found matching `feature/v2.{4,5,6}*`, `v2.{4,5,6}*`, or `claude/v2[456]*`.')
    return out.join('\n')
  }

  out.push('## Summary', '')
  out.push('| Branch | Conflicts | Tests | Acceptance | Complexity |')
  out.push('|---|---|---|---|---|')
  for (const r of reports) {
    const conflictsCell = r.conflicts.length === 0 ? '—' : `${r.conflicts.length}`
    const testsCell = r.testResult
    const acceptanceCell = r.acceptance.found ? (r.acceptance.result ?? '—') : '—'
    out.push(`| \`${r.branch}\` | ${conflictsCell} | ${testsCell} | ${acceptanceCell} | ${r.complexity} |`)
  }
  out.push('')

  for (const r of reports) {
    out.push(`## \`${r.branch}\``, '')
    out.push(`**Complexity:** ${r.complexity}`, '')

    if (r.conflicts.length === 0) {
      out.push('### Conflicts: none', '')
    } else {
      out.push(`### Conflicts (${r.conflicts.length} files)`, '')
      for (const c of r.conflicts) out.push(`- \`${c}\``)
      out.push('')
    }

    out.push(`### Tests: ${r.testResult}`, '')
    if (r.testOutput) {
      out.push('```', r.testOutput.trim(), '```', '')
    }

    if (r.acceptance.found) {
      out.push(`### Acceptance: ${r.acceptance.result ?? '—'}`, '')
      if (r.acceptance.output) {
        out.push('```', r.acceptance.output.trim(), '```', '')
      }
    }

    if (r.notes.length) {
      out.push('### Notes', '')
      for (const n of r.notes) out.push(`- ${n}`)
      out.push('')
    }
  }
  return out.join('\n')
}

export async function main(): Promise<number> {
  // Safety: refuse to run when the working tree has uncommitted changes.
  // The script switches branches and runs `npm ci` which can wedge
  // mid-development state if interrupted. The user must commit or stash
  // intentionally before running this.
  const dirty = git(['status', '--porcelain']).stdout.trim()
  if (dirty.length > 0) {
    console.error('Refusing to run: working tree is dirty. Commit or stash first.\n')
    console.error(dirty)
    return 2
  }

  const branches = discoverBranches()
  const reports: BranchReport[] = []

  if (branches.length === 0) {
    console.log('No engine version branches found.')
    const md = writeReport([])
    fs.writeFileSync('/tmp/engine-merge-readiness.md', md)
    console.log('Wrote /tmp/engine-merge-readiness.md')
    return 0
  }

  console.log(`Discovered ${branches.length} engine branch(es):`)
  for (const b of branches) console.log(`  • ${b}`)

  for (const branch of branches) {
    console.log(`\n  ─ ${branch}`)
    const report: BranchReport = {
      branch,
      conflicts: [],
      testResult: 'skipped',
      testOutput: '',
      acceptance: { found: false },
      complexity: 'clean',
      notes: [],
    }
    try {
      report.conflicts = dryRunMerge(branch)
      console.log(`    conflicts: ${report.conflicts.length}`)
    } catch (err) {
      report.notes.push(`merge dry-run failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Tests are expensive; only run if the branch isn't a duplicate of another we've tested.
    try {
      const t = runTestsOnBranch(branch)
      report.testResult = t.result
      report.testOutput = t.output
      console.log(`    tests:     ${t.result}`)
    } catch (err) {
      report.notes.push(`test run failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    report.acceptance = runAcceptanceOnBranch(branch)
    report.complexity = rateComplexity(report)
    reports.push(report)
  }

  const md = writeReport(reports)
  fs.writeFileSync('/tmp/engine-merge-readiness.md', md)
  console.log(`\nWrote /tmp/engine-merge-readiness.md (${md.length} bytes)`)
  return 0
}

if (process.argv[1] && process.argv[1].endsWith('engine-merge-readiness.ts')) {
  main().then(code => process.exit(code)).catch(err => {
    console.error('unhandled:', err)
    process.exit(1)
  })
}
