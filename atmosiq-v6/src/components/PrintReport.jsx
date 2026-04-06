/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * PrintReport — print-optimized report for PDF export via window.print()
 * Hidden on screen. Rendered into a hidden iframe, then printed.
 * User gets native iOS/Android "Save as PDF" option.
 */

export function generatePrintHTML(data) {
  const { building, presurvey, zones, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile } = data
  const bldg = building || {}
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const sevColor = (sev) => ({ critical:'#DC2626', high:'#EA580C', medium:'#D97706', low:'#0891B2', pass:'#16A34A', info:'#64748B' }[sev] || '#64748B')

  const catRows = (cats) => cats.map(cat => {
    const pct = Math.round((cat.s / cat.mx) * 100)
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;">${cat.l}</strong>
          <span style="font-family:monospace;font-weight:700;font-size:14px;">${cat.s}/${cat.mx}</span>
        </div>
        <div style="height:4px;background:#E5E7EB;border-radius:2px;overflow:hidden;margin-bottom:8px;">
          <div style="height:100%;width:${pct}%;background:${pct>=80?'#16A34A':pct>=60?'#D97706':pct>=40?'#EA580C':'#DC2626'};border-radius:2px;"></div>
        </div>
        ${cat.r.map(r => `
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:4px;font-size:12px;line-height:1.5;">
            <span style="padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;font-family:monospace;background:${sevColor(r.sev)}15;color:${sevColor(r.sev)};white-space:nowrap;">${r.sev.toUpperCase()}</span>
            <span>${r.t}${r.std ? ` <span style="color:#9CA3AF;">(${r.std})</span>` : ''}</span>
          </div>
        `).join('')}
      </div>
    `
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AtmosIQ Report — ${bldg.fn || 'Assessment'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1F2937; line-height: 1.6; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
    h2 { font-size: 16px; font-weight: 700; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #E5E7EB; }
    h3 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #0891B2; }
    .meta { font-size: 11px; color: #6B7280; font-family: monospace; }
    .score-box { text-align: center; padding: 24px; border: 2px solid #E5E7EB; border-radius: 12px; margin-bottom: 20px; }
    .score-num { font-size: 48px; font-weight: 800; font-family: monospace; }
    .risk-badge { display: inline-block; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; }
    .zone-card { border: 1px solid #E5E7EB; border-radius: 10px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
    .flag-box { padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; }
    .chain-card { padding: 14px; border: 1px solid #E5E7EB; border-radius: 8px; margin-bottom: 12px; page-break-inside: avoid; }
    .sampling-card { padding: 14px; border: 1px solid #E5E7EB; border-radius: 8px; margin-bottom: 12px; page-break-inside: avoid; }
    .rec-section { margin-bottom: 12px; }
    .rec-item { padding: 3px 0; padding-left: 12px; border-left: 2px solid #E5E7EB; font-size: 12px; margin-bottom: 4px; }
    .narrative { font-size: 13px; line-height: 1.8; white-space: pre-wrap; padding: 16px; background: #F9FAFB; border-radius: 8px; border: 1px solid #E5E7EB; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 10px; color: #9CA3AF; text-align: center; }
    .disclaimer { font-size: 10px; color: #9CA3AF; padding: 10px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; margin-top: 16px; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>atmos<span style="color:#0891B2;">IQ</span> Assessment Report</h1>
      <div style="font-size:12px;color:#6B7280;margin-top:4px;">${bldg.fn || 'Facility'} — ${bldg.fl || ''}</div>
    </div>
    <div style="text-align:right;">
      <div class="meta">${now}</div>
      <div class="meta">${profile?.name || presurvey?.ps_assessor || 'Assessor'}</div>
      <div class="meta">v${data.version || '6.0.0-beta'}</div>
    </div>
  </div>

  ${comp ? `
  <div class="score-box">
    <div class="score-num" style="color:${comp.rc};">${comp.tot}</div>
    <div class="risk-badge" style="background:${comp.rc}18;color:${comp.rc};border:1px solid ${comp.rc}35;">${comp.risk}</div>
    <div class="meta" style="margin-top:8px;">Avg: ${comp.avg} | Worst: ${comp.worst} | ${comp.count} zone${comp.count > 1 ? 's' : ''}</div>
  </div>
  ` : ''}

  ${narrative ? `
  <h2>Findings Narrative</h2>
  <div class="narrative">${narrative}</div>
  <div class="disclaimer">⚠ AI-generated from deterministic scoring output. IH review required before client delivery.</div>
  ` : ''}

  <h2>Zone Findings</h2>
  ${(zoneScores || []).map((zs, zi) => `
    <div class="zone-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong style="font-size:15px;">${zs.zoneName}</strong>
        <span style="font-family:monospace;font-size:20px;font-weight:800;color:${zs.rc};">${zs.tot}/100 <span style="font-size:12px;">${zs.risk}</span></span>
      </div>
      ${catRows(zs.cats)}
      ${oshaResult?.flag ? `
        <div class="flag-box" style="background:#FEF2F2;border:1px solid #FECACA;">
          <strong style="color:#DC2626;">⚠ OSHA Defensibility: ${oshaResult.conf}</strong>
          ${(oshaResult.fl || []).map(f => `<div style="color:#DC2626;margin-top:4px;">• ${f}</div>`).join('')}
          ${(oshaResult.gaps || []).map(g => `<div style="color:#D97706;margin-top:4px;">Gap: ${g}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('')}

  ${(causalChains || []).length > 0 ? `
  <h2>Causal Chains</h2>
  ${causalChains.map(ch => `
    <div class="chain-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong>${ch.type}</strong>
        <span style="font-size:11px;font-weight:700;color:${ch.confidence === 'Strong' ? '#16A34A' : ch.confidence === 'Moderate' ? '#D97706' : '#9CA3AF'};">${ch.confidence}</span>
      </div>
      <div style="font-size:11px;color:#0891B2;font-family:monospace;">${ch.zone}</div>
      <div style="margin:8px 0;padding:8px 12px;background:#F9FAFB;border-radius:6px;border-left:3px solid #0891B2;font-size:12px;">${ch.rootCause}</div>
      ${ch.evidence.map(e => `<div style="font-size:11px;margin-bottom:3px;">→ ${e}</div>`).join('')}
    </div>
  `).join('')}
  ` : ''}

  ${samplingPlan?.plan?.length > 0 ? `
  <h2>Recommended Sampling Plan</h2>
  ${samplingPlan.plan.map(p => `
    <div class="sampling-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong>${p.type}</strong>
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${p.priority === 'critical' ? '#FEF2F2' : p.priority === 'high' ? '#FFF7ED' : '#FFFBEB'};color:${p.priority === 'critical' ? '#DC2626' : p.priority === 'high' ? '#EA580C' : '#D97706'};">${p.priority.toUpperCase()}</span>
      </div>
      <div style="font-size:11px;color:#0891B2;font-family:monospace;margin-bottom:6px;">${p.zone}</div>
      <div style="font-size:12px;margin-bottom:4px;"><strong>Hypothesis:</strong> ${p.hypothesis}</div>
      <div style="font-size:12px;margin-bottom:4px;"><strong>Method:</strong> ${p.method}</div>
      <div style="font-size:12px;margin-bottom:4px;"><strong>Controls:</strong> ${p.controls}</div>
      <div style="font-size:10px;color:#9CA3AF;font-family:monospace;">${p.standard}</div>
    </div>
  `).join('')}
  ${samplingPlan.outdoorGaps?.length > 0 ? `
    <div class="flag-box" style="background:#FFFBEB;border:1px solid #FDE68A;">
      <strong style="color:#D97706;">⚠ Outdoor Control Gaps</strong>
      ${samplingPlan.outdoorGaps.map(g => `<div style="margin-top:4px;">• ${g}</div>`).join('')}
    </div>
  ` : ''}
  ` : ''}

  ${recs ? `
  <h2>Recommendations</h2>
  ${[{k:'imm',l:'Immediate Actions',c:'#DC2626'},{k:'eng',l:'Engineering Controls',c:'#0891B2'},{k:'adm',l:'Administrative Controls',c:'#D97706'},{k:'mon',l:'Monitoring',c:'#9CA3AF'}].map(cat => (recs[cat.k]?.length > 0) ? `
    <div class="rec-section">
      <h3 style="color:${cat.c};">${cat.l}</h3>
      ${recs[cat.k].map(r => `<div class="rec-item" style="border-left-color:${cat.c};">${r}</div>`).join('')}
    </div>
  ` : '').join('')}
  ` : ''}

  <div class="footer">
    <div>AtmosIQ v6.0.0-beta — Prudence Safety & Environmental Consulting, LLC</div>
    <div>© 2026 All rights reserved. This report was generated by deterministic scoring against published standards.</div>
    <div style="margin-top:4px;">Assessor: ${profile?.name || presurvey?.ps_assessor || '—'} | Generated: ${now}</div>
  </div>
</body>
</html>`
}

export function printReport(data) {
  const html = generatePrintHTML(data)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '-10000px'
  iframe.style.left = '-10000px'
  iframe.style.width = '800px'
  iframe.style.height = '600px'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  setTimeout(() => {
    iframe.contentWindow.print()
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }, 500)
}
