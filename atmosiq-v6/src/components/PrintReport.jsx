/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * PrintReport — print-optimized report opened in new tab
 * User can print or save as PDF from the browser.
 * No automatic print dialogs — Safari-safe.
 */

export function selectReportTemplate(data) {
  const zones = data.zones || []
  const hasNumeric = zones.some(z => z.co2 || z.tf || z.rh || z.pm || z.co || z.tv || z.hc || z.cfm_person || z.ach)
  const hasObservations = zones.some(z => z.observations && Object.keys(z.observations).length > 0)
  if (hasNumeric && !hasObservations) return 'fully_scored'
  if (hasNumeric && hasObservations) return 'partial_score'
  if (!hasNumeric && hasObservations) return 'observational_only'
  return 'insufficient_data'
}

export function generatePrintHTML(data) {
  const { building, presurvey, zones, zoneScores, comp, oshaResult, recs, samplingPlan, causalChains, narrative, profile, photos, standardsManifest, userMode, escalationTriggers } = data
  const reportTemplate = selectReportTemplate(data)
  const bldg = building || {}
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const assessDate = data.ts ? new Date(data.ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : now
  const reportId = data.id || `AIQ-${Date.now().toString(36).toUpperCase().slice(-6)}`
  const assessor = profile?.name || presurvey?.ps_assessor || 'Assessor'
  const ver = data.version || '6.0.0'

  const sevColor = (sev) => ({ critical:'#B91C1C', high:'#C2410C', medium:'#A16207', low:'#0E7490', pass:'#15803D', info:'#475569' }[sev] || '#475569')
  const scoreColor = (s) => s >= 70 ? '#15803D' : s >= 50 ? '#A16207' : '#B91C1C'
  const riskLabel = (s) => s >= 80 ? 'Low Risk' : s >= 60 ? 'Moderate' : s >= 40 ? 'High Risk' : 'Critical'
  const confLabel = oshaResult?.conf || 'Not evaluated'

  const catRows = (cats) => cats.map(cat => {
    const pct = Math.round((cat.s / cat.mx) * 100)
    return `
      <tr>
        <td style="padding:8px 12px;font-weight:600;font-size:12px;border-bottom:1px solid #F1F5F9;">${cat.l}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:12px;text-align:center;border-bottom:1px solid #F1F5F9;">${cat.s}/${cat.mx}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;"><div style="height:6px;background:#F1F5F9;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${pct>=70?'#15803D':pct>=50?'#A16207':'#B91C1C'};border-radius:3px;"></div></div></td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:${scoreColor(pct)};text-align:right;border-bottom:1px solid #F1F5F9;">${pct}%</td>
      </tr>`
  }).join('')

  const findingRows = (cats) => cats.flatMap(cat => cat.r.map(r => `
    <tr style="font-size:11px;">
      <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;"><span style="padding:2px 6px;border-radius:3px;font-size:9px;font-weight:700;font-family:monospace;background:${sevColor(r.sev)}12;color:${sevColor(r.sev)};text-transform:uppercase;">${r.sev}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;font-weight:500;">${cat.l}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;">${r.t}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;color:#64748B;font-family:monospace;font-size:10px;">${r.std || '—'}</td>
    </tr>
  `)).join('')

  const completeness = Math.round(((zones||[]).filter(z => z.zn).length / Math.max((zones||[]).length, 1)) * 100)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>IAQ Assessment Report — ${bldg.fn || 'Assessment'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; font-size: 12px; color: #1E293B; line-height: 1.6; padding: 48px 56px; max-width: 820px; margin: 0 auto; background: #fff; }
    h1 { font-size: 20px; font-weight: 700; color: #0F172A; margin-bottom: 2px; letter-spacing: -0.3px; }
    h2 { font-size: 13px; font-weight: 700; color: #0F172A; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #E2E8F0; text-transform: uppercase; letter-spacing: 0.8px; }
    h3 { font-size: 12px; font-weight: 700; color: #334155; margin: 20px 0 8px; }
    p { margin-bottom: 8px; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 10px; background: #F8FAFC; font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #E2E8F0; }
    td { padding: 8px 10px; border-bottom: 1px solid #F1F5F9; font-size: 11px; vertical-align: top; }
    .accent { color: #0E7490; }
    .cover { text-align: center; padding: 80px 0 60px; border-bottom: 2px solid #0E7490; margin-bottom: 32px; }
    .cover-logo { font-size: 28px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px; margin-bottom: 24px; }
    .cover-title { font-size: 18px; font-weight: 300; color: #334155; margin-bottom: 4px; letter-spacing: 0.5px; }
    .cover-sub { font-size: 11px; color: #64748B; margin-bottom: 32px; }
    .cover-meta { font-size: 11px; color: #475569; line-height: 2; }
    .cover-meta strong { color: #0F172A; font-weight: 600; }
    .def-panel { padding: 14px 18px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; margin-bottom: 20px; font-size: 10px; color: #64748B; }
    .def-panel td { padding: 3px 0; border: none; font-size: 10px; }
    .score-box { text-align: center; padding: 20px; border: 1px solid #E2E8F0; border-radius: 6px; margin-bottom: 16px; }
    .score-num { font-size: 42px; font-weight: 800; font-family: monospace; letter-spacing: -2px; }
    .risk-badge { display: inline-block; padding: 3px 12px; border-radius: 3px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .zone-card { border: 1px solid #E2E8F0; border-radius: 6px; padding: 20px; margin-bottom: 24px; page-break-inside: avoid; }
    .chain-card { padding: 14px 18px; border: 1px solid #E2E8F0; border-radius: 6px; margin-bottom: 10px; page-break-inside: avoid; }
    .evidence-item { font-size: 11px; padding: 3px 0 3px 14px; border-left: 2px solid #CBD5E1; margin-bottom: 3px; color: #475569; }
    .rec-row td { font-size: 11px; }
    .narrative { font-size: 12px; line-height: 1.8; padding: 16px 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; border-left: 3px solid #0E7490; }
    .note { font-size: 10px; color: #94A3B8; font-style: italic; padding: 8px 12px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 4px; margin: 12px 0; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 9px; color: #94A3B8; text-align: center; line-height: 1.8; }
    .pg-break { page-break-before: always; }
    @page { margin: 1in; }
    @media print { body { padding: 0; font-size: 11px; } h2 { page-break-after: avoid; } .zone-card, .chain-card { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <!-- ═══ COVER PAGE ═══ -->
  <div class="cover">
    <div style="font-size:11px;color:#64748B;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:16px;">Prudence Safety &amp; Environmental Consulting, LLC</div>
    <div class="cover-logo">Atmos<span class="accent">Flow</span></div>
    <div class="cover-title">Indoor Air Quality Assessment Report</div>
    <div class="cover-sub">Standards-Driven Multi-Zone Assessment</div>
    <div style="width:40px;height:2px;background:#0E7490;margin:28px auto;"></div>
    <div class="cover-meta">
      <strong>Site:</strong> ${bldg.fn || 'Facility'}<br>
      <strong>Location:</strong> ${bldg.fl || '—'}<br>
      <strong>Assessment Date:</strong> ${assessDate}<br>
      <strong>Report Date:</strong> ${now}<br>
      <strong>Assessor:</strong> ${assessor}<br>
      <strong>Report ID:</strong> ${reportId}<br>
      <strong>Status:</strong> Draft — Pending Professional Review
    </div>
    <div style="margin-top:40px;font-size:9px;color:#94A3B8;letter-spacing:0.3px;">CONFIDENTIAL — FOR CLIENT USE ONLY</div>
  </div>

  ${userMode === 'fm' && reportTemplate === 'observational_only' ? `
  <!-- ═══ FM OBSERVATIONAL-ONLY HEADER ═══ -->
  <div style="text-align:center;padding:40px 0 30px;border-bottom:1px solid #E2E8F0;margin-bottom:24px;">
    <div style="font-size:22px;font-weight:700;color:#0F172A;">Observational Assessment — No Score Generated</div>
    <p style="font-size:12px;color:#475569;max-width:500px;margin:12px auto;line-height:1.7;">This assessment documents observed conditions and occupant reports. It does not produce a numeric air quality score. Where conditions warrant, professional evaluation is recommended below.</p>
    <p style="font-size:10px;color:#94A3B8;max-width:460px;margin:8px auto;line-height:1.6;font-style:italic;">AtmosFlow does not generate scores from observational data alone. When you measure, we score. When you observe, we document and flag.</p>
    ${(escalationTriggers || []).length > 0 ? `
    <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:8px;padding:14px 20px;margin:16px auto;max-width:460px;text-align:left;">
      <div style="font-size:13px;font-weight:700;color:#B91C1C;margin-bottom:6px;">⚠ Professional Evaluation Required</div>
      ${escalationTriggers.map(t => `<div style="font-size:11px;color:#7F1D1D;margin-bottom:4px;">• ${t.rationale}</div>`).join('')}
    </div>` : ''}
    <p style="font-size:10px;color:#94A3B8;margin-top:20px;">For quantitative air quality measurement, contact a credentialed industrial hygiene professional or consider adding instrumentation to your assessment protocol.</p>
  </div>
  ` : ''}

  ${userMode === 'fm' && comp && reportTemplate !== 'observational_only' ? `
  <!-- ═══ FM SUMMARY LAYER ═══ -->
  <div style="text-align:center;padding:40px 0 30px;border-bottom:1px solid #E2E8F0;margin-bottom:24px;">
    <div style="width:80px;height:80px;border-radius:50%;background:${comp.tot >= 70 ? '#22C55E15' : comp.tot >= 50 ? '#FBBF2415' : comp.tot >= 40 ? '#FB923C15' : '#EF444415'};border:3px solid ${scoreColor(comp.tot)};display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
      <span style="font-size:28px;font-weight:800;font-family:monospace;color:${scoreColor(comp.tot)};">${comp.tot}</span>
    </div>
    <div style="font-size:22px;font-weight:700;color:${scoreColor(comp.tot)};">${comp.tot >= 80 ? 'Low Risk' : comp.tot >= 60 ? 'Moderate' : comp.tot >= 40 ? 'High Risk' : 'Critical'}</div>
    <p style="font-size:13px;color:#475569;max-width:500px;margin:12px auto;line-height:1.7;">${comp.tot >= 70 ? 'The air quality in this building appears to be within acceptable ranges based on the measurements taken.' : comp.tot >= 50 ? 'Some air quality concerns were identified that may benefit from attention. See recommended actions below.' : 'Significant air quality concerns were identified. Corrective action is recommended.'}</p>
    ${(escalationTriggers || []).length > 0 ? `
    <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:8px;padding:14px 20px;margin:16px auto;max-width:460px;text-align:left;">
      <div style="font-size:13px;font-weight:700;color:#B91C1C;margin-bottom:6px;">⚠ Professional Evaluation Required</div>
      ${escalationTriggers.map(t => `<div style="font-size:11px;color:#7F1D1D;margin-bottom:4px;">• ${t.rationale}</div>`).join('')}
    </div>` : ''}
    <h3 style="margin-top:24px;">What You Should Do Next</h3>
    <div style="text-align:left;max-width:460px;margin:0 auto;">
    ${(recs?.imm || []).slice(0, 3).map((r, i) => `<div style="font-size:12px;color:#1E293B;margin-bottom:8px;padding-left:16px;border-left:2px solid #B91C1C;">${r}</div>`).join('')}
    ${(recs?.eng || []).slice(0, 2).map((r, i) => `<div style="font-size:12px;color:#1E293B;margin-bottom:8px;padding-left:16px;border-left:2px solid #0E7490;">${r}</div>`).join('')}
    ${(!recs?.imm?.length && !recs?.eng?.length) ? '<div style="font-size:12px;color:#475569;">Continue routine monitoring. No immediate actions required.</div>' : ''}
    </div>
  </div>
  ` : ''}

  <!-- ═══ DEFENSIBILITY PANEL ═══ -->
  <div class="def-panel">
    <div style="font-size:10px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Assessment Transparency</div>
    <table style="width:auto;"><tbody>
      <tr><td style="color:#64748B;padding-right:16px;">Workflow version</td><td style="color:#334155;font-weight:600;">AtmosFlow v${ver}</td></tr>
      <tr><td style="color:#64748B;padding-right:16px;">Standards referenced</td><td style="color:#334155;font-weight:600;">ASHRAE 62.1-2025, ASHRAE 55-2023, OSHA PELs, EPA NAAQS, WHO guidelines</td></tr>
      <tr><td style="color:#64748B;padding-right:16px;">Calibration recorded</td><td style="color:#334155;font-weight:600;">${presurvey?.ps_inst_iaq_cal_status || 'Not recorded'}</td></tr>
      <tr><td style="color:#64748B;padding-right:16px;">Professional review</td><td style="color:#334155;font-weight:600;">Draft — requires IH review before distribution</td></tr>
      <tr><td style="color:#64748B;padding-right:16px;">Confidence level</td><td style="color:#334155;font-weight:600;">${confLabel}</td></tr>
      <tr><td style="color:#64748B;padding-right:16px;">Completeness</td><td style="color:#334155;font-weight:600;">${completeness}% — ${(zones||[]).length} zone${(zones||[]).length !== 1 ? 's' : ''} assessed</td></tr>
    </tbody></table>
  </div>

  <!-- ═══ EXECUTIVE SUMMARY ═══ -->
  <h2>Executive Summary</h2>
  ${comp ? `
  <div style="display:flex;gap:20px;margin-bottom:16px;">
    <div class="score-box" style="flex:0 0 140px;">
      <div class="score-num" style="color:${scoreColor(comp.tot)};">${comp.tot}</div>
      <div class="risk-badge" style="background:${scoreColor(comp.tot)}12;color:${scoreColor(comp.tot)};">${comp.risk || riskLabel(comp.tot)}</div>
    </div>
    <div style="flex:1;font-size:11px;color:#475569;">
      <table style="width:100%;"><tbody>
        <tr><td style="padding:3px 0;border:none;color:#64748B;">Composite score</td><td style="padding:3px 0;border:none;font-weight:700;color:#0F172A;">${comp.tot}/100</td></tr>
        <tr><td style="padding:3px 0;border:none;color:#64748B;">Average zone score</td><td style="padding:3px 0;border:none;font-weight:600;">${comp.avg}/100</td></tr>
        <tr><td style="padding:3px 0;border:none;color:#64748B;">Worst zone score</td><td style="padding:3px 0;border:none;font-weight:600;color:${scoreColor(comp.worst)};">${comp.worst}/100</td></tr>
        <tr><td style="padding:3px 0;border:none;color:#64748B;">Zones assessed</td><td style="padding:3px 0;border:none;font-weight:600;">${comp.count}</td></tr>
        <tr><td style="padding:3px 0;border:none;color:#64748B;">Confidence</td><td style="padding:3px 0;border:none;font-weight:600;">${confLabel}</td></tr>
      </tbody></table>
    </div>
  </div>` : ''}

  ${narrative ? `
  <div class="narrative">${narrative}</div>
  <div class="note">This narrative was generated from deterministic scoring output and requires professional review before client distribution.</div>
  ` : (() => {
    const worstZone = zoneScores?.reduce((a, b) => a.tot < b.tot ? a : b, zoneScores[0])
    const worstCat = worstZone?.cats?.reduce((a, b) => (a.s/a.mx) < (b.s/b.mx) ? a : b)
    const p1 = `An indoor air quality assessment was conducted at ${bldg.fn || 'the subject facility'} on ${assessDate}, encompassing ${(zones||[]).length} zone${(zones||[]).length !== 1 ? 's' : ''}${presurvey?.ps_reason ? ` in response to ${presurvey.ps_reason.toLowerCase()}` : ''}. The assessment included direct-reading instrument measurements, visual inspection, HVAC system evaluation, and occupant complaint documentation.`
    const p2 = comp?.tot >= 70
      ? `Available evidence supports that conditions observed during the assessment window are broadly consistent with applicable occupancy standards. The composite score of ${comp.tot}/100 reflects acceptable conditions across the majority of evaluated zones, with localized areas warranting targeted follow-up as detailed in the zone findings below.`
      : comp?.tot >= 50
        ? `Conditions observed during the assessment window suggest moderate indoor air quality concerns. The composite score of ${comp.tot}/100 reflects a weighted evaluation across five categories, with ${worstCat ? `${worstCat.l} (${worstCat.s}/${worstCat.mx}) identified as the primary area of concern` : 'multiple categories showing room for improvement'}. Targeted investigation is recommended in the areas identified below.`
        : `Conditions observed during the assessment window indicate significant indoor air quality concerns that would warrant prioritized remediation. The composite score of ${comp?.tot || '—'}/100 reflects deficiencies across multiple evaluation categories${worstCat ? `, with ${worstCat.l} (${worstCat.s}/${worstCat.mx}) representing the most acute concern` : ''}. The findings and recommendations in this report are intended to support a structured corrective action process.`
    const immRecs = recs?.imm || []
    const p3 = immRecs.length > 0
      ? `Priority actions include: ${immRecs.slice(0, 3).join('; ')}. Additional engineering and administrative recommendations are detailed in the Recommendations Register.`
      : 'Recommended next steps are detailed in the Recommendations Register and Sampling Plan sections of this report.'
    return `<p style="font-size:11px;color:#475569;line-height:1.8;">${p1}</p><p style="font-size:11px;color:#475569;line-height:1.8;">${p2}</p><p style="font-size:11px;color:#475569;line-height:1.8;">${p3}</p>`
  })()}

  ${recs ? `
  <h3>Priority Actions</h3>
  <table><thead><tr><th>Priority</th><th>Action</th></tr></thead><tbody>
  ${(recs.imm||[]).map(r => `<tr><td style="font-size:10px;font-weight:700;color:#B91C1C;">IMMEDIATE</td><td style="font-size:11px;">${r}</td></tr>`).join('')}
  ${(recs.eng||[]).slice(0,3).map(r => `<tr><td style="font-size:10px;font-weight:700;color:#0E7490;">ENGINEERING</td><td style="font-size:11px;">${r}</td></tr>`).join('')}
  ${(recs.adm||[]).slice(0,2).map(r => `<tr><td style="font-size:10px;font-weight:700;color:#A16207;">ADMINISTRATIVE</td><td style="font-size:11px;">${r}</td></tr>`).join('')}
  </tbody></table>` : ''}

  <!-- ═══ SCOPE AND METHODOLOGY ═══ -->
  <h2>Scope and Methodology</h2>
  <p><strong>Purpose:</strong> This assessment was conducted to evaluate indoor air quality conditions${presurvey?.ps_reason ? ` in response to ${presurvey.ps_reason.toLowerCase()}` : ''} at ${bldg.fn || 'the subject facility'}.</p>
  <p><strong>Areas assessed:</strong> ${(zones||[]).map(z => z.zn || 'Unnamed zone').join(', ') || 'See zone findings below'}.</p>
  <p><strong>Assessment activities:</strong> Visual inspection, real-time direct-reading instrument measurements, occupant complaint documentation, HVAC system evaluation, and moisture/mold screening.</p>
  <h3>Instrumentation</h3>
  <table><thead><tr><th>Instrument</th><th>Identifier</th><th>Calibration</th></tr></thead><tbody>
    <tr><td>${presurvey?.ps_inst_iaq || 'IAQ meter'}</td><td style="font-family:monospace;font-size:10px;">${presurvey?.ps_inst_iaq_serial || '—'}</td><td>${presurvey?.ps_inst_iaq_cal_status || '—'}${presurvey?.ps_inst_iaq_cal ? ` (${presurvey.ps_inst_iaq_cal})` : ''}</td></tr>
    ${presurvey?.ps_inst_pid ? `<tr><td>${presurvey.ps_inst_pid}</td><td style="font-family:monospace;font-size:10px;">—</td><td>${presurvey.ps_inst_pid_cal || '—'}</td></tr>` : ''}
  </tbody></table>
  <h3>Standards and References</h3>
  <p style="font-size:11px;color:#475569;">ASHRAE Standard 62.1-2025 (Ventilation for Acceptable IAQ), ASHRAE Standard 55-2023 (Thermal Environmental Conditions), OSHA Permissible Exposure Limits (29 CFR 1910.1000), EPA National Ambient Air Quality Standards, WHO Air Quality Guidelines.</p>
  <h3>Limitations</h3>
  <p style="font-size:11px;color:#475569;">This assessment represents conditions observed at the time of the site visit and may not reflect all temporal, seasonal, or operational variations. Findings are based on direct-reading instrumentation and visual observations. Laboratory analysis was not performed unless specifically noted.</p>

  <!-- ═══ BUILDING CONTEXT ═══ -->
  <h2>Building and Complaint Context</h2>
  <p style="font-size:11px;color:#475569;line-height:1.8;margin-bottom:12px;">${bldg.fn || 'The subject facility'} is a ${(bldg.ft || 'commercial').toLowerCase()} facility${bldg.ba ? ` constructed in approximately ${bldg.ba}` : ''}${bldg.rn ? `, with renovations reported ${bldg.rn.toLowerCase()}` : ''}. The building is served by ${bldg.ht ? `a ${bldg.ht.toLowerCase()} system` : 'mechanical ventilation'}${bldg.hm ? `, with last reported HVAC maintenance ${bldg.hm.toLowerCase()}` : ''}. ${presurvey?.ps_complaint_narrative ? 'Occupant concerns were reported prior to this assessment, as summarized below.' : 'No formal occupant complaints were reported prior to this assessment.'}${presurvey?.ps_water_history === 'Yes — recurring' ? ' A history of recurring water intrusion was noted.' : ''}</p>
  <table><tbody>
    <tr><td style="color:#64748B;width:160px;">Building type</td><td>${bldg.ft || '—'}</td></tr>
    <tr><td style="color:#64748B;">Year built / renovated</td><td>${bldg.ba || '—'}${bldg.rn ? ` (last renovated: ${bldg.rn})` : ''}</td></tr>
    <tr><td style="color:#64748B;">HVAC system</td><td>${bldg.ht || '—'}</td></tr>
    <tr><td style="color:#64748B;">Last HVAC maintenance</td><td>${bldg.hm || '—'}</td></tr>
    <tr><td style="color:#64748B;">Filter type / condition</td><td>${bldg.fm || '—'} / ${bldg.fc || '—'}</td></tr>
    <tr><td style="color:#64748B;">Outside air damper</td><td>${bldg.od || '—'}</td></tr>
    <tr><td style="color:#64748B;">Supply airflow</td><td>${bldg.sa || '—'}</td></tr>
    <tr><td style="color:#64748B;">Building pressure</td><td>${bldg.bld_pressure || '—'}</td></tr>
    ${presurvey?.ps_complaint_narrative ? `<tr><td style="color:#64748B;">Reported concerns</td><td>${presurvey.ps_complaint_narrative}</td></tr>` : ''}
    ${presurvey?.ps_water_history === 'Yes — recurring' ? `<tr><td style="color:#64748B;">Water/moisture history</td><td>${presurvey.ps_water_detail || 'Recurring water intrusion reported'}</td></tr>` : ''}
  </tbody></table>

  <!-- ═══ OVERALL FINDINGS ═══ -->
  <h2 class="pg-break">Overall Findings Dashboard</h2>
  ${comp ? `
  <div style="display:flex;gap:12px;margin-bottom:16px;">
    ${[{l:'Composite',v:comp.tot},{l:'Average',v:comp.avg},{l:'Worst Zone',v:comp.worst}].map(m => `
    <div style="flex:1;text-align:center;padding:12px;border:1px solid #E2E8F0;border-radius:6px;">
      <div style="font-size:24px;font-weight:800;font-family:monospace;color:${scoreColor(m.v)};">${m.v}</div>
      <div style="font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">${m.l}</div>
    </div>`).join('')}
  </div>
  <p style="font-size:11px;color:#475569;margin-bottom:16px;">Conditions observed during the assessment window suggest ${comp.tot >= 70 ? 'overall acceptable indoor air quality, with localized areas that may warrant targeted follow-up as detailed in the zone sections below.' : comp.tot >= 50 ? 'moderate indoor air quality concerns across one or more zones. Targeted investigation and corrective action would be warranted in the areas identified below.' : 'significant indoor air quality concerns that would warrant prioritized remediation as detailed in the zone sections and recommendations register below.'} The composite score of <strong>${comp.tot}/100</strong> reflects a weighted evaluation across ventilation, contaminant levels, HVAC system conditions, occupant complaints, and environmental factors.</p>
  ` : ''}

  <!-- ═══ ZONE-BY-ZONE FINDINGS ═══ -->
  <h2>Zone-by-Zone Findings</h2>
  ${(zoneScores || []).map((zs, zi) => {
    const z = (zones||[])[zi] || {}
    return `
    <div class="zone-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div>
          <strong style="font-size:14px;color:#0F172A;">${zs.zoneName || 'Zone ' + (zi+1)}</strong>
          <div style="font-size:10px;color:#64748B;margin-top:2px;">${z.zt || ''} ${z.zo ? `· ${z.zo} occupants` : ''} ${z.za ? `· ${z.za} sq ft` : ''}${z.meas_time ? ` · Assessed at ${z.meas_time}` : ''}</div>
        </div>
        <div style="text-align:right;">
          <span style="font-family:monospace;font-size:22px;font-weight:800;color:${scoreColor(zs.tot)};">${zs.tot}</span>
          <span style="font-size:10px;color:#64748B;">/100</span>
          <div style="font-size:9px;color:${scoreColor(zs.tot)};font-weight:700;">${zs.risk}</div>
        </div>
      </div>
      ${/* Observations */(() => {
        const obs = []
        if (z.zc === 'Yes') obs.push(`Occupant complaints reported${z.zca ? ` (${z.zca} affected)` : ''}${z.zcs ? `: ${Array.isArray(z.zcs) ? z.zcs.join(', ') : z.zcs}` : ''}`)
        if (z.wd && z.wd !== 'None observed') obs.push(`Water damage observed: ${z.wd}${z.wdl ? ` (${z.wdl})` : ''}`)
        if (z.mi && z.mi !== 'None observed') obs.push(`Mold indicators: ${z.mi}${z.mie ? ` — ${z.mie}` : ''}`)
        if (z.od && z.od !== 'None') obs.push(`Odor noted: ${z.od}${z.odi ? ` (${z.odi})` : ''}`)
        if (z.src_int) obs.push(`Interior sources identified: ${Array.isArray(z.src_int) ? z.src_int.join(', ') : z.src_int}`)
        return obs.length > 0 ? `
          <h3>Observations</h3>
          <ul style="font-size:11px;color:#475569;line-height:1.8;padding-left:18px;margin:4px 0 12px;">
            ${obs.map(o => `<li>${o}</li>`).join('')}
          </ul>` : ''
      })()}

      ${/* Zone Photos */(() => {
        const zonePhotos = []
        if (photos) {
          Object.keys(photos).forEach(key => {
            if (key.startsWith(`z${zi}-`)) {
              const fieldId = key.replace(`z${zi}-`, '')
              const fieldLabels = { dp: 'Condensate drain pan', wd: 'Water damage', mi: 'Mold indicators' }
              ;(photos[key] || []).forEach(p => {
                if (p && p.src) zonePhotos.push({ src: p.src, label: fieldLabels[fieldId] || fieldId, ts: p.ts })
              })
            }
          })
        }
        return zonePhotos.length > 0 ? `
          <h3>Photo Documentation</h3>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
            ${zonePhotos.map(p => `
              <div style="width:180px;">
                <img src="${p.src}" alt="${p.label}" style="width:100%;height:130px;object-fit:cover;border-radius:4px;border:1px solid #E2E8F0;" />
                <div style="font-size:9px;color:#64748B;margin-top:3px;">${p.label}${p.ts ? ` · ${new Date(p.ts).toLocaleTimeString()}` : ''}</div>
              </div>`).join('')}
          </div>` : ''
      })()}

      ${/* Parameter Results */(() => {
        const hasData = z.co2 || z.tf || z.rh || z.pm || z.co || z.tv || z.hc
        return hasData ? `
          <h3>Parameter Results</h3>
          <table style="margin-bottom:12px;"><thead><tr><th>Parameter</th><th style="text-align:center;">Indoor</th><th style="text-align:center;">Outdoor</th><th>Reference</th></tr></thead><tbody>
            ${z.co2 ? `<tr><td>CO₂</td><td style="text-align:center;font-family:monospace;">${z.co2} ppm</td><td style="text-align:center;font-family:monospace;color:#64748B;">${z.co2o || '—'} ppm</td><td style="font-size:10px;color:#64748B;">Δ700 ppm (ASHRAE 62.1)</td></tr>` : ''}
            ${z.tf ? `<tr><td>Temperature</td><td style="text-align:center;font-family:monospace;">${z.tf}°F</td><td style="text-align:center;font-family:monospace;color:#64748B;">${z.tfo || '—'}°F</td><td style="font-size:10px;color:#64748B;">68–79°F (ASHRAE 55)</td></tr>` : ''}
            ${z.rh ? `<tr><td>Relative Humidity</td><td style="text-align:center;font-family:monospace;">${z.rh}%</td><td style="text-align:center;font-family:monospace;color:#64748B;">${z.rho || '—'}%</td><td style="font-size:10px;color:#64748B;">30–60%</td></tr>` : ''}
            ${z.pm ? `<tr><td>PM2.5</td><td style="text-align:center;font-family:monospace;">${z.pm} µg/m³</td><td style="text-align:center;font-family:monospace;color:#64748B;">${z.pmo || '—'} µg/m³</td><td style="font-size:10px;color:#64748B;"><35 µg/m³ (EPA 24-hr)</td></tr>` : ''}
            ${z.co ? `<tr><td>Carbon Monoxide</td><td style="text-align:center;font-family:monospace;">${z.co} ppm</td><td style="text-align:center;font-family:monospace;color:#64748B;">—</td><td style="font-size:10px;color:#64748B;"><35 ppm (NIOSH REL)</td></tr>` : ''}
            ${z.tv ? `<tr><td>Total VOCs</td><td style="text-align:center;font-family:monospace;">${z.tv} µg/m³</td><td style="text-align:center;font-family:monospace;color:#64748B;">${z.tvo || '—'} µg/m³</td><td style="font-size:10px;color:#64748B;"><500 µg/m³ (concern)</td></tr>` : ''}
            ${z.hc ? `<tr><td>Formaldehyde</td><td style="text-align:center;font-family:monospace;">${z.hc} ppm</td><td style="text-align:center;font-family:monospace;color:#64748B;">—</td><td style="font-size:10px;color:#64748B;"><0.016 ppm (NIOSH REL)</td></tr>` : ''}
          </tbody></table>` : ''
      })()}

      <h3>Category Assessment</h3>
      <table style="margin-bottom:12px;"><thead><tr><th>Category</th><th style="text-align:center;">Score</th><th>Performance</th><th style="text-align:right;">%</th></tr></thead><tbody>${catRows(zs.cats)}</tbody></table>

      ${/* Interpretation */(() => {
        const worst = zs.cats.reduce((a, b) => ((a.s/a.mx) < (b.s/b.mx) ? a : b))
        const worstPct = Math.round((worst.s / worst.mx) * 100)
        const openers = [
          `Conditions observed in this zone are consistent with a ${zs.risk.toLowerCase()} assessment (${zs.tot}/100).`,
          `Assessment of this zone indicates a ${zs.risk.toLowerCase()} condition, with a composite zone score of ${zs.tot}/100.`,
          `Field observations and measurements in this zone reflect ${zs.risk.toLowerCase()} indoor air quality conditions (${zs.tot}/100).`,
          `The evaluation of this zone yields a score of ${zs.tot}/100, characteristic of ${zs.risk.toLowerCase()} conditions.`,
          `Conditions documented during the walkthrough of this zone are consistent with a ${zs.risk.toLowerCase()} classification (${zs.tot}/100).`,
        ]
        const contribs = [
          `The primary contributing category is ${worst.l} (${worst.s}/${worst.mx}, ${worstPct}%),`,
          `${worst.l} (${worst.s}/${worst.mx}, ${worstPct}%) is the most significant contributing factor,`,
          `The category of greatest concern is ${worst.l}, scoring ${worst.s}/${worst.mx} (${worstPct}%),`,
          `${worst.l} represents the primary area of concern at ${worst.s}/${worst.mx} (${worstPct}%),`,
        ]
        const qualifier = worstPct < 50 ? ' which represents a significant concern and would warrant prioritized attention.' : worstPct < 70 ? ' which suggests conditions that may benefit from targeted corrective action.' : ' which is performing within an acceptable range.'
        const multiLow = zs.cats.filter(c => (c.s/c.mx) < 0.5).length > 1 ? ' Multiple categories scored below 50%, suggesting interrelated contributing factors.' : ''
        return `
          <h3>Interpretation</h3>
          <p style="font-size:11px;color:#475569;line-height:1.8;">${openers[zi % openers.length]} ${contribs[zi % contribs.length]}${qualifier}${multiLow}</p>`
      })()}

      ${/* Contributing Factors */(() => {
        const factors = zs.cats.filter(c => c.r.filter(r => r.sev === 'critical' || r.sev === 'high').length > 0)
          .flatMap(c => c.r.filter(r => r.sev === 'critical' || r.sev === 'high').map(r => r.t))
        return factors.length > 0 ? `
          <h3>Likely Contributing Factors</h3>
          <ol style="font-size:11px;color:#475569;line-height:1.8;padding-left:18px;margin:4px 0 12px;">
            ${factors.map(f => `<li>${f}</li>`).join('')}
          </ol>` : ''
      })()}

      <h3>Findings Detail</h3>
      <table><thead><tr><th>Severity</th><th>Category</th><th>Finding</th><th>Reference</th></tr></thead><tbody>${findingRows(zs.cats)}</tbody></table>

      ${/* Zone Priority Actions */(() => {
        const zoneActions = []
        zs.cats.forEach(c => c.r.forEach(r => {
          if (r.sev === 'critical') zoneActions.push({ p: 'IMMEDIATE', c: '#B91C1C', a: r.t })
          else if (r.sev === 'high') zoneActions.push({ p: 'HIGH', c: '#C2410C', a: r.t })
        }))
        return zoneActions.length > 0 ? `
          <h3>Zone Priority Actions</h3>
          <table style="margin-bottom:12px;"><thead><tr><th style="width:80px;">Priority</th><th>Action Required</th></tr></thead><tbody>
          ${zoneActions.map(a => `<tr><td><span style="font-size:9px;font-weight:700;color:${a.c};text-transform:uppercase;">${a.p}</span></td><td style="font-size:11px;">${a.a}</td></tr>`).join('')}
          </tbody></table>` : ''
      })()}

      ${/* Confidence and Missing Data */`
      <div style="margin-top:12px;display:flex;gap:12px;">
        <div style="flex:1;padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;">
          <strong style="color:#334155;">Confidence:</strong> <span style="color:#475569;">${confLabel}${zs.tot < 40 ? ' — findings are directional pending follow-up' : ''}</span>
        </div>
        <div style="flex:1;padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;">
          <strong style="color:#334155;">Missing data:</strong> <span style="color:#475569;">${(oshaResult?.gaps||[]).length > 0 ? oshaResult.gaps.join(', ') : 'No significant data gaps identified for this zone'}</span>
        </div>
      </div>`}
    </div>`
  }).join('')}

  <!-- ═══ CAUSAL CHAIN ANALYSIS ═══ -->
  ${(causalChains || []).length > 0 ? `
  <h2 class="pg-break">Causal Chain Analysis</h2>
  <p style="font-size:11px;color:#475569;margin-bottom:12px;">The following concern pathways were identified through correlation of field observations, instrument measurements, and occupant reports. These are presented as structured evidence chains rather than confirmed root-cause determinations. Confidence levels reflect the strength and consistency of supporting evidence.</p>
  ${causalChains.map(ch => `
    <div class="chain-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:12px;">${ch.type}</strong>
        <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:0.3px;background:${ch.confidence === 'Strong' ? '#F0FDF4' : ch.confidence === 'Moderate' ? '#FFFBEB' : '#F8FAFC'};color:${ch.confidence === 'Strong' ? '#15803D' : ch.confidence === 'Moderate' ? '#A16207' : '#64748B'};">${ch.confidence}</span>
      </div>
      <div style="font-size:10px;color:#0E7490;font-family:monospace;margin-bottom:8px;">${ch.zone}</div>
      <div style="padding:8px 14px;background:#F8FAFC;border-left:2px solid #0E7490;border-radius:0 4px 4px 0;font-size:11px;color:#334155;margin-bottom:8px;">${ch.rootCause}</div>
      <div style="font-size:10px;font-weight:600;color:#64748B;margin-bottom:4px;">Supporting evidence:</div>
      ${ch.evidence.map(e => `<div class="evidence-item">${e}</div>`).join('')}
      <div style="font-size:10px;color:#64748B;margin-top:6px;font-style:italic;">This pathway would warrant targeted follow-up to confirm contributing conditions.</div>
    </div>
  `).join('')}` : ''}

  <!-- ═══ SAMPLING PLAN ═══ -->
  ${samplingPlan?.plan?.length > 0 ? `
  <h2>Recommended Sampling Plan</h2>
  <p style="font-size:11px;color:#475569;margin-bottom:10px;">The following sampling recommendations are based on field observations and direct-reading instrument data obtained during this assessment. They are intended to support further investigation where indicated and should be reviewed by a qualified professional prior to implementation.</p>
  <table>
    <thead><tr><th>Type</th><th>Zone</th><th>Priority</th><th>Method</th><th>Reference</th></tr></thead>
    <tbody>
    ${samplingPlan.plan.map(p => `
      <tr>
        <td style="font-weight:600;font-size:11px;">${p.type}</td>
        <td style="font-size:10px;font-family:monospace;color:#0E7490;">${p.zone}</td>
        <td><span style="font-size:9px;font-weight:700;text-transform:uppercase;color:${p.priority === 'critical' ? '#B91C1C' : p.priority === 'high' ? '#C2410C' : '#A16207'};">${p.priority}</span></td>
        <td style="font-size:10px;">${p.method}</td>
        <td style="font-size:9px;font-family:monospace;color:#64748B;">${p.standard}</td>
      </tr>
    `).join('')}
    </tbody>
  </table>
  ${samplingPlan.outdoorGaps?.length > 0 ? `
    <div class="note" style="background:#FEF2F2;border-color:#FECACA;">
      <strong style="color:#B91C1C;">Outdoor control gaps identified:</strong> ${samplingPlan.outdoorGaps.join('; ')}. Outdoor baseline samples are recommended to establish indoor/outdoor ratios for defensible interpretation.
    </div>` : ''}
  ` : ''}

  <!-- ═══ RECOMMENDATIONS REGISTER ═══ -->
  ${recs ? `
  <h2 class="pg-break">Recommendations Register</h2>
  <table>
    <thead><tr><th style="width:30px;">#</th><th style="width:70px;">Priority</th><th style="width:90px;">Category</th><th>Recommendation</th><th style="width:70px;">Timing</th></tr></thead>
    <tbody>
    ${[
      ...(recs.imm||[]).map((r,i) => ({id:`R-${String(i+1).padStart(2,'0')}`,p:'Immediate',c:'Emergency',r,t:'0–48 hrs',pc:'#B91C1C'})),
      ...(recs.eng||[]).map((r,i) => ({id:`R-${String(i+1+(recs.imm||[]).length).padStart(2,'0')}`,p:'High',c:'Engineering',r,t:'1–4 weeks',pc:'#0E7490'})),
      ...(recs.adm||[]).map((r,i) => ({id:`R-${String(i+1+(recs.imm||[]).length+(recs.eng||[]).length).padStart(2,'0')}`,p:'Medium',c:'Administrative',r,t:'1–3 months',pc:'#A16207'})),
      ...(recs.mon||[]).map((r,i) => ({id:`R-${String(i+1+(recs.imm||[]).length+(recs.eng||[]).length+(recs.adm||[]).length).padStart(2,'0')}`,p:'Low',c:'Monitoring',r,t:'Ongoing',pc:'#475569'})),
    ].map(row => `
      <tr class="rec-row">
        <td style="font-family:monospace;font-size:10px;color:#64748B;">${row.id}</td>
        <td><span style="font-size:9px;font-weight:700;color:${row.pc};">${row.p.toUpperCase()}</span></td>
        <td style="font-size:10px;color:#475569;">${row.c}</td>
        <td style="font-size:11px;">${row.r}</td>
        <td style="font-size:10px;color:#64748B;font-family:monospace;">${row.t}</td>
      </tr>
    `).join('')}
    </tbody>
  </table>` : ''}

  <!-- ═══ LIMITATIONS ═══ -->
  <h2>Limitations and Professional Judgment</h2>
  <p style="font-size:11px;color:#475569;line-height:1.8;">This report represents conditions observed during a single assessment event and may not reflect all temporal, seasonal, or operational variations in indoor air quality. The following limitations should be considered when interpreting findings:</p>
  <ul style="font-size:11px;color:#475569;line-height:2;padding-left:20px;margin:8px 0;">
    <li>Measurements were obtained using direct-reading instruments and represent point-in-time conditions at the locations sampled. Results are directional and may not represent worst-case or typical conditions.</li>
    <li>Areas not accessible during the assessment may present additional conditions not reflected in this report.</li>
    <li>HVAC system performance may vary with occupancy load, weather conditions, and operational changes. Ventilation adequacy should be confirmed under peak-occupancy conditions.</li>
    <li>Deterministic scoring is applied against published standards; professional judgment should be exercised in interpretation. Scores reflect a structured snapshot, not a comprehensive compliance determination.</li>
    <li>Causal pathways identified in this report are based on correlation of observed conditions and available evidence. They do not constitute confirmed root-cause determinations and would warrant targeted follow-up investigation where noted.</li>
    ${oshaResult?.gaps?.length > 0 ? `<li>Data gaps identified: ${oshaResult.gaps.join(', ')}. These gaps may affect the confidence of certain findings and should be addressed in follow-up assessment activities.</li>` : ''}
  </ul>
  <p style="font-size:11px;color:#475569;">Targeted follow-up assessment is recommended to confirm findings, evaluate the effectiveness of any corrective actions implemented, and address identified data gaps. This report is intended to support — not replace — professional judgment by a qualified industrial hygienist or EHS professional.</p>

  <!-- ═══ APPENDIX A — RAW MEASUREMENT SNAPSHOT ═══ -->
  <h2 class="pg-break">Appendix A — Raw Measurement Snapshot</h2>
  <p style="font-size:10px;color:#64748B;margin-bottom:12px;">The following table presents direct-reading instrument measurements obtained during the assessment. Values represent point-in-time readings at the locations indicated and should be interpreted in context with building conditions, occupancy, and weather at the time of assessment.</p>
  <table>
    <thead><tr><th>Zone</th><th>CO₂ (ppm)</th><th>Temp (°F)</th><th>RH (%)</th><th>PM2.5 (µg/m³)</th><th>CO (ppm)</th><th>TVOCs (µg/m³)</th><th>HCHO (ppm)</th></tr></thead>
    <tbody>
    ${(zones||[]).map((z, zi) => `
      <tr>
        <td style="font-weight:600;">${z.zn || 'Zone ' + (zi+1)}</td>
        <td style="font-family:monospace;text-align:center;">${z.co2 || '—'}${z.co2o ? ` <span style="color:#94A3B8;font-size:9px;">(out: ${z.co2o})</span>` : ''}</td>
        <td style="font-family:monospace;text-align:center;">${z.tf || '—'}${z.tfo ? ` <span style="color:#94A3B8;font-size:9px;">(out: ${z.tfo})</span>` : ''}</td>
        <td style="font-family:monospace;text-align:center;">${z.rh || '—'}${z.rho ? ` <span style="color:#94A3B8;font-size:9px;">(out: ${z.rho})</span>` : ''}</td>
        <td style="font-family:monospace;text-align:center;">${z.pm || '—'}${z.pmo ? ` <span style="color:#94A3B8;font-size:9px;">(out: ${z.pmo})</span>` : ''}</td>
        <td style="font-family:monospace;text-align:center;">${z.co || '—'}</td>
        <td style="font-family:monospace;text-align:center;">${z.tv || '—'}${z.tvo ? ` <span style="color:#94A3B8;font-size:9px;">(out: ${z.tvo})</span>` : ''}</td>
        <td style="font-family:monospace;text-align:center;">${z.hc || '—'}</td>
      </tr>
    `).join('')}
    </tbody>
  </table>
  <div style="margin-top:8px;font-size:9px;color:#94A3B8;">
    <strong>Reference thresholds:</strong> CO₂ differential >700 ppm above outdoor (ASHRAE 62.1) · Temp 68–79°F (ASHRAE 55) · RH 30–60% · PM2.5 &lt;35 µg/m³ (EPA 24-hr) · CO &lt;35 ppm (NIOSH REL) · TVOCs &lt;500 µg/m³ (concern) · HCHO &lt;0.016 ppm (NIOSH REL)
  </div>

  <!-- ═══ APPENDIX B — TRANSPARENT SCORING SUMMARY ═══ -->
  <h2 class="pg-break">Appendix B — Transparent Scoring Summary</h2>
  <p style="font-size:10px;color:#64748B;margin-bottom:12px;">AtmosFlow applies a deterministic scoring methodology against published occupational and environmental health standards. The composite score follows the AIHA exposure assessment strategy (Bullock &amp; Ignacio, 2015): if any zone scores Critical (&lt;40), the composite equals the worst zone score — ensuring a single failing area cannot be masked by otherwise acceptable conditions. When no zones are Critical, the composite reflects a priority-weighted mean where mission-critical zones (e.g., data halls) carry 1.5× weight. The building confidence rating reflects the lowest-confidence zone assessed. All category weights, thresholds, and overrides are fixed and published — no AI judgment is applied in scoring.</p>
  <table>
    <thead><tr><th>Category</th><th style="text-align:center;">Max Points</th><th>Evaluation Basis</th></tr></thead>
    <tbody>
      <tr><td style="font-weight:600;">Ventilation</td><td style="text-align:center;font-family:monospace;">25</td><td style="font-size:10px;color:#475569;">CO₂ differential vs ASHRAE 62.1, outdoor air damper status, supply airflow adequacy, complaint correlation</td></tr>
      <tr><td style="font-weight:600;">Contaminants</td><td style="text-align:center;font-family:monospace;">25</td><td style="font-size:10px;color:#475569;">PM2.5 (EPA/WHO), CO (OSHA/NIOSH), HCHO (OSHA/NIOSH), TVOCs, visible mold, odors, visible dust</td></tr>
      <tr><td style="font-weight:600;">HVAC</td><td style="text-align:center;font-family:monospace;">20</td><td style="font-size:10px;color:#475569;">Maintenance recency, filter condition/type, airflow adequacy, drain pan condition</td></tr>
      <tr><td style="font-weight:600;">Complaints</td><td style="text-align:center;font-family:monospace;">15</td><td style="font-size:10px;color:#475569;">Complaint presence, affected occupant count, symptom pattern clarity, clustering, symptom types</td></tr>
      <tr><td style="font-weight:600;">Environment</td><td style="text-align:center;font-family:monospace;">15</td><td style="font-size:10px;color:#475569;">Temperature (ASHRAE 55 summer/winter), relative humidity, water damage indicators, mold indicators</td></tr>
    </tbody>
  </table>

  <h3 style="margin-top:16px;">Zone Score Summary</h3>
  <table>
    <thead><tr><th>Zone</th><th style="text-align:center;">Score</th><th style="text-align:center;">Ventilation</th><th style="text-align:center;">Contaminants</th><th style="text-align:center;">HVAC</th><th style="text-align:center;">Complaints</th><th style="text-align:center;">Environment</th><th>Risk Level</th></tr></thead>
    <tbody>
    ${(zoneScores||[]).map(zs => `
      <tr>
        <td style="font-weight:600;">${zs.zoneName}</td>
        <td style="text-align:center;font-family:monospace;font-weight:700;color:${scoreColor(zs.tot)};">${zs.tot}</td>
        ${zs.cats.map(c => `<td style="text-align:center;font-family:monospace;font-size:10px;">${c.s}/${c.mx}</td>`).join('')}
        <td style="font-size:10px;font-weight:600;color:${scoreColor(zs.tot)};">${zs.risk}</td>
      </tr>
    `).join('')}
    ${comp ? `
    <tr style="background:#F8FAFC;font-weight:700;">
      <td>Composite</td>
      <td style="text-align:center;font-family:monospace;color:${scoreColor(comp.tot)};">${comp.tot}</td>
      <td colspan="5" style="text-align:center;font-size:10px;color:#64748B;">Avg: ${comp.avg} · Worst: ${comp.worst} · Weight: (avg × 0.6) + (worst × 0.4)</td>
      <td style="font-size:10px;color:${scoreColor(comp.tot)};">${comp.risk || riskLabel(comp.tot)}</td>
    </tr>` : ''}
    </tbody>
  </table>
  <div style="margin-top:8px;font-size:9px;color:#94A3B8;">
    <strong>Score bands:</strong> 80–100 Low Risk · 60–79 Moderate · 40–59 High Risk · 0–39 Critical
  </div>

  ${/* Spatial Risk Summary — only if zones have map coordinates */(() => {
    const mappedZones = (zones||[]).filter(z => z.mapX != null && z.mapY != null)
    if (!mappedZones.length || !data.floorPlan) return ''
    return `
    <h2 class="pg-break">Spatial Risk Summary</h2>
    <p style="font-size:11px;color:#475569;margin-bottom:12px;">The following floor plan overlay illustrates zone-level risk distribution across the assessed facility. Pin colors reflect AIHA worst-case risk thresholds.</p>
    <div style="position:relative;margin-bottom:16px;border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;">
      <img src="${data.floorPlan}" alt="Floor plan" style="width:100%;display:block;opacity:0.9;" />
      ${mappedZones.map((z, i) => {
        const zi = (zones||[]).indexOf(z)
        const score = (zoneScores||[])[zi]?.tot
        const color = score === null ? '#6B7380' : score < 50 ? '#B91C1C' : score < 80 ? '#A16207' : '#15803D'
        return `<div style="position:absolute;left:${z.mapX}%;top:${z.mapY}%;transform:translate(-50%,-100%);">
          <div style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px ${color}80;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#fff;font-family:monospace;">${score ?? '?'}</div>
        </div>`
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;font-size:9px;color:#64748B;margin-bottom:12px;">
      <span>● <span style="color:#15803D;">Low Risk (80–100)</span></span>
      <span>● <span style="color:#A16207;">Moderate (50–79)</span></span>
      <span>● <span style="color:#B91C1C;">Critical (&lt;50)</span></span>
    </div>
    <table><thead><tr><th>Zone</th><th style="text-align:center;">Score</th><th>Risk Level</th><th>Primary Concern</th></tr></thead><tbody>
    ${mappedZones.map((z, i) => {
      const zi = (zones||[]).indexOf(z)
      const zs = (zoneScores||[])[zi]
      const worst = zs?.cats?.reduce((a, b) => ((a.s/a.mx) < (b.s/b.mx) ? a : b))
      return `<tr><td style="font-weight:600;">${z.zn || 'Zone'}</td><td style="text-align:center;font-family:monospace;font-weight:700;color:${scoreColor(zs?.tot)};">${zs?.tot ?? '—'}</td><td style="font-size:10px;color:${scoreColor(zs?.tot)};">${zs?.risk || '—'}</td><td style="font-size:10px;color:#475569;">${worst?.l || '—'} (${worst?.s ?? '—'}/${worst?.mx ?? '—'})</td></tr>`
    }).join('')}
    </tbody></table>
    <p style="font-size:9px;color:#94A3B8;margin-top:8px;">Risk thresholds per AIHA exposure assessment strategy. Building composite reflects worst-zone override when any zone is Critical.</p>`
  })()}

  <!-- ═══ STANDARDS REFERENCE ═══ -->
  ${standardsManifest ? `
  <div style="margin-top:24px;padding:12px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:4px;font-size:9px;color:#64748B;">
    <div style="font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Standards Reference — Engine v${standardsManifest.engineVersion || '1.x'}</div>
    ${Object.entries(standardsManifest).filter(([k]) => k !== 'engineVersion' && k !== 'manifestUpdated').map(([k, v]) => `<span>${k}: ${v}</span>`).join(' · ')}
  </div>` : ''}

  <!-- ═══ FOOTER ═══ -->
  <div class="footer">
    <div>Prudence Safety &amp; Environmental Consulting, LLC &nbsp;|&nbsp; Report ID: ${reportId} &nbsp;|&nbsp; ${now}</div>
    <div style="margin-top:4px;font-size:8px;">Confidential — This report is intended for the client identified above and should not be distributed to third parties without authorization.</div>
  </div>
</body>
</html>`
}

export function printReport(data) {
  const html = generatePrintHTML(data)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AtmosFlow-Report-${data.building?.fn || 'Assessment'}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
