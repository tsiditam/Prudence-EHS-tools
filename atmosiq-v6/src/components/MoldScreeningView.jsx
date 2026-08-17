/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * MoldScreeningView — read-only mold screening surface, mirroring the IAQ
 * module's result UI: a persistent screening banner plus the SAME segmented
 * pill-nav tab strip the assessment result screen uses
 * (AssessmentSegmentedPillNav), with mold-appropriate tabs
 * (Findings / Conditions / Spores / Review).
 *
 * Pure presentation over `assessMold()` output (src/engines/mold): it writes
 * nothing back and never asserts a health verdict — severity is categorical,
 * every finding is flagged as requiring professional review, and the
 * screening-only disclaimer stays in view above the tabs (not buried inside
 * one). Theme-aware + responsive (cards reflow on narrow viewports).
 *
 * Staged behind isMoldModuleEnabled(); today it renders in the dev preview and
 * is the surface a future `userMode: 'mold'` mounts.
 */
import { useState } from 'react'
import AssessmentSegmentedPillNav from './ui/AssessmentSegmentedPillNav'
import { I } from './Icons'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const ACCENT = 'var(--accent)'
const SUCCESS = 'var(--success)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'

const LABEL = { fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700, marginBottom: 6 }

// Categorical severity → tone + label. No numeric severity is rendered because
// none exists — a mold "risk score" would imply a health verdict.
const SEVERITY = {
  elevated_indicator: { c: DANGER, l: 'Elevated indicator' },
  screening_indicator: { c: WARN, l: 'Indicator' },
  observation: { c: SUB, l: 'Observation' },
}
const CATEGORY_LABEL = {
  water_damage: 'Water damage',
  moisture: 'Moisture',
  visible_growth: 'Visible growth',
  spore_screening: 'Spore analysis',
  hvac: 'HVAC',
}
// Domain SVG icons per finding category (the app's line-icon set), matching how
// EvidenceMap tags evidence kinds — the custom `mold` glyph is a spore cluster.
const CATEGORY_ICON = {
  water_damage: 'moisture',
  moisture: 'droplet',
  visible_growth: 'mold',
  spore_screening: 'flask',
  hvac: 'hvac',
}
const CONDITION_TONE = { 1: SUCCESS, 2: WARN, 3: DANGER }
const CATEGORY_TONE = { 1: ACCENT, 2: WARN, 3: DANGER }
const SPORE = {
  'possible-amplification-indicator': { c: WARN, l: 'Possible amplification' },
  'consistent-with-normal-ecology': { c: SUCCESS, l: 'Normal ecology' },
  'insufficient-data': { c: DIM, l: 'Insufficient data' },
}

// Tabs mirror the IAQ result-tab grammar (Findings / … / Review), adapted to
// the mold screening domain. Icons reuse names the IAQ tab strip already uses.
const TABS = [
  { id: 'findings', icon: 'findings', label: 'Findings' },
  { id: 'conditions', icon: 'search', label: 'Conditions' },
  { id: 'spores', icon: 'flask', label: 'Spores' },
  { id: 'review', icon: 'shield', label: 'Review' },
]

