#!/usr/bin/env node
/**
 * validate-report.js — HTML report integrity checker
 *
 * Usage:
 *   node scripts/validate-report.js path/to/report.html
 *   node scripts/validate-report.js path/to/report.html --final
 *
 * Checks rendered HTML for data integrity, consistency, and professional quality.
 * Exit code 0 = all passed, 1 = failures found.
 */

import { readFileSync } from 'fs'
import { load } from 'cheerio'

const args = process.argv.slice(2)
const filePath = args.find(a => !a.startsWith('--'))
const isFinal = args.includes('--final')

if (!filePath) {
  console.error('Usage: node scripts/validate-report.js <report.html> [--final]')
  process.exit(2)
}

const html = readFileSync(filePath, 'utf-8')
const $ = load(html)
const text = $('body').text()
const allText = html

const results = []
function check(name, fn) {
  try {
    const r = fn()
    results.push({ name, ...r })
  } catch (e) {
    results.push({ name, pass: false, detail: `Error: ${e.message}` })
  }
}

// ── 1. No NaN values rendered ─────────────────────────────────────────────
check('No NaN values rendered', () => {
  const nanMatches = text.match(/\bNaN\b/g) || []
  const nanInHtml = allText.match(/NaN/g) || []
  const count = nanInHtml.length
  return count === 0
    ? { pass: true }
    : { pass: false, detail: `Found ${count} occurrence${count !== 1 ? 's' : ''}` }
})

// ── 2. No null values rendered ────────────────────────────────────────────
check('No null values rendered', () => {
  const nullPatterns = [/\bnull\b\/\d+/g, /\bnull\b%/g, /\bnull\/\d+/g]
  let count = 0
  nullPatterns.forEach(p => { count += (text.match(p) || []).length })
  const bareNull = (text.match(/\bnull\b/g) || []).filter(m => true)
  count += (allText.match(/null\/\d+/g) || []).length
  return count === 0
    ? { pass: true }
    : { pass: false, detail: `Found ${count} null-in-score occurrence${count !== 1 ? 's' : ''}` }
})

// ── 3. Site name consistent ───────────────────────────────────────────────
check('Site name consistent', () => {
  const h1 = $('h1').first().text().trim()
  if (!h1) return { pass: false, detail: 'No <h1> found — cannot extract site name' }

  const siteRefs = []
  $('h1, h2, h3, p, td, div').each((_, el) => {
    const t = $(el).text()
    if (t.includes(h1) && t !== h1) siteRefs.push(t.trim().substring(0, 80))
  })

  // Look for the site name in the cover / header area
  const coverText = $('body').children().first().text().substring(0, 2000)
  // Extract building name from "Site:" or the first bold heading
  const siteMatch = coverText.match(/Site:\s*(.+?)(?:\n|$)/i) || coverText.match(/Assessment Report\s+(.+?)(?:\n|$)/i)
  const siteName = siteMatch?.[1]?.trim() || h1

  // Check all occurrences of anything that looks like a facility name in h2/h3 headings
  const nameVariants = new Set()
  $('h1, h2, h3').each((_, el) => {
    const t = $(el).text().trim()
    if (t.length > 3 && t.length < 100 && !t.match(/^(Executive|Scope|Building|Zone|Appendix|Limitation|Recommend|Sampling|Finding|Causal|Standards)/i)) {
      nameVariants.add(t)
    }
  })

  // Check zone table headers for mismatched building references
  const allNames = []
  $('td, th, strong, b').each((_, el) => {
    const t = $(el).text().trim()
    if (t.includes('Building') && t.match(/Building\s+\d+/)) allNames.push(t)
  })
  const uniqueBuildings = [...new Set(allNames)]
  if (uniqueBuildings.length > 1) {
    return { pass: false, detail: `"${uniqueBuildings[0]}" ≠ "${uniqueBuildings[1]}"` }
  }

  return { pass: true }
})

