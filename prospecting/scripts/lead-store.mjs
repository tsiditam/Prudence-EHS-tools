#!/usr/bin/env node
/**
 * The prospector's pipeline store.
 *
 * State lives in an append-only event log (`pipeline/events.jsonl`) and the
 * current view of a lead is the fold of its events. Same shape as the
 * platform's own audit log, and for the same reason: you can always ask
 * what was known about a lead on a given day, and nothing that was once
 * recorded can quietly disappear.
 *
 * The agent writes only through this CLI. That keeps every record schema-
 * checked, every signal evidence-backed, and every score reproducible from
 * the log alone.
 *
 * Usage:
 *   lead-store.mjs add --org "Acme IH" --domain acmeih.com --segment ih_consultancy
 *   lead-store.mjs signal acmeih-com --key cih_on_staff --url https://... --note "..."
 *   lead-store.mjs contact acmeih-com --name "..." --role Principal --route public_email --value ops@acmeih.com --source-url https://...
 *   lead-store.mjs status acmeih-com --to qualified
 *   lead-store.mjs disqualify acmeih-com --reason competitor
 *   lead-store.mjs list --tier A
 *   lead-store.mjs show acmeih-com
 *   lead-store.mjs stats
 *   lead-store.mjs next
 *   lead-store.mjs export --csv handoff.csv
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DISQUALIFIERS, PENALTIES, SEGMENTS, SIGNALS, missingGroups, scoreLead } from './score.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
export const EVENT_LOG = process.env.PROSPECT_LOG ?? join(ROOT, 'pipeline', 'events.jsonl')
const TARGETS_FILE = process.env.PROSPECT_TARGETS ?? join(ROOT, 'targets.json')

export const STATUSES = ['new', 'researching', 'qualified', 'parked', 'handed_off', 'disqualified']
export const CONTACT_ROUTES = ['public_email', 'contact_form', 'linkedin', 'association_directory', 'conference', 'referral']

// --- event log -------------------------------------------------------------

function readEvents(logPath = EVENT_LOG) {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map((line, i) => {
      try {
        return JSON.parse(line)
      } catch (err) {
        throw new Error(`${logPath}:${i + 1} is not valid JSON — ${err.message}`)
      }
    })
}

function appendEvent(event, logPath = EVENT_LOG) {
  mkdirSync(dirname(logPath), { recursive: true })
  appendFileSync(logPath, `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

/** Fold the log into the current view of every lead. */
export function loadLeads(logPath = EVENT_LOG) {
  const leads = new Map()
  for (const event of readEvents(logPath)) {
    const lead = leads.get(event.lead_id) ?? {
      id: event.lead_id,
      signals: [],
      penalties: [],
      contacts: [],
      notes: [],
      status: 'new',
    }
    switch (event.type) {
      case 'created':
        Object.assign(lead, event.lead, { created_at: event.at })
        break
      case 'signal_added':
        lead.signals = [...lead.signals.filter(s => s.key !== event.signal.key), event.signal]
        break
      case 'penalty_added':
        lead.penalties = [...new Set([...lead.penalties, event.key])]
        break
      case 'contact_added':
        lead.contacts = [...lead.contacts, event.contact]
        break
      case 'status_changed':
        lead.status = event.to
        break
      case 'disqualified':
        lead.disqualified = { reason: event.reason, note: event.note ?? null, at: event.at }
        lead.status = 'disqualified'
        break
      case 'note_added':
        lead.notes = [...lead.notes, { text: event.text, at: event.at }]
        break
      default:
        throw new Error(`Unknown event type: ${event.type}`)
    }
    lead.updated_at = event.at
    leads.set(event.lead_id, lead)
  }
  return [...leads.values()].map(lead => ({ ...lead, score: scoreLead(lead) }))
}

export function findLead(id, logPath = EVENT_LOG) {
  return loadLeads(logPath).find(lead => lead.id === id) ?? null
}