function Pill({ tone, children, title }) {
  return (
    <span title={title} style={{ padding: '3px 10px', background: `${tone}1F`, border: `1px solid ${tone}59`, borderRadius: 5, fontSize: 11, fontWeight: 700, color: tone, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}
function Card({ children, style }) {
  return <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, ...style }}>{children}</div>
}
function Empty({ children }) {
  return <Card style={{ textAlign: 'center', padding: '24px 16px' }}><div style={{ fontSize: 13, color: SUB }}>{children}</div></Card>
}
function labelFor(zones, zoneId) {
  if (zoneId === 'system') return 'Building systems'
  const z = (zones || []).find((x) => String(x.id) === String(zoneId))
  return z?.label || z?.name || zoneId
}

function FindingsTab({ findings, zones }) {
  if (!findings.length) return <Empty>No indicators raised.</Empty>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {findings.map((f) => {
        const sev = SEVERITY[f.severity] || SEVERITY.observation
        return (
          <Card key={f.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <Pill tone={sev.c}>{sev.l}</Pill>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: SUB, fontWeight: 600 }}>
                <I n={CATEGORY_ICON[f.category] || 'clip'} s={13} c={sev.c} w={1.8} />{CATEGORY_LABEL[f.category] || f.category}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: DIM }}>{labelFor(zones, f.zoneId)}</span>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, lineHeight: 1.45 }}>{f.summary}</div>
            {f.evidence?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
                {f.evidence.map((e, i) => <li key={i} style={{ fontSize: 12, color: SUB, lineHeight: 1.55 }}>{e}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {f.standardRefs?.length > 0 && <div style={{ fontSize: 10.5, color: DIM }}>{f.standardRefs.join(' · ')}</div>}
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: ACCENT }}>Professional review recommended</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function ConditionsTab({ conditions, waterByZone, sporeByZone, zones }) {
  if (!conditions.length) return <Empty>No zones to classify.</Empty>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
      {conditions.map((c) => {
        const w = waterByZone.get(c.zoneId)
        const s = sporeByZone.get(c.zoneId)
        return (
          <Card key={c.zoneId} style={{ padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{labelFor(zones, c.zoneId)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Pill tone={CONDITION_TONE[c.conditionId] || SUB} title={c.definition}>{c.label}</Pill>
              {w && <Pill tone={CATEGORY_TONE[w.categoryId] || SUB} title={w.definition}>{w.label}</Pill>}
              {s && SPORE[s.outcome] && <Pill tone={SPORE[s.outcome].c}>{`Spores: ${SPORE[s.outcome].l}`}</Pill>}
            </div>
            {c.basis?.length > 0 && <div style={{ fontSize: 11, color: DIM, marginTop: 8, lineHeight: 1.5 }}>{c.basis.join(' · ')}</div>}
          </Card>
        )
      })}
    </div>
  )
}

function SporesTab({ sporeScreening, zones }) {
  if (!sporeScreening.length) return <Empty>No spore-trap results ingested.</Empty>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sporeScreening.map((s) => {
        const tone = (SPORE[s.outcome] || {}).c || SUB
        return (
          <Card key={s.zoneId}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{labelFor(zones, s.zoneId)}</span>
              <span style={{ marginLeft: 'auto' }}><Pill tone={tone}>{(SPORE[s.outcome] || { l: s.outcome }).l}</Pill></span>
            </div>
            {s.indicatorGeneraIndoors?.length > 0 && (
              <div style={{ fontSize: 12, color: SUB, lineHeight: 1.55 }}>Water-damage-associated genera indoors: {s.indicatorGeneraIndoors.join(', ')}</div>
            )}
            {s.indoorExceedsOutdoor?.length > 0 && (
              <div style={{ fontSize: 12, color: SUB, lineHeight: 1.55, marginTop: 4 }}>Indoor exceeds outdoor for: {s.indoorExceedsOutdoor.join(', ')}</div>
            )}
            {s.noHealthLimitNote && <div style={{ fontSize: 10.5, color: DIM, marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>{s.noHealthLimitNote}</div>}
          </Card>
        )
      })}
    </div>
  )
}

function ReviewTab({ disclaimer, limitations, standardsCited }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {disclaimer && (
        <div>
          <div style={LABEL}>Basis</div>
          <Card><div style={{ fontSize: 12.5, color: SUB, lineHeight: 1.55 }}>{disclaimer}</div></Card>
        </div>
      )}
      <div>
        <div style={LABEL}>Limitations</div>
        {limitations.length ? (
          <Card><ul style={{ margin: 0, paddingLeft: 16 }}>{limitations.map((l, i) => <li key={i} style={{ fontSize: 12, color: SUB, lineHeight: 1.6 }}>{l}</li>)}</ul></Card>
        ) : <Empty>No limitations recorded.</Empty>}
      </div>
      {standardsCited.length > 0 && (
        <div>
          <div style={LABEL}>Standards referenced</div>
          <div style={{ fontSize: 11, color: DIM, lineHeight: 1.6 }}>{standardsCited.join(' · ')}</div>
        </div>
      )}
    </div>
  )
}

/**
 * @param {{ result: import('../types/mold').MoldScreeningResult, zones?: Array<{id:string,label?:string}> }} props
 */
export default function MoldScreeningView({ result, zones = [] }) {
  const [tab, setTab] = useState('findings')

  if (!result || !Array.isArray(result.findings)) {
    return <Empty>No mold assessment result to display.</Empty>
  }

  const { findings, conditions = [], waterCategories = [], sporeScreening = [], limitations = [], standardsCited = [], disclaimer } = result
  const waterByZone = new Map(waterCategories.map((w) => [w.zoneId, w]))
  const sporeByZone = new Map(sporeScreening.map((s) => [s.zoneId, s]))

  return (
    <section aria-label="Mold assessment result" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* No persistent banner — the assessment's basis + limitations live in the
          Review tab (and the report), the same way the IAQ module carries them.
          Per-finding "Professional review recommended" is the always-visible cue. */}
      <AssessmentSegmentedPillNav tabs={TABS} active={tab} onChange={setTab} ariaLabel="Mold assessment sections" />

      {tab === 'findings' && (
        <div>
          <div style={LABEL}>Findings · {findings.length}</div>
          <FindingsTab findings={findings} zones={zones} />
        </div>
      )}
      {tab === 'conditions' && <ConditionsTab conditions={conditions} waterByZone={waterByZone} sporeByZone={sporeByZone} zones={zones} />}
      {tab === 'spores' && <SporesTab sporeScreening={sporeScreening} zones={zones} />}
      {tab === 'review' && <ReviewTab disclaimer={disclaimer} limitations={limitations} standardsCited={standardsCited} />}
    </section>
  )
}
