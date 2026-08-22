/**
 * Run with: node --test prospecting/scripts/
 *
 * Two things are worth testing here. The scoring has to be reproducible, or
 * the pipeline is just a model's opinion with a number stapled on. And the
 * rubric in icp.md has to match the rubric in score.mjs, because the agent
 * reads the prose and the store applies the code — if they drift, the agent
 * is hunting for signals that no longer score.
 */

import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { DISQUALIFIERS, PENALTIES, SEGMENTS, SIGNALS, missingGroups, scoreLead, tierFor } from './score.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, 'lead-store.mjs')
const ICP = resolve(HERE, '..', 'icp.md')

const evidenced = key => ({ key, evidence: { url: `https://example.com/${key}` } })

describe('scoreLead', () => {
  it('is reproducible for the same record', () => {
    const lead = { segment: 'ih_consultancy', signals: [evidenced('cih_on_staff'), evidenced('iaq_service_page')] }
    assert.deepEqual(scoreLead(lead), scoreLead(structuredClone(lead)))
    assert.equal(scoreLead(lead).total, 30 + 12 + 10)
  })

  it('drops a signal with no source URL and says it dropped it', () => {
    const lead = { segment: 'ih_consultancy', signals: [{ key: 'cih_on_staff', evidence: { note: 'saw it somewhere' } }] }
    const result = scoreLead(lead)
    assert.equal(result.total, 30)
    assert.deepEqual(result.rejected, [{ key: 'cih_on_staff', why: 'no verifiable source URL' }])
  })

  it('rejects a non-http evidence URL', () => {
    const lead = { segment: 'ih_consultancy', signals: [{ key: 'cih_on_staff', evidence: { url: 'linkedin, probably' } }] }
    assert.equal(scoreLead(lead).total, 30)
  })

  it('counts a repeated signal once', () => {
    const lead = { segment: 'ih_consultancy', signals: [evidenced('cih_on_staff'), evidenced('cih_on_staff')] }
    assert.equal(scoreLead(lead).total, 42)
  })

  it('zeroes a disqualified lead however good the rest looks', () => {
    const lead = {
      segment: 'ih_consultancy',
      signals: Object.keys(SIGNALS).map(evidenced),
      disqualified: { reason: 'competitor' },
    }
    const result = scoreLead(lead)
    assert.equal(result.total, 0)
    assert.equal(result.tier, 'X')
  })

  it('caps at 100 and floors at 0', () => {
    const everything = { segment: 'ih_consultancy', signals: Object.keys(SIGNALS).map(evidenced) }
    assert.equal(scoreLead(everything).total, 100)
    const nothing = { segment: 'unknown', penalties: Object.keys(PENALTIES) }
    assert.equal(scoreLead(nothing).total, 0)
  })

  it('throws on an invented signal rather than scoring it zero', () => {
    assert.throws(
      () => scoreLead({ segment: 'ih_consultancy', signals: [evidenced('looked_promising')] }),
      /Unknown signal: looked_promising/,
    )
  })

  it('cannot reach tier A without evidence from three signal groups', () => {
    // Segment base plus the two heaviest credential signals is still short.
    const credentialsOnly = { segment: 'ih_consultancy', signals: [evidenced('cih_on_staff'), evidenced('csp_on_staff'), evidenced('aiha_member'), evidenced('assp_member')] }
    const { total, tier } = scoreLead(credentialsOnly)
    assert.equal(total, 55)
    assert.equal(tier, 'B')
  })

  it('names the groups that have contributed nothing yet', () => {
    const lead = { segment: 'ih_consultancy', signals: [evidenced('cih_on_staff')] }
    assert.deepEqual(missingGroups(lead), ['practice', 'pain', 'size', 'reach', 'timing'])
  })

  it('assigns tiers at the documented boundaries', () => {
    assert.equal(tierFor(70).tier, 'A')
    assert.equal(tierFor(69).tier, 'B')
    assert.equal(tierFor(50).tier, 'B')
    assert.equal(tierFor(49).tier, 'C')
    assert.equal(tierFor(30).tier, 'C')
    assert.equal(tierFor(29).tier, 'D')
  })
})

