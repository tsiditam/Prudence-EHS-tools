/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DevMoldPreview — non-production preview of the mold screening surface,
 * driven by the built-in mold demo (demoDataMold.js) run through the REAL
 * screening engine (buildMoldInput → assessMold). So the preview reflects real
 * engine output, not a hand-authored fixture. Mounted only on non-production
 * hosts at /dev/mold-screening (see src/main.jsx); never reachable on
 * atmosflow.net.
 *
 * Read-only harness: no persistence, no auth, no engine modification.
 */
import { useMemo } from 'react'
import MoldScreeningView from '../MoldScreeningView'
import { assessMold } from '../../engines/mold/index.js'
import { buildMoldInput } from '../../engines/mold/buildInput.js'
import { DEMO_MOLD } from '../../constants/demoDataMold.js'

export default function DevMoldPreview() {
  const { result, zones } = useMemo(() => {
    try {
      const input = buildMoldInput(DEMO_MOLD)
      return { result: assessMold(input), zones: input.zones }
    } catch {
      return { result: null, zones: [] }
    }
  }, [])
  const findingCount = result?.findings?.length || 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '24px 16px', paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--warn)' }}>Non-production preview</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 4px' }}>Mold assessment — built from the demo assessment</h1>
          <p style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.5, margin: 0 }}>
            The built-in mold demo run through the real screening engine (IICRC S520 water Category + remediation
            Condition, comparative indoor/outdoor spore screening). Screening only — no health verdict. This route
            exists only on preview/dev hosts; it is not reachable in production.
          </p>
        </div>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 16 }}>
          {zones.length} zone(s) · {findingCount} screening finding(s){result?.version ? ` · engine v${result.version}` : ''}
        </div>
        <MoldScreeningView result={result} zones={zones} />
      </div>
    </div>
  )
}