// --- helpers ---------------------------------------------------------------

const now = () => new Date().toISOString()

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeDomain(value) {
  if (!value) return null
  return String(value).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim()
}

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      positional.push(arg)
    }
  }
  return { flags, positional }
}

function readTargets() {
  if (!existsSync(TARGETS_FILE)) return null
  return JSON.parse(readFileSync(TARGETS_FILE, 'utf8'))
}

// --- commands --------------------------------------------------------------

const commands = {}

commands.add = ({ flags }) => {
  const org = flags.org
  if (!org || org === true) fail('add needs --org "Organization Name"')
  const domain = normalizeDomain(flags.domain === true ? null : flags.domain)
  const segment = flags.segment === true ? 'unknown' : (flags.segment ?? 'unknown')
  if (!SEGMENTS[segment]) fail(`unknown --segment "${segment}". One of: ${Object.keys(SEGMENTS).join(', ')}`)
  if (!domain && !flags.force) {
    fail('add needs --domain (the primary source you will verify against). Pass --force to record a lead without one.')
  }

  const existing = loadLeads()
  const base = slugify(domain ?? org)
  const duplicate = existing.find(lead => normalizeDomain(lead.domain) === domain && domain !== null)
  if (duplicate) fail(`already tracked as "${duplicate.id}" (${duplicate.org}). Add signals to that record instead.`)

  let id = base
  for (let n = 2; existing.some(lead => lead.id === id); n++) id = `${base}-${n}`

  appendEvent({
    type: 'created',
    lead_id: id,
    at: now(),
    lead: {
      org,
      domain,
      segment,
      region: flags.region === true ? null : (flags.region ?? null),
      found_via: flags['found-via'] === true ? null : (flags['found-via'] ?? null),
      status: 'researching',
    },
  })
  appendEvent({ type: 'status_changed', lead_id: id, at: now(), to: 'researching' })
  console.log(`added ${id} — ${org} (${SEGMENTS[segment].label})`)
  console.log(`next: gather signals for ${missingGroups(findLead(id)).join(', ') || 'nothing — already covered'}`)
}

commands.signal = ({ flags, positional }) => {
  const id = positional[0]
  const lead = id ? findLead(id) : null
  if (!lead) fail(`no lead "${id}". Run: lead-store.mjs list`)
  const key = flags.key
  if (!SIGNALS[key]) fail(`unknown --key "${key}". One of: ${Object.keys(SIGNALS).join(', ')}`)
  const url = flags.url
  if (!url || url === true || !/^https?:\/\/\S+$/.test(url)) {
    fail(`--url must be the page you actually read. ${SIGNALS[key].note}`)
  }

  appendEvent({
    type: 'signal_added',
    lead_id: id,
    at: now(),
    signal: {
      key,
      evidence: { url, note: flags.note === true ? null : (flags.note ?? null) },
      observed_at: flags.observed === true ? now().slice(0, 10) : (flags.observed ?? now().slice(0, 10)),
    },
  })
  const updated = findLead(id)
  console.log(`${id}: +${SIGNALS[key].points} ${key} → ${updated.score.total} (tier ${updated.score.tier})`)
  const gaps = missingGroups(updated)
  if (gaps.length) console.log(`still missing: ${gaps.join(', ')}`)
}

commands.penalty = ({ flags, positional }) => {
  const id = positional[0]
  if (!findLead(id)) fail(`no lead "${id}"`)
  if (!PENALTIES[flags.key]) fail(`unknown --key "${flags.key}". One of: ${Object.keys(PENALTIES).join(', ')}`)
  appendEvent({ type: 'penalty_added', lead_id: id, at: now(), key: flags.key, note: flags.note === true ? null : (flags.note ?? null) })
  const updated = findLead(id)
  console.log(`${id}: ${PENALTIES[flags.key].points} ${flags.key} → ${updated.score.total} (tier ${updated.score.tier})`)
}