// ── 4. No empty section placeholders ──────────────────────────────────────
check('No empty section placeholders', () => {
  const sections = []
  $('h2').each((_, el) => {
    const heading = $(el).text().trim()
    const nextContent = []
    let sibling = $(el).next()
    let charCount = 0
    while (sibling.length && !sibling.is('h2')) {
      charCount += sibling.text().trim().length
      sibling = sibling.next()
    }
    if (charCount < 10) sections.push(heading)
  })
  return sections.length === 0
    ? { pass: true }
    : { pass: false, detail: `"${sections[0]}" empty${sections.length > 1 ? ` (+${sections.length - 1} more)` : ''}` }
})

// ── 5. Zone scores reconcile ──────────────────────────────────────────────
check('Zone scores reconcile', () => {
  // Extract zone scores from the zone headers and the appendix summary
  const zoneScores = {}
  const scorePattern = /(\d+)\s*\/\s*100/g
  const issues = []

  // Look for zone-level score displays
  $('h3, h4, div').each((_, el) => {
    const t = $(el).text()
    const scoreMatch = t.match(/(\d+)\s*\/\s*100/)
    if (scoreMatch) {
      const zoneName = t.replace(/\d+\s*\/\s*100.*/, '').trim().substring(0, 50)
      if (zoneName && zoneName.length > 2 && zoneName.length < 50) {
        if (!zoneScores[zoneName]) zoneScores[zoneName] = []
        zoneScores[zoneName].push(parseInt(scoreMatch[1]))
      }
    }
  })

  // Check for inconsistencies within the same zone
  for (const [zone, scores] of Object.entries(zoneScores)) {
    const unique = [...new Set(scores)]
    if (unique.length > 1) {
      const diff = Math.abs(unique[0] - unique[1])
      issues.push(`${zone}: ${unique[0]} → ${unique[1]}, -${diff}pt adjustment not itemized`)
    }
  }

  return issues.length === 0
    ? { pass: true }
    : { pass: false, detail: issues[0] }
})

// ── 6. Scoring schema disclosed ───────────────────────────────────────────
check('Scoring schema disclosed', () => {
  const hasTransparency = text.includes('Standards Reference') || text.includes('Scoring Methodology') || text.includes('Engine v')
  const hasRiskBands = text.includes('Low Risk') || text.includes('Moderate') || text.includes('High Risk') || text.includes('Critical')

  // Check if category weights are disclosed
  const schemas = []
  if (text.match(/Ventilation.*\/\s*25/)) schemas.push('default')
  if (text.match(/Ventilation.*\/\s*15/)) schemas.push('data_hall')
  if (text.match(/HVAC.*\/\s*30/)) schemas.push('data_hall')
  if (text.match(/HVAC.*\/\s*20/)) schemas.push('default')

  const uniqueSchemas = [...new Set(schemas)]
  const disclosed = text.includes('zone-type') || text.includes('weight') || text.includes('category')

  if (uniqueSchemas.length > 1 && !disclosed) {
    return { pass: false, detail: `${uniqueSchemas.length} schemas in use, 1 documented` }
  }
  return hasTransparency
    ? { pass: true }
    : { pass: false, detail: 'No scoring methodology transparency section found' }
})

// ── 7. Findings paired with recommendations ──────────────────────────────
check('Findings paired with recommendations', () => {
  // Extract critical/high findings
  const findings = []
  $('td, div, span').each((_, el) => {
    const t = $(el).text().trim()
    const parent = $(el).parent().text()
    if ((parent.includes('critical') || parent.includes('high') || t.match(/EXCEEDS|exceeded|critically|Critical/)) && t.length > 20 && t.length < 200) {
      findings.push(t.substring(0, 60))
    }
  })

  // Extract recommendations
  const recsText = text.substring(text.indexOf('Recommend') || 0)

  // Key terms that should bridge findings to recs
  const bridges = [
    { finding: /CO\s+\d+.*OSHA/i, rec: /evacuate|combustion|CO/i },
    { finding: /formaldehyde.*OSHA/i, rec: /formaldehyde|1910\.1048/i },
    { finding: /no supply airflow/i, rec: /HVAC service|airflow|restore/i },
    { finding: /no filtration/i, rec: /filtration|filter|HVAC/i },
    { finding: /drain pan/i, rec: /drain|microbial|moisture/i },
    { finding: /water.*intrusion|active leak/i, rec: /water|intrusion|leak/i },
    { finding: /maintenance.*overdue/i, rec: /maintenance|HVAC|inspection/i },
  ]

  let orphans = 0
  bridges.forEach(b => {
    if (text.match(b.finding) && !recsText.match(b.rec)) orphans++
  })

  return orphans === 0
    ? { pass: true }
    : { pass: false, detail: `${orphans} orphan${orphans !== 1 ? 's' : ''}` }
})