describe('the rubric in icp.md matches the rubric in score.mjs', () => {
  const doc = readFileSync(ICP, 'utf8')
  const documented = new Set([...doc.matchAll(/`([a-z][a-z0-9_]*)`/g)].map(m => m[1]))
  const catalogued = new Set([
    ...Object.keys(SIGNALS),
    ...Object.keys(PENALTIES),
    ...Object.keys(DISQUALIFIERS),
    ...Object.keys(SEGMENTS),
  ])

  it('documents every key the code scores', () => {
    const undocumented = [...catalogued].filter(key => !documented.has(key))
    assert.deepEqual(undocumented, [], `icp.md does not mention: ${undocumented.join(', ')}`)
  })

  it('does not promise the agent a key the code will reject', () => {
    const invented = [...documented].filter(key => !catalogued.has(key))
    assert.deepEqual(invented, [], `icp.md describes keys score.mjs does not know: ${invented.join(', ')}`)
  })

  it('states each signal point value the code actually applies', () => {
    for (const [key, def] of Object.entries(SIGNALS)) {
      assert.match(doc, new RegExp(`\`${key}\`\\s*\\(\\+${def.points}\\)`), `icp.md misstates the points for ${key}`)
    }
    for (const [key, def] of Object.entries(PENALTIES)) {
      assert.match(doc, new RegExp(`\`${key}\`\\s*\\(−${Math.abs(def.points)}\\)`), `icp.md misstates the penalty for ${key}`)
    }
  })
})

describe('lead-store CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prospect-'))
  const log = join(dir, 'events.jsonl')
  const run = (...args) =>
    execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PROSPECT_LOG: log, PROSPECT_TARGETS: join(dir, 'targets.json') },
    })
  const runFails = (...args) => {
    try {
      run(...args)
      return null
    } catch (err) {
      return err.stderr
    }
  }

  after(() => rmSync(dir, { recursive: true, force: true }))

  it('adds a lead and derives its id from the domain', () => {
    assert.match(run('add', '--org', 'Acme IH', '--domain', 'https://www.acmeih.com/', '--segment', 'ih_consultancy'), /added acmeih-com/)
  })

  it('refuses a second lead on the same domain', () => {
    assert.match(runFails('add', '--org', 'Acme Industrial Hygiene LLC', '--domain', 'acmeih.com', '--segment', 'ih_consultancy'), /already tracked as "acmeih-com"/)
  })

  it('refuses a lead with no domain to verify against', () => {
    assert.match(runFails('add', '--org', 'Vague Consulting', '--segment', 'ih_consultancy'), /needs --domain/)
  })

  it('refuses a segment it does not score', () => {
    assert.match(runFails('add', '--org', 'X', '--domain', 'x.com', '--segment', 'seems_relevant'), /unknown --segment/)
  })

  it('refuses a signal with no source URL', () => {
    assert.match(runFails('signal', 'acmeih-com', '--key', 'cih_on_staff', '--note', 'pretty sure'), /--url must be the page you actually read/)
  })

  it('records an evidenced signal and reports the new score', () => {
    assert.match(run('signal', 'acmeih-com', '--key', 'cih_on_staff', '--url', 'https://acmeih.com/team'), /\+12 cih_on_staff → 42 \(tier C\)/)
  })

  it('refuses a contact route with no page publishing it', () => {
    assert.match(
      runFails('contact', 'acmeih-com', '--route', 'public_email', '--value', 'jordan.reyes@acmeih.com', '--source-url', 'guessed'),
      /Never record a guessed or pattern-built address/,
    )
  })

  it('derives the reachability signals from a recorded route', () => {
    const out = run('contact', 'acmeih-com', '--name', 'Jordan Reyes', '--role', 'Principal', '--route', 'public_email', '--value', 'info@acmeih.com', '--source-url', 'https://acmeih.com/contact')
    assert.match(out, /\+public_contact_email, \+named_decision_maker/)
    assert.match(out, /→ 56 \(tier B\)/)
  })

  it('qualifies a lead once the rubric has cleared it', () => {
    assert.match(run('status', 'acmeih-com', '--to', 'qualified'), /researching → qualified/)
  })

  it('will not qualify a tier C lead without --force', () => {
    run('add', '--org', 'Thin Lead', '--domain', 'thin.example', '--segment', 'fm_property_manager')
    assert.match(runFails('status', 'thin-example', '--to', 'qualified'), /Qualify A\/B leads, or pass --force/)
  })

  it('routes a hard stop through disqualify so the reason is on the record', () => {
    assert.match(runFails('status', 'thin-example', '--to', 'disqualified'), /use `disqualify --reason/)
    assert.match(run('disqualify', 'thin-example', '--reason', 'no_iaq_practice'), /disqualified — No evidence of indoor air quality work/)
  })

  it('folds the append-only log back into current state', () => {
    const [lead] = JSON.parse(run('list', '--status', 'qualified', '--json'))
    assert.equal(lead.id, 'acmeih-com')
    assert.equal(lead.score.total, 56)
    assert.equal(lead.contacts.length, 1)
    assert.equal(readFileSync(log, 'utf8').trim().split('\n').filter(l => l.includes('"acmeih-com"')).length, 7)
  })

  it('exports only qualified leads, with their evidence attached', () => {
    const csv = join(dir, 'handoff.csv')
    run('export', '--csv', csv)
    const body = readFileSync(csv, 'utf8')
    assert.match(body, /"acmeih-com"/)
    assert.doesNotMatch(body, /thin-example/)
    assert.match(body, /https:\/\/acmeih\.com\/team/)
  })
})