commands.contact = ({ flags, positional }) => {
  const id = positional[0]
  const lead = id ? findLead(id) : null
  if (!lead) fail(`no lead "${id}"`)
  const route = flags.route
  if (!CONTACT_ROUTES.includes(route)) fail(`--route must be one of: ${CONTACT_ROUTES.join(', ')}`)
  const sourceUrl = flags['source-url']
  if (!sourceUrl || sourceUrl === true || !/^https?:\/\/\S+$/.test(sourceUrl)) {
    fail('--source-url must be the page that publishes this contact route. Never record a guessed or pattern-built address.')
  }
  if (!flags.value || flags.value === true) fail('--value is the published address, handle, or form URL')

  const name = flags.name === true ? null : (flags.name ?? null)
  appendEvent({
    type: 'contact_added',
    lead_id: id,
    at: now(),
    contact: {
      name,
      role: flags.role === true ? null : (flags.role ?? null),
      route,
      value: flags.value,
      source_url: sourceUrl,
    },
  })

  // A recorded route IS the reachability evidence — derive the signals from
  // it rather than making the agent state the same fact twice.
  const derived = []
  if (route === 'public_email') derived.push('public_contact_email')
  if (name) derived.push('named_decision_maker')
  if (route === 'referral' || route === 'conference') derived.push('warm_path')
  for (const key of derived) {
    if (lead.signals.some(s => s.key === key)) continue
    appendEvent({
      type: 'signal_added',
      lead_id: id,
      at: now(),
      signal: { key, evidence: { url: sourceUrl, note: `derived from recorded ${route} route` }, observed_at: now().slice(0, 10) },
    })
  }

  const updated = findLead(id)
  console.log(`${id}: contact route recorded (${route})${derived.length ? ` → +${derived.join(', +')}` : ''} → ${updated.score.total} (tier ${updated.score.tier})`)
}

commands.status = ({ flags, positional }) => {
  const id = positional[0]
  const lead = id ? findLead(id) : null
  if (!lead) fail(`no lead "${id}"`)
  const to = flags.to
  if (!STATUSES.includes(to)) fail(`--to must be one of: ${STATUSES.join(', ')}`)
  if (to === 'disqualified') fail('use `disqualify --reason <reason>` so the reason is on the record')
  if (to === 'qualified' && lead.score.tier !== 'A' && lead.score.tier !== 'B' && !flags.force) {
    fail(`${id} scores ${lead.score.total} (tier ${lead.score.tier}). Qualify A/B leads, or pass --force with a note saying why.`)
  }
  appendEvent({ type: 'status_changed', lead_id: id, at: now(), to })
  console.log(`${id}: ${lead.status} → ${to}`)
}

commands.disqualify = ({ flags, positional }) => {
  const id = positional[0]
  if (!findLead(id)) fail(`no lead "${id}"`)
  if (!DISQUALIFIERS[flags.reason]) fail(`--reason must be one of: ${Object.keys(DISQUALIFIERS).join(', ')}`)
  appendEvent({ type: 'disqualified', lead_id: id, at: now(), reason: flags.reason, note: flags.note === true ? null : (flags.note ?? null) })
  console.log(`${id}: disqualified — ${DISQUALIFIERS[flags.reason]}`)
}

commands.note = ({ flags, positional }) => {
  const id = positional[0]
  if (!findLead(id)) fail(`no lead "${id}"`)
  const text = flags.text
  if (!text || text === true) fail('note needs --text "..."')
  appendEvent({ type: 'note_added', lead_id: id, at: now(), text })
  console.log(`${id}: note recorded`)
}