// ── 8. Building pressure handled ──────────────────────────────────────────
check('Building pressure handled', () => {
  const pressureRefs = []
  $('td, div, span, p').each((_, el) => {
    const t = $(el).text().trim()
    if (t.toLowerCase().includes('pressure') || t.toLowerCase().includes('pressur')) {
      pressureRefs.push(t.substring(0, 80))
    }
  })

  // Check for bare dashes or empty values near pressure references
  const bareDash = pressureRefs.some(r => r.match(/pressure[:\s]*[—–-]\s*$/i) || r === '—' || r === '-')
  if (bareDash) return { pass: false, detail: 'bare dash' }

  return { pass: true }
})

// ── 9. Cited standards covered in manifest ────────────────────────────────
check('Cited standards covered in manifest', () => {
  const stdRefs = []
  const patterns = [
    /ASHRAE\s+[\d.]+[-\d]*/gi,
    /\d+\s+CFR\s+[\d.]+/gi,
    /NIOSH\s+\w+/gi,
    /EPA\s+\w+/gi,
    /OSHA\s+PEL/gi,
    /IICRC\s+S\d+/gi,
    /ISO\s+\d+/gi,
    /ANSI\/ISA\s+[\d.]+/gi,
  ]
  patterns.forEach(p => {
    const matches = text.match(p) || []
    stdRefs.push(...matches)
  })

  const hasManifest = text.includes('Standards Reference') || text.includes('standards')
  if (!hasManifest && stdRefs.length > 0) {
    return { pass: false, detail: `${stdRefs.length} standard${stdRefs.length !== 1 ? 's' : ''} cited but no manifest found` }
  }
  return { pass: true }
})

// ── 10. No forbidden language ─────────────────────────────────────────────
check('No forbidden language', () => {
  const forbidden = ['CRITICAL SYSTEM FAILURE', 'SYNERGISTIC TOXICITY', 'CRITICAL TOXICITY', 'System Integrity Override', 'emergency HVAC']
  const found = forbidden.filter(f => text.includes(f))
  return found.length === 0
    ? { pass: true }
    : { pass: false, detail: `Found: ${found.join(', ')}` }
})

// ── 11. License # present (--final only) ──────────────────────────────────
check('License # present', () => {
  if (!isFinal) return { pass: true, skip: true }
  const hasLicense = text.match(/\b(CIH|CSP|PE|CHMM|QEP)\b/) || text.match(/license|certification|credential/i)
  return hasLicense
    ? { pass: true }
    : { pass: false, detail: 'No professional credentials found in report' }
})

// ── 12. No placeholder names (--final only) ───────────────────────────────
check('No placeholder names', () => {
  if (!isFinal) return { pass: true, skip: true }
  const placeholders = ['Assessor', 'Untitled', 'Test Facility', 'PLACEHOLDER', '[INSERT', '[TODO']
  const found = placeholders.filter(p => text.includes(p))
  return found.length === 0
    ? { pass: true }
    : { pass: false, detail: `Found: ${found.join(', ')}` }
})

// ── Output ────────────────────────────────────────────────────────────────
const passed = results.filter(r => r.pass)
const failed = results.filter(r => !r.pass)

console.log('')
results.forEach(r => {
  const icon = r.pass ? '✓' : '✗'
  const skipNote = r.skip ? ` (skipped, not --final)` : ''
  const detail = r.detail ? ` — ${r.detail}` : ''
  console.log(`${icon} ${r.name}${detail}${skipNote}`)
})

console.log(`\n${passed.length} passed, ${failed.length} failed`)
process.exit(failed.length > 0 ? 1 : 0)
