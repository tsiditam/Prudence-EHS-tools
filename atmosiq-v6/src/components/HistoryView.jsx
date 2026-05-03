/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 */

import DesktopSidebar from './DesktopSidebar'
import { CSS, btn, cardStyle, cardHoverHandlers, FONT_DESKTOP, FONT_MOBILE } from '../styles/tokens'

export default function HistoryView({
  dk, step, setStep, saveDraft, setShowHistory, setShowLanding,
  savedReports, savedDrafts, loadReport, loadDraft, version,
}) {
  const crd = cardStyle(dk)
  const cardHover = cardHoverHandlers(dk)
  return (
    <div style={{ minHeight: '100vh', background: CSS.bg, color: CSS.text, fontFamily: dk ? FONT_DESKTOP : FONT_MOBILE }}>
      {dk && <DesktopSidebar step={step} setStep={setStep} saveDraft={saveDraft} setShowHistory={setShowHistory} onHome={() => setShowLanding(true)} version={version} />}
      <div style={{ ...(dk ? { marginLeft: 320, padding: '40px 48px', maxWidth: 900 } : { maxWidth: 600, margin: '0 auto', padding: 20 }) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowHistory(false)} style={{ ...btn(false, dk), padding: '8px 16px' }}>&larr; Back</button>
          <h2 style={{ margin: 0, fontSize: dk ? 24 : 20, fontWeight: 700, letterSpacing: '-0.02em' }}>History</h2>
        </div>
        {savedReports.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, color: CSS.accent, marginBottom: 12 }}>Completed Reports</h3>
            <div style={{ display: dk ? 'grid' : 'block', gridTemplateColumns: dk ? 'repeat(auto-fill, minmax(300px, 1fr))' : undefined, gap: dk ? 20 : undefined }}>
              {savedReports.map(r => (
                <div key={r.id} onClick={() => loadReport(r.id)} style={{ ...crd, cursor: 'pointer' }} {...cardHover}>
                  <div style={{ fontWeight: 600 }}>{r.facility || 'Untitled'}</div>
                  <div style={{ fontSize: 12, color: CSS.muted }}>{new Date(r.ts).toLocaleString()}</div>
                  {r.score != null && <div style={{ fontSize: 13, color: CSS.accent, marginTop: 4, fontFamily: 'var(--font-mono)' }}>Score: {r.score}/100</div>}
                </div>
              ))}
            </div>
          </>
        )}
        {savedDrafts.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, color: CSS.warn, marginBottom: 12, marginTop: 20 }}>Drafts</h3>
            <div style={{ display: dk ? 'grid' : 'block', gridTemplateColumns: dk ? 'repeat(auto-fill, minmax(300px, 1fr))' : undefined, gap: dk ? 20 : undefined }}>
              {savedDrafts.map(d => (
                <div key={d.id} onClick={() => loadDraft(d.id)} style={{ ...crd, cursor: 'pointer' }} {...cardHover}>
                  <div style={{ fontWeight: 600 }}>{d.facility || 'Untitled'}</div>
                  <div style={{ fontSize: 12, color: CSS.muted }}>{new Date(d.ts).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {!savedReports.length && !savedDrafts.length && (
          <div style={{ textAlign: 'center', color: CSS.muted, marginTop: 40 }}>No saved reports or drafts yet.</div>
        )}
      </div>
    </div>
  )
}