commands.list = ({ flags }) => {
  let leads = loadLeads()
  if (flags.tier && flags.tier !== true) leads = leads.filter(l => l.score.tier === flags.tier)
  if (flags.status && flags.status !== true) leads = leads.filter(l => l.status === flags.status)
  if (flags.segment && flags.segment !== true) leads = leads.filter(l => l.segment === flags.segment)
  leads.sort((a, b) => b.score.total - a.score.total)
  if (flags.limit && flags.limit !== true) leads = leads.slice(0, Number(flags.limit))

  if (flags.json) {
    console.log(JSON.stringify(leads, null, 2))
    return
  }
  if (leads.length === 0) {
    console.log('no leads match. `add` one, or widen the filters.')
    return
  }
  for (const lead of leads) {
    const contact = lead.contacts.length ? lead.contacts[0].route : 'no route yet'
    console.log(
      `${String(lead.score.total).padStart(3)} ${lead.score.tier}  ${lead.id.padEnd(28)} ${String(lead.status).padEnd(12)} ${contact.padEnd(20)} ${lead.org}`,
    )
  }
  console.log(`\n${leads.length} lead(s)`)
}

commands.show = ({ positional }) => {
  const lead = positional[0] ? findLead(positional[0]) : null
  if (!lead) fail(`no lead "${positional[0]}"`)
  console.log(`${lead.org}  [${lead.id}]`)
  console.log(`  segment   ${SEGMENTS[lead.segment]?.label ?? lead.segment}`)
  console.log(`  domain    ${lead.domain ?? '—'}`)
  console.log(`  region    ${lead.region ?? '—'}`)
  console.log(`  status    ${lead.status}`)
  console.log(`  score     ${lead.score.total} (tier ${lead.score.tier}) — ${lead.score.action}`)
  console.log('  evidence')
  for (const row of lead.score.breakdown) {
    const signal = lead.signals.find(s => s.key === row.key)
    const src = signal ? `  ${signal.evidence.url}` : ''
    console.log(`    ${row.points > 0 ? '+' : ''}${String(row.points).padStart(3)}  ${row.key}${src}`)
  }
  for (const rejected of lead.score.rejected) {
    console.log(`      —  ${rejected.key} (not counted: ${rejected.why})`)
  }
  if (lead.contacts.length) {
    console.log('  contact routes')
    for (const c of lead.contacts) console.log(`    ${c.route}: ${c.value}${c.name ? ` (${c.name}, ${c.role ?? 'role unknown'})` : ''} — ${c.source_url}`)
  }
  if (lead.notes.length) {
    console.log('  notes')
    for (const n of lead.notes) console.log(`    ${n.at.slice(0, 10)}  ${n.text}`)
  }
  const gaps = missingGroups(lead)
  if (gaps.length && !lead.disqualified) console.log(`  gaps      ${gaps.join(', ')}`)
}

commands.stats = () => {
  const leads = loadLeads()
  const targets = readTargets()
  const byTier = {}
  const bySegment = {}
  const byStatus = {}
  for (const lead of leads) {
    byTier[lead.score.tier] = (byTier[lead.score.tier] ?? 0) + 1
    bySegment[lead.segment] = (bySegment[lead.segment] ?? 0) + 1
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1
  }
  const qualified = leads.filter(l => l.status === 'qualified' || l.status === 'handed_off')
  const withRoute = qualified.filter(l => l.contacts.length > 0)

  console.log(`leads tracked      ${leads.length}`)
  console.log(`qualified          ${qualified.length}`)
  console.log(`  with a route     ${withRoute.length}`)
  console.log(`tiers              ${Object.entries(byTier).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}`)
  console.log(`segments           ${Object.entries(bySegment).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}`)
  console.log(`statuses           ${Object.entries(byStatus).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}`)

  if (!targets) return
  console.log('\nagainst target')
  const since = new Date(Date.now() - targets.window_days * 86400000).toISOString()
  const newThisWindow = leads.filter(l => (l.created_at ?? '') >= since)
  const qualifiedThisWindow = newThisWindow.filter(l => ['qualified', 'handed_off'].includes(l.status))
  const rows = [
    [`new leads / ${targets.window_days}d`, newThisWindow.length, targets.new_leads],
    [`qualified / ${targets.window_days}d`, qualifiedThisWindow.length, targets.qualified_leads],
    ['tier A on the board', byTier.A ?? 0, targets.tier_a_standing],
  ]
  for (const [label, actual, target] of rows) {
    const state = actual >= target ? 'met' : `${target - actual} short`
    console.log(`  ${label.padEnd(24)} ${String(actual).padStart(3)} / ${String(target).padEnd(3)}  ${state}`)
  }
}

