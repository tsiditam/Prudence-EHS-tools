/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DevEvidenceMapPreview — non-production preview of the Knowledge Graph (§14),
 * Evidence Map (§13), and Report Traceability Matrix (§17), driven by the SAME
 * built-in demo assessments the app's "Try a demo" flow uses.
 *
 * It runs the real engine pipeline (scoreZone → buildCausalChains → genRecs)
 * on the demo zones — exactly what loadDemo() does in MobileApp — then renders
 * the KG surfaces from that output. So this preview reflects real demo content,
 * not a hand-authored fixture. Mounted only on non-production hosts at
 * /dev/evidence-map (see src/main.jsx); never reachable on atmosflow.net.
 *
 * Read-only harness: no persistence, no auth, no engine modification.
 */
import { useMemo, useState } from 'react'
import EvidenceMap from '../EvidenceMap'
import ReportTraceabilityCard from './ReportTraceabilityCard'
import { scoreZone, genRecs } from '../../engines/scoring'
import { buildCausalChains } from '../../engines/causalChains'
import { DEMO_BUILDING, DEMO_ZONES, DEMO_EQUIPMENT } from '../../constants/demoData'
import { DEMO_FM_BUILDING, DEMO_FM_ZONES } from '../../constants/demoDataFM'
import { DEMO_DC_BUILDING, DEMO_DC_ZONES } from '../../constants/demoDataDC'

const DEMOS = [
  { key: 'ih', label: 'Commercial (IH)', bldg: DEMO_BUILDING, zones: DEMO_ZONES, equipment: DEMO_EQUIPMENT },
  { key: 'fm', label: 'Facility (FM)', bldg: DEMO_FM_BUILDING, zones: DEMO_FM_ZONES, equipment: [] },
  { key: 'dc', label: 'Data Center', bldg: DEMO_DC_BUILDING, zones: DEMO_DC_ZONES, equipment: [] },
]

// Run the same deterministic pipeline loadDemo() runs, producing the inputs
// the KG surfaces read. Defensive — a single engine throw degrades to empty.
function deriveFromDemo(demo) {
  try {
    const zoneScores = demo.zones.map((z) => scoreZone(z, demo.bldg))
    const causalChains = buildCausalChains(demo.zones, demo.bldg, zoneScores)
    let recs = []
    try { recs = genRecs(zoneScores, demo.bldg, { zones: demo.zones, equipment: demo.equipment || [] }) } catch { /* recs optional */ }
    return { zones: demo.zones, zoneScores, causalChains, recs }
  } catch {
    return { zones: [], zoneScores: [], causalChains: [], recs: [] }
  }
}

const tabBtn = (active) => ({
  minHeight: 36, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700,
  background: active ? 'var(--accent-fill, var(--accent))' : 'transparent',
  color: active ? 'var(--on-accent-fill, #06131a)' : 'var(--sub)',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
})

export default function DevEvidenceMapPreview() {
  const [demoKey, setDemoKey] = useState('ih')
  const demo = DEMOS.find((d) => d.key === demoKey) || DEMOS[0]
  const data = useMemo(() => deriveFromDemo(demo), [demo])
  const findingCount = (data.zoneScores || []).reduce(
    (n, zs) => n + (zs.cats || []).reduce((m, c) => m + (c.r || []).filter((r) => r.sev && r.sev !== 'pass' && r.sev !== 'info').length, 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '24px 16px', paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--warn)' }}>Non-production preview</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 4px' }}>Knowledge Graph — built from the demo assessments</h1>
          <p style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5, margin: 0 }}>
            The same demos as the app&apos;s &quot;Try a demo&quot; flow, run through the real engine, then projected into the graph.
            This route exists only on preview/dev hosts; it is not reachable in production.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {DEMOS.map((d) => (
            <button key={d.key} type="button" style={tabBtn(d.key === demoKey)} onClick={() => setDemoKey(d.key)}>{d.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16 }}>
          {demo.bldg?.fn || demo.label} · {(data.zones || []).length} zone(s) · {findingCount} flagged finding(s)
        </div>

        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: 'var(--text)' }}>Knowledge Graph + Evidence Map (§13–14)</h2>
        <EvidenceMap {...data} assessmentId={`dev-${demo.key}`} />

        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '28px 0 10px', color: 'var(--text)' }}>Report Evidence Traceability Matrix (§17)</h2>
        <p style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5, margin: '0 0 12px' }}>
          Identical to the table rendered in the consultant CIH-reasoning DOCX export.
        </p>
        <ReportTraceabilityCard {...data} assessmentId={`dev-${demo.key}`} />
      </div>
    </div>
  )
}
