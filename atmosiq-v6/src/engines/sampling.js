/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { STD } from '../constants/standards'

export function generateSamplingPlan(zones, bldg) {
  const plan = []
  zones.forEach((z, i) => {
    const zName = z.zn || ('Zone ' + (i + 1))
    const d = { ...bldg, ...z }
    if (d.mi && d.mi !== 'None') {
      plan.push({ zone:zName, type:'Bioaerosol', priority:d.mi.includes('Extensive')?'critical':'high',
        hypothesis:'Visible mold indicators ('+d.mi+') suggest fungal amplification',
        method:'Culturable air samples (Andersen impactor) + surface tape/swab at growth locations',
        controls:'Outdoor control sample REQUIRED for species comparison. Unaffected indoor control recommended.',
        standard:'AIHA Field Guide for Bioaerosol Assessment · ACGIH Bioaerosols Guidelines' })
    }
    if (d.wd === 'Active leak' || d.wd === 'Extensive damage') {
      plan.push({ zone:zName, type:'Moisture / Bioaerosol', priority:'high',
        hypothesis:'Active water intrusion ('+d.wd+') creates conditions for microbial amplification',
        method:'Moisture mapping (pin/pinless meter). If RH >60% or moisture >19% MC in wood, add bioaerosol sampling.',
        controls:'Dry reference area for comparison. Document moisture readings at grid pattern.',
        standard:'IICRC S520 · EPA Mold Remediation in Schools and Commercial Buildings' })
    }
    if ((d.ot||[]).includes('Musty / Earthy') && (!d.mi || d.mi === 'None')) {
      plan.push({ zone:zName, type:'Hidden Bioaerosol', priority:'medium',
        hypothesis:'Musty odor without visible mold suggests hidden fungal growth (wall cavities, above ceiling)',
        method:'Wall cavity sampling via bore hole or spore trap. Ceiling tile lift inspection with air sampling.',
        controls:'Outdoor and unaffected indoor control samples.',
        standard:'AIHA Recognition, Evaluation, and Control of Indoor Mold' })
    }
    if (d.hc && +d.hc > STD.c.hcho.niosh) {
      plan.push({ zone:zName, type:'Formaldehyde', priority:'high',
        hypothesis:'Elevated real-time HCHO ('+d.hc+' ppm) — confirm with integrated method',
        method:'NIOSH 2016 (DNPH cartridge, 2-4 hr TWA) or passive badge (8-hr TWA)',
        controls:'Outdoor sample. Note: new furniture/carpet/composite wood are common sources.',
        standard:'OSHA Formaldehyde Standard 29 CFR 1910.1048' })
    }
    if ((d.src_internal||[]).some(s=>['New furniture / carpet / paint','Construction materials'].includes(s)) && d.rn !== 'No') {
      plan.push({ zone:zName, type:'VOC Speciation', priority:'medium',
        hypothesis:'Recent renovation/new materials with off-gassing potential',
        method:'TO-17 sorbent tube (thermal desorption GC/MS). 4-8 hr sample.',
        controls:'Outdoor control sample. Pre-renovation baseline if available.',
        standard:'EPA TO-17 · AIHA Indoor Air Quality for Low-Rise Residential Buildings' })
    }
    if (d.tv && +d.tv > STD.c.tvoc.con && !(d.hc && +d.hc > STD.c.hcho.niosh)) {
      plan.push({ zone:zName, type:'VOC Speciation', priority:'medium',
        hypothesis:'Elevated TVOCs ('+d.tv+' ug/m3) by PID — speciation needed',
        method:'TO-17 sorbent tube or SUMMA canister (TO-15) for full VOC profile',
        controls:'Outdoor control. PID cannot identify individual compounds — lab analysis required.',
        standard:'EPA Compendium Methods TO-15 / TO-17' })
    }
    if (d.co && +d.co > 5) {
      plan.push({ zone:zName, type:'Combustion Gas', priority:+d.co > STD.c.co.niosh?'critical':'medium',
        hypothesis:'Elevated CO ('+d.co+' ppm) indicates combustion gas intrusion',
        method:'Trace CO to source using real-time monitor. Check parking garage, boiler room, loading dock.',
        controls:'Outdoor CO reading. Map CO gradient from suspected source.',
        standard:'ASHRAE 62.1 · OSHA 29 CFR 1910.1000' })
    }
    if ((d.ot||[]).includes('Sewage') || (d.path_crosstalk||'').includes('Sewer')) {
      plan.push({ zone:zName, type:'Sewer Gas', priority:'medium',
        hypothesis:'Sewage odor suggests sewer gas intrusion (H2S, mercaptans) via dry traps or plumbing defects',
        method:'H2S real-time monitor. Check all floor drains for water seals. Smoke test plumbing penetrations.',
        controls:'Map odor intensity from suspected entry points.',
        standard:'OSHA H2S PEL: 20 ppm ceiling · NIOSH REL: 10 ppm (10 min)' })
    }
    // Data center: gaseous corrosion screening → coupon deployment
    if (d.zone_subtype === 'data_hall' && d.gaseous_corrosion && (d.gaseous_corrosion.includes('G2') || d.gaseous_corrosion.includes('G3') || d.gaseous_corrosion.includes('GX'))) {
      plan.push({ zone:zName, type:'Reactivity Coupon Deployment', priority:d.gaseous_corrosion.includes('G3')||d.gaseous_corrosion.includes('GX')?'critical':'high',
        hypothesis:'Screening indicators consistent with elevated gaseous corrosion risk — definitive G-class requires coupon data',
        method:'ANSI/ISA 71.04 copper + silver reactivity coupons. 30-day passive exposure. Minimum 3 locations: hot-aisle return, cold-aisle supply, intake plenum near OA damper.',
        controls:'Outdoor control coupon at OA intake. Document HVAC filter type and service date.',
        standard:'ANSI/ISA 71.04-2013 §5 · ASHRAE TC 9.9 Datacom Series Book 8' })
    }
    // Data center: elevated PM in data hall → particle counter deployment
    if (d.zone_subtype === 'data_hall' && d.pm && +d.pm > 10) {
      plan.push({ zone:zName, type:'ISO 14644-1 Particle Count', priority:'high',
        hypothesis:'PM2.5 mass ('+d.pm+' µg/m³) elevated vs typical MERV-filtered data hall (<10 µg/m³). ISO Class requires particle count data.',
        method:'Calibrated laser particle counter at ISO 14644-1 size thresholds (≥0.5 µm, ≥1 µm, ≥5 µm). Sampling locations and statistical handling per ISO 14644-1:2015 Annex B.',
        controls:'Minimum sample locations per ISO 14644-1 Table B.1. Document HVAC operating state during sampling.',
        standard:'ISO 14644-1:2015 · ASHRAE TC 9.9' })
    }
  })
  const outdoorGaps = []
  if (zones.some(z=>z.mi&&z.mi!=='None') && !plan.some(p=>p.controls?.includes('Outdoor control')))
    outdoorGaps.push('Bioaerosol outdoor control sample not yet planned — required for species comparison')
  if (zones.some(z=>z.pm) && !zones.some(z=>z.pmo))
    outdoorGaps.push('Outdoor PM2.5 not measured — needed to determine if indoor elevation is building-related or ambient')
  if (zones.some(z=>z.tv) && !zones.some(z=>z.tvo))
    outdoorGaps.push('Outdoor TVOC baseline not measured — cannot confirm indoor sources vs. ambient contribution')
  return { plan, outdoorGaps }
}