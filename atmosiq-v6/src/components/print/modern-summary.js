/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Modern Summary report — a concise, plain-language, visually-modern
 * consultant report that matches the AtmosFlow sample design
 * (scripts/generate-sample-report-pdf.mjs): cyan-band cover, identity card,
 * an at-a-glance snapshot, a key-findings table with severity chips,
 * plain-language "what we measured & why" explainers, embedded Logger Studio
 * charts, a tiered recommendation list, and a short limitations note.
 *
 * Unlike the classic / modern-editorial HTML reports (which render the
 * engine's full ClientReport prose), this renderer authors CONCISE content
 * at the presentation layer directly from the raw assessment data, so it is
 * intentionally short and reads in plain language. It is a client-facing
 * screening summary — the formal DOCX remains the defensible deliverable.
 *
 * Branding is customizable: firm name + accent color come from the profile
 * (opts.brandColor / profile.brandColor) so each firm's report carries its
 * own identity. Engine-sacred respected — reads scoring OUTPUT only.
 */

import { actionLine } from '../../utils/recFormatting'
import { summarizeParameters, peakCo2ByZone } from '../../report/reportModel'

// Screening-outcome palette (matches the sample design + reportModel tiers).
const OUTCOME_TONE = { acceptable: '#15803D', advisory: '#B45309', elevated: '#C2410C' }
const OUTCOME_LABEL = { acceptable: 'Acceptable', advisory: 'Advisory', elevated: 'Elevated' }

function esc(v) {
  if (v === null || v === undefined) return ''
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SEV = {
  critical: { c: '#B91C1C', label: 'Critical' },
  high: { c: '#C2410C', label: 'High' },
  medium: { c: '#B45309', label: 'Advisory' },
  low: { c: '#0E7490', label: 'Low' },
  pass: { c: '#15803D', label: 'Acceptable' },
  info: { c: '#475569', label: 'Note' },
}
const FLAGGED = new Set(['critical', 'high', 'medium'])

// Plain-language parameter explainers — rendered only for parameters the
// assessment actually captured (zone keys). Educational context, not findings.
const EXPLAINERS = [
  { keys: ['co2'], label: 'Carbon dioxide (CO2)', text: 'Builds up indoors when fresh-air supply does not keep pace with the number of people. It is not a hazard at office levels — it is the practical indicator of whether a space is well ventilated for its occupancy.' },
  { keys: ['co'], label: 'Carbon monoxide (CO)', text: 'A colorless, odorless gas from combustion (engines, gas appliances). Even low readings are screened to rule out combustion sources reaching occupied space.' },
  { keys: ['tf', 'rh'], label: 'Temperature & humidity', text: 'The thermal environment — the most common driver of comfort complaints. Humidity also matters: too high can support mold, too low causes dryness and irritation.' },
  { keys: ['pm'], label: 'Fine particulate (PM2.5)', text: 'Tiny airborne particles from cooking, printing, or outdoor air. Measured as an indicator of particulate levels and how well filtration is working.' },
  { keys: ['tv', 'tvoc'], label: 'Total VOCs (TVOC)', text: 'A combined, non-specific reading of gases that off-gas from furnishings, cleaning products, and equipment. It flags that a source is present and worth investigating — it does not identify a specific chemical or a health risk on its own.' },
]

function snapshotLine(tot) {
  if (tot == null) return 'This screening summarizes the conditions observed during the assessment.'
  if (tot >= 70) return 'Most areas screened within expected ranges, with a few spots flagged for a closer look.'
  if (tot >= 50) return 'Some areas showed conditions worth attention; targeted follow-up is recommended below.'
  return 'Several areas showed conditions that warrant prompt attention, summarized below.'
}

function styles(accent) {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  :root{ --accent:${accent}; --accent-dk:#155E75; --ink:#0F172A; --slate:#475569; --faint:#64748B; --rule:#E2E8F0; --card:#F8FAFC; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--ink);line-height:1.6;font-size:11pt;background:#fff;max-width:8.5in;margin:0 auto;padding:0 0.7in 0.7in}
  h2{font-size:13pt;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.04em;margin:30px 0 6px;padding-bottom:6px;border-bottom:1px solid var(--rule)}
  h3{font-size:11pt;font-weight:700;color:var(--accent-dk);margin:16px 0 4px}
  p{margin-bottom:9px;color:var(--slate)}
  .section{margin-bottom:8px}
  .band{position:relative;margin:0 -0.7in 22px;padding:42px 0.7in 26px;background:var(--accent);color:#fff}
  .band .firm{font-size:10pt;letter-spacing:.02em;opacity:.92}
  .band .wm{font-size:24pt;font-weight:700;margin-top:4px}
  .title{font-size:21pt;font-weight:700;color:var(--ink);margin:6px 0 2px;letter-spacing:-.01em}
  .subtitle{color:var(--slate);font-size:11.5pt;margin-bottom:12px}
  .chip-status{display:inline-block;font-size:8.5pt;font-weight:600;color:var(--faint);border:1px solid var(--rule);border-radius:999px;padding:4px 12px}
  .card{background:var(--card);border:1px solid var(--rule);border-radius:9px;padding:16px 20px;margin:12px 0}
  .card.accent{border-color:color-mix(in srgb, var(--accent) 45%, transparent)}
  .meta{width:100%;border-collapse:collapse}
  .meta td{padding:6px 0;border-bottom:1px solid var(--rule);font-size:10pt;vertical-align:top}
  .meta td.k{color:var(--faint);font-size:8.5pt;text-transform:uppercase;letter-spacing:.05em;width:165px;font-weight:600}
  .meta tr:last-child td{border-bottom:none}
  .snap{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
  .score{width:84px;height:84px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;border:3px solid var(--accent);color:var(--accent-dk)}
  .score b{font-size:24pt;font-weight:800;line-height:1}
  .score span{font-size:7.5pt;color:var(--faint);text-transform:uppercase;letter-spacing:.06em}
  table.t{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:9.5pt}
  table.t th{background:var(--accent);color:#fff;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:7px 10px}
  table.t td{padding:7px 10px;border-bottom:1px solid var(--rule);color:var(--ink);vertical-align:top}
  table.t tbody tr:nth-child(even) td{background:#FCFDFE}
  .sev{display:inline-block;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#fff;border-radius:999px;padding:2px 9px}
  .rec-group{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent-dk);margin:14px 0 4px}
  ul.lean{margin:2px 0 8px 18px}
  ul.lean li{margin-bottom:4px;color:var(--slate)}
  .fig{margin:10px 0 6px}
  .fig img{width:100%;border:1px solid var(--rule);border-radius:8px}
  .fig .cap{font-size:8.5pt;color:var(--faint);font-style:italic;margin-top:4px}
  .note{font-size:9pt;color:var(--faint);background:var(--card);border:1px solid var(--rule);border-radius:7px;padding:12px 16px;margin-top:10px}
  .footer{margin-top:26px;padding-top:12px;border-top:1px solid var(--rule);text-align:center;font-size:8pt;color:var(--faint);line-height:1.7}
  @page{margin:0.5in}
  @media print{ body{padding:0} .band{margin:0 0 22px;padding:36px 0.5in 24px} h2,table.t,.card,.fig{page-break-inside:avoid} *,*::before{ -webkit-print-color-adjust:exact;print-color-adjust:exact } }
  @media screen and (max-width:840px){ body{padding:0 16px 22px} .band{margin:0 -16px 18px;padding:30px 16px 20px} }
  `
}

// Crisp inline-SVG bar chart of peak CO2 per zone (prints sharp; no canvas).
function co2BarSvg(bars, threshold) {
  const W = 640, H = 220, L = 46, R = 14, T = 16, B = 38
  const pw = W - L - R, ph = H - T - B
  const yMax = Math.max(threshold * 1.15, ...bars.map(b => b.value)) || 1
  const y = v => T + ph - (v / yMax) * ph
  const n = bars.length, slot = pw / n, bw = Math.min(54, slot * 0.6)
  const ticks = [0, Math.round(yMax / 2), Math.round(yMax)]
  const grid = ticks.map(t => `<line x1="${L}" y1="${y(t).toFixed(1)}" x2="${W - R}" y2="${y(t).toFixed(1)}" stroke="#E2E8F0" stroke-width="0.6"/><text x="${L - 6}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748B">${t}</text>`).join('')
  const ty = y(threshold)
  const thr = `<line x1="${L}" y1="${ty.toFixed(1)}" x2="${W - R}" y2="${ty.toFixed(1)}" stroke="#C2410C" stroke-width="1" stroke-dasharray="4 3"/><text x="${W - R}" y="${(ty - 4).toFixed(1)}" text-anchor="end" font-size="8.5" fill="#C2410C">ASHRAE 62.1 advisory (${threshold} ppm)</text>`
  const cols = bars.map((b, i) => {
    const cx = L + slot * i + (slot - bw) / 2
    const by = y(b.value), bh = T + ph - by
    const fill = OUTCOME_TONE[b.outcome] || '#0E7490'
    const label = String(b.zone).length > 9 ? String(b.zone).slice(0, 9) + '…' : b.zone
    return `<rect x="${cx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${fill}"/>`
      + `<text x="${(cx + bw / 2).toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#0F172A" font-weight="600">${b.value}</text>`
      + `<text x="${(cx + bw / 2).toFixed(1)}" y="${(H - B + 13).toFixed(1)}" text-anchor="middle" font-size="8" fill="#64748B">${esc(label)}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Peak CO2 by zone" style="max-width:100%;border:1px solid #E2E8F0;border-radius:8px;background:#fff">`
    + `<line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="#475569" stroke-width="0.6"/><line x1="${L}" y1="${T + ph}" x2="${W - R}" y2="${T + ph}" stroke="#475569" stroke-width="0.6"/>`
    + grid + cols + thr + `</svg>`
}

export function generateModernSummaryHTML(data, opts = {}) {
  const bldg = data.building || {}
  const ps = data.presurvey || {}
  const zones = data.zones || []
  const zoneScores = data.zoneScores || []
  const comp = data.comp || null
  const profile = data.profile || {}
  const accent = opts.brandColor || profile.brandColor || '#0E7490'
  const firm = profile.firm || 'Prudence Safety & Environmental Consulting, LLC'
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const assessDate = data.ts ? new Date(data.ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : now
  const assessor = profile.name || ps.ps_assessor || 'Assessor'
  const reportId = data.id || `AIQ-${Date.now().toString(36).toUpperCase().slice(-6)}`

  // Flagged findings across zones (concise, top 8).
  const findings = zoneScores.flatMap(zs => (zs.cats || []).flatMap(c => (c.r || [])
    .filter(r => FLAGGED.has(r.sev))
    .map(r => ({ sev: r.sev, zone: zs.zoneName || 'Zone', cat: c.l, t: r.t, std: r.std }))))
  const sevRank = { critical: 0, high: 1, medium: 2 }
  findings.sort((a, b) => (sevRank[a.sev] ?? 9) - (sevRank[b.sev] ?? 9))

  const measured = EXPLAINERS.filter(e => zones.some(z => z && e.keys.some(k => z[k] !== undefined && z[k] !== null && String(z[k]).trim() !== '')))

  // Per-parameter findings-at-a-glance + peak-CO2 bar — derived deterministically
  // by the Report Model compiler (range/mean/outcome from STD thresholds).
  const params = summarizeParameters(zones)
  const paramRows = Object.values(params)
  const co2Bars = peakCo2ByZone(zones, zoneScores)
  const outcomeChip = (oc) => `<span class="sev" style="background:${OUTCOME_TONE[oc] || '#475569'}">${OUTCOME_LABEL[oc] || oc}</span>`

  const recs = data.recs || {}
  const recLines = (arr) => (arr || []).map(r => typeof r === 'string' ? r : actionLine(r)).filter(Boolean)
  const recGroups = [
    { label: 'Immediate (0–7 days)', items: recLines(recs.imm) },
    { label: 'Short term (7–30 days)', items: recLines(recs.eng) },
    { label: 'Longer term (30–90 days)', items: [...recLines(recs.adm), ...recLines(recs.mon)] },
  ].filter(g => g.items.length)

  // Embedded Logger Studio charts (the PNGs Logger Studio already produced).
  const graphs = data.sensorData && data.sensorData.graphs
    ? Object.values(data.sensorData.graphs).filter(g => g && g.include && typeof g.imageDataUrl === 'string' && g.imageDataUrl.startsWith('data:image'))
    : []

  const sevChip = (sev) => `<span class="sev" style="background:${SEV[sev]?.c || SEV.info.c}">${SEV[sev]?.label || sev}</span>`

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IAQ Summary — ${esc(bldg.fn) || 'Assessment'}</title>
<style>${styles(accent)}</style></head><body>

  <div class="band">
    <div class="firm">${esc(firm)}</div>
    <div class="wm">AtmosFlow</div>
    <div style="font-size:10pt;opacity:.92;margin-top:2px">Indoor Air Quality — Screening Summary</div>
  </div>

  <div class="title">Indoor Air Quality Summary</div>
  <div class="subtitle">A plain-language screening overview of the conditions we measured.</div>
  <span class="chip-status">Screening summary · for client review</span>

  <div class="card">
    <table class="meta"><tbody>
      <tr><td class="k">Site</td><td>${esc(bldg.fn) || 'Facility'}</td></tr>
      <tr><td class="k">Location</td><td>${esc(bldg.fl) || '—'}</td></tr>
      <tr><td class="k">Assessment date</td><td>${assessDate}</td></tr>
      <tr><td class="k">Assessor</td><td>${esc(assessor)}${profile.certs && profile.certs.length ? `, ${esc(profile.certs.join(', '))}` : ''}</td></tr>
      <tr><td class="k">Report ID</td><td>${esc(reportId)}</td></tr>
    </tbody></table>
  </div>

  <h2>At a Glance</h2>
  <div class="card accent">
    <div class="snap">
      ${comp ? `<div class="score"><b>${comp.tot}</b><span>of 100</span></div>` : ''}
      <div style="flex:1;min-width:220px">
        <p style="color:var(--ink);font-weight:500;margin-bottom:6px">${snapshotLine(comp ? comp.tot : null)}</p>
        <div style="font-size:9.5pt;color:var(--faint)">
          ${zones.length} area${zones.length === 1 ? '' : 's'} screened${comp && comp.risk ? ` · overall: <strong style="color:var(--accent-dk)">${esc(comp.risk)}</strong>` : ''}${findings.length ? ` · ${findings.length} item${findings.length === 1 ? '' : 's'} flagged` : ' · no items flagged'}
        </div>
      </div>
    </div>
  </div>

  ${paramRows.length ? `
  <h2>Findings at a Glance</h2>
  <table class="t"><thead><tr><th>Parameter</th><th style="width:110px">Site range</th><th style="width:180px">Reference basis</th><th style="width:110px">Screening outcome</th></tr></thead><tbody>
    ${paramRows.map(p => `<tr><td>${esc(p.label)}</td><td>${esc(p.range)} ${esc(p.unit)}</td><td style="color:var(--faint)">${esc(p.basis)}</td><td>${outcomeChip(p.outcome)}</td></tr>`).join('')}
  </tbody></table>
  <p style="font-size:8.5pt;color:var(--faint)">Outcomes are screening indicators (threshold comparison against recognized references), not compliance determinations.</p>
  ` : ''}

  ${co2Bars.length > 1 ? `
  <h2>Peak CO2 by Zone</h2>
  ${co2BarSvg(co2Bars, 1000)}
  <p class="cap" style="font-size:8.5pt;color:var(--faint);font-style:italic;margin-top:4px">Highest CO2 reading per area against the ASHRAE 62.1 ventilation indicator. Bar color reflects the screening outcome.</p>
  ` : ''}

  ${findings.length ? `
  <h2>What We Found</h2>
  <table class="t"><thead><tr><th style="width:90px">Priority</th><th style="width:120px">Area</th><th>What we observed</th></tr></thead><tbody>
    ${findings.slice(0, 8).map(f => `<tr><td>${sevChip(f.sev)}</td><td>${esc(f.zone)}</td><td>${esc(f.t)}</td></tr>`).join('')}
  </tbody></table>
  ${findings.length > 8 ? `<p style="font-size:9pt;color:var(--faint)">${findings.length - 8} more item${findings.length - 8 === 1 ? '' : 's'} are detailed in the full report.</p>` : ''}
  ` : `<h2>What We Found</h2><p>No conditions were flagged above the screening thresholds during this assessment.</p>`}

  ${graphs.length ? `
  <h2>Logger Data</h2>
  ${graphs.map(g => `<div class="fig">
    ${g.title ? `<h3>${esc(g.title)}</h3>` : ''}
    <img src="${g.imageDataUrl}" alt="${esc(g.title || 'Logger chart')}" />
    ${g.caption ? `<div class="cap">${esc(g.caption)}</div>` : ''}
  </div>`).join('')}
  ` : ''}

  ${measured.length ? `
  <h2>What We Measured & Why</h2>
  ${measured.map(e => `<h3>${esc(e.label)}</h3><p>${esc(e.text)}</p>`).join('')}
  ` : ''}

  ${recGroups.length ? `
  <h2>Recommended Next Steps</h2>
  ${recGroups.map(g => `<div class="rec-group">${esc(g.label)}</div><ul class="lean">${g.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul>`).join('')}
  ` : ''}

  <h2>Good to Know</h2>
  <div class="note">
    This is a screening-level summary of conditions observed on the assessment date. It is not a regulatory exposure determination, an OSHA compliance certification, or a medical evaluation. Direct-reading values are indicators that may vary with occupancy and operation; where something is flagged, the recommended next step is verification before any major investment. The full consultant report contains the detailed methodology, references, and professional review.
  </div>

  <div class="footer">
    ${esc(firm)} · Report ${esc(reportId)} · Generated ${now}<br>
    Prepared with AtmosFlow — screening summary for client review.
  </div>

</body></html>`
}