commands.next = () => {
  const leads = loadLeads()
  const targets = readTargets()
  const active = leads.filter(l => !l.disqualified && l.status !== 'handed_off')

  const readyToQualify = active.filter(l => ['A', 'B'].includes(l.score.tier) && l.status === 'researching' && l.contacts.length > 0)
  const needRoute = active.filter(l => ['A', 'B'].includes(l.score.tier) && l.contacts.length === 0)
  const nearMiss = active.filter(l => l.score.total >= 40 && l.score.total < 70).sort((a, b) => b.score.total - a.score.total)

  if (readyToQualify.length) {
    console.log('mark qualified (score and route both stand up):')
    for (const l of readyToQualify.slice(0, 10)) console.log(`  ${l.id}  ${l.score.total} ${l.score.tier}  ${l.org}`)
  }
  if (needRoute.length) {
    if (readyToQualify.length) console.log('')
    console.log('find a published contact route (scores well, unreachable):')
    for (const l of needRoute.slice(0, 10)) console.log(`  ${l.id}  ${l.score.total} ${l.score.tier}  ${l.org}`)
  }
  if (nearMiss.length) {
    if (readyToQualify.length || needRoute.length) console.log('')
    console.log('one signal short of tier A — go looking for these specifically:')
    for (const l of nearMiss.slice(0, 10)) console.log(`  ${l.id}  ${l.score.total}  missing: ${missingGroups(l).join(', ') || 'nothing — needs stronger signals, not more'}  ${l.org}`)
  }

  const tierA = leads.filter(l => l.score.tier === 'A').length
  if (targets && tierA < targets.tier_a_standing) {
    if (readyToQualify.length || needRoute.length || nearMiss.length) console.log('')
    console.log(`sourcing: ${targets.tier_a_standing - tierA} more tier-A lead(s) needed to hit standing target.`)
    console.log('  work the source list in prospecting/sources.md that has produced the fewest qualified leads so far.')
  }
  if (!readyToQualify.length && !needRoute.length && !nearMiss.length && (!targets || tierA >= targets.tier_a_standing)) {
    console.log('pipeline is at target. Re-verify the oldest evidence rather than adding volume.')
  }
}

commands.export = ({ flags }) => {
  const out = flags.csv === true ? null : flags.csv
  if (!out) fail('export needs --csv <path>')
  const leads = loadLeads()
    .filter(l => ['qualified', 'handed_off'].includes(l.status))
    .sort((a, b) => b.score.total - a.score.total)

  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = ['id', 'org', 'segment', 'region', 'score', 'tier', 'status', 'contact_route', 'contact_value', 'contact_source', 'evidence_urls']
  const rows = leads.map(l => [
    l.id,
    l.org,
    l.segment,
    l.region,
    l.score.total,
    l.score.tier,
    l.status,
    l.contacts[0]?.route,
    l.contacts[0]?.value,
    l.contacts[0]?.source_url,
    l.signals.map(s => s.evidence.url).join(' | '),
  ])
  writeFileSync(resolve(out), [header, ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n', 'utf8')
  console.log(`wrote ${leads.length} qualified lead(s) to ${out}`)
}

commands.help = () => {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*| \* ?/gm, '').trim())
}

// --- entry point -----------------------------------------------------------

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const [command, ...rest] = process.argv.slice(2)
  const handler = commands[command ?? 'help']
  if (!handler) fail(`unknown command "${command}". One of: ${Object.keys(commands).join(', ')}`)
  handler(parseArgs(rest))
}

export { commands }
