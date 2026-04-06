import { STD } from '../constants/standards'

export function scoreZone(z, bldg) {
  const d = { ...bldg, ...z }
  const cats = [scoreVent(d), scoreCont(d), scoreHVAC(d), scoreComp(d), scoreEnv(d)]
  const tot = cats.reduce((a, c) => a + c.s, 0)
  let risk, rc
  if (tot >= 85)      { risk = 'Low Risk';  rc = '#22D3EE' }
  else if (tot >= 70) { risk = 'Moderate';  rc = '#FBBF24' }
  else if (tot >= 50) { risk = 'High Risk'; rc = '#FB923C' }
  else                { risk = 'Critical';  rc = '#EF4444' }
  return { tot, risk, rc, cats, zoneName: z.zn || 'Zone' }
}

export function compositeScore(zoneScores) {
  if (!zoneScores.length) return null
  const avg   = Math.round(zoneScores.reduce((a, z) => a + z.tot, 0) / zoneScores.length)
  const worst = Math.min(...zoneScores.map(z => z.tot))
  const comp  = Math.round(avg * 0.6 + worst * 0.4)
  let risk, rc
  if (comp >= 85)      { risk = 'Low Risk';  rc = '#22D3EE' }
  else if (comp >= 70) { risk = 'Moderate';  rc = '#FBBF24' }
  else if (comp >= 50) { risk = 'High Risk'; rc = '#FB923C' }
  else                 { risk = 'Critical';  rc = '#EF4444' }
  return { tot: comp, avg, worst, risk, rc, count: zoneScores.length }
}

function scoreVent(d) {
  let s = 25, r = []
  if (d.co2) {
    const v = +d.co2, o = d.co2o ? +d.co2o : STD.v.co2.base, df = v - o
    if (v > STD.v.co2.act)                              { s = 0;  r.push({ t: 'CO2 ' + v + ' ppm — severely inadequate', std: STD.v.ref, sev: 'critical' }) }
    else if (df > STD.v.co2.diff || v > STD.v.co2.con) { s = 10; r.push({ t: 'CO2 ' + v + ' ppm — below standard', std: STD.v.ref, sev: 'high' }) }
    else if (v > 800)                                   { s = 20; r.push({ t: 'CO2 ' + v + ' ppm — approaching concern', std: STD.v.ref, sev: 'medium' }) }
    else r.push({ t: 'CO2 ' + v + ' ppm — good', std: STD.v.ref, sev: 'pass' })
  } else {
    let f = 0
    if (d.sa === 'No airflow detected') f += 3
    else if (d.sa === 'Weak / reduced') f += 2
    if (d.od === 'Closed / minimum' || d.od === 'Stuck / inoperable') f += 2
    if (d.cx === 'Yes — complaints reported' && (d.sy || []).some(s => ['Headache','Fatigue','Concentration issues'].includes(s))) f += 1
    if (f >= 4)      { s = 5;  r.push({ t: 'No CO2 — poor ventilation inferred', sev: 'high' }) }
    else if (f >= 2) { s = 12; r.push({ t: 'No CO2 — concern from indicators', sev: 'medium' }) }
    else if (f >= 1) { s = 18; r.push({ t: 'No CO2 — minor indicators', sev: 'low' }) }
    else r.push({ t: 'No CO2 — no concerns', sev: 'pass' })
  }
  return { s, mx: 25, l: 'Ventilation', r }
}

function scoreCont(d) {
  let dd = 0, r = []
  if (d.pm) {
    const v = +d.pm, ho = !!d.pmo
    if (v > STD.c.pm25.epa)      { dd += ho ? 12 : 8; r.push({ t: 'PM2.5 ' + v + ' — exceeds EPA' + (ho?'':' (no outdoor baseline)'), std:'EPA', sev:'high' }) }
    else if (v > STD.c.pm25.who) { dd += ho ? 6  : 4; r.push({ t: 'PM2.5 ' + v + ' — exceeds WHO' + (ho?'':' (no outdoor baseline)'), std:'WHO', sev:'medium' }) }
  }
  if (d.co) {
    const v = +d.co
    if (v > STD.c.co.osha)       { dd += 25; r.push({ t: 'CO ' + v + ' ppm — EXCEEDS OSHA PEL', std:'OSHA', sev:'critical' }) }
    else if (v > STD.c.co.niosh) { dd += 12; r.push({ t: 'CO ' + v + ' — exceeds NIOSH REL', std:'NIOSH', sev:'high' }) }
  }
  if (d.hc) {
    const v = +d.hc
    if (v > STD.c.hcho.osha)       { dd += 25; r.push({ t: 'HCHO ' + v + ' — EXCEEDS OSHA PEL', std:'OSHA', sev:'critical' }) }
    else if (v > STD.c.hcho.al)    { dd += 12; r.push({ t: 'HCHO ' + v + ' — above Action Level', std:'OSHA', sev:'high' }) }
    else if (v > STD.c.hcho.niosh) { dd += 6;  r.push({ t: 'HCHO ' + v + ' — above NIOSH REL', std:'NIOSH', sev:'medium' }) }
  }
  if (d.tv) {
    const v = +d.tv, ho = !!d.tvo
    if (v > STD.c.tvoc.act)      { dd += ho?15:10; r.push({ t:'TVOCs '+v+' — significantly elevated'+(ho?'':' (no outdoor baseline)'), sev:'high' }) }
    else if (v > STD.c.tvoc.con) { dd += ho?7:5;   r.push({ t:'TVOCs '+v+' — elevated'+(ho?'':' (no outdoor baseline)'), sev:'medium' }) }
  }
  if (d.mi && d.mi !== 'None') {
    const uc = ' ⚠ UNCONFIRMED — visual only, pending sampling'
    if (d.mi.includes('Extensive'))     { dd += 25; r.push({ t:'Extensive visible mold'+uc, std:'EPA/IICRC', sev:'critical' }) }
    else if (d.mi.includes('Moderate')) { dd += 15; r.push({ t:'Moderate visible mold'+uc, std:'EPA', sev:'high' }) }
    else if (d.mi.includes('Small'))    { dd += 8;  r.push({ t:'Small mold area'+uc, sev:'medium' }) }
    else                                { dd += 3;  r.push({ t:'Suspected discoloration'+uc, sev:'low' }) }
  }
  if (d.op === 'Strong / overpowering')    { dd += 10; r.push({ t:'Strong odor: '+((d.ot||[]).join(', ')||'?'), sev:'high' }) }
  else if (d.op === 'Moderate persistent') { dd += 5;  r.push({ t:'Moderate odor', sev:'medium' }) }
  if (d.vd === 'Airborne haze' || d.vd === 'Heavy accumulation') { dd += 5; r.push({ t:d.vd, sev:'medium' }) }
  if (!r.length) r.push({ t:'No contaminant concerns', sev:'pass' })
  return { s: Math.max(0, 25 - dd), mx: 25, l: 'Contaminants', r }
}

function scoreHVAC(d) {
  let s = 20, r = []
  if (d.hm === 'Within 6 months')     r.push({ t:'Maintained <6 mo', sev:'pass' })
  else if (d.hm === '6-12 months ago'){ s -= 5;  r.push({ t:'Maintenance 6-12 mo', sev:'low' }) }
  else if (d.hm === 'Over 12 months') { s -= 15; r.push({ t:'Maintenance >12 mo', sev:'high' }) }
  else if (d.hm === 'Unknown')        { s -= 20; r.push({ t:'Maintenance unknown', sev:'high' }) }
  if (d.fc === 'Heavily loaded' || d.fc === 'Damaged / Bypass') { s -= 5; r.push({ t:'Filter: '+d.fc, sev:'medium' }) }
  if (d.fm === 'No filter')           { s -= 8;  r.push({ t:'No filter', sev:'high' }) }
  if (d.sa === 'No airflow detected') { s -= 8;  r.push({ t:'No airflow', sev:'critical' }) }
  if (d.dp === 'Standing water' || d.dp === 'Bio growth observed') { s -= 5; r.push({ t:'Drain pan: '+d.dp, sev:'medium' }) }
  s = Math.max(0, s)
  if (!r.length) r = [{ t:'HVAC acceptable', sev:'pass' }]
  return { s, mx: 20, l: 'HVAC', r }
}

function scoreComp(d) {
  let s = 15, r = []
  if (d.cx !== 'Yes — complaints reported') { r.push({ t:'No complaints', sev:'pass' }); return { s, mx:15, l:'Complaints', r } }
  if (d.ac === 'More than 10' || d.ac === '6-10') { s = 0;  r.push({ t:d.ac+' affected', sev:'critical' }) }
  else if (d.ac === '3-5')                        { s = 5;  r.push({ t:'3-5 affected', sev:'high' }) }
  else                                            { s = 10; r.push({ t:'1-2 affected', sev:'medium' }) }
  if (d.sr === 'Yes — clear pattern') { s = Math.max(0, s-3); r.push({ t:'Resolves away from building', sev:'high' }) }
  if (d.cc === 'Yes — this zone') r.push({ t:'Clustered in this zone', sev:'medium' })
  if ((d.sy||[]).length) r.push({ t:'Symptoms: '+d.sy.join(', '), sev:'info' })
  return { s, mx: 15, l: 'Complaints', r }
}

function scoreEnv(d) {
  let dd = 0, r = []
  const ssn = new Date().getMonth() >= 4 && new Date().getMonth() <= 9 ? 'summer' : 'winter'
  if (d.tf) {
    const t = +d.tf, rng = STD.t.temp[ssn]
    if (t < rng.min || t > rng.max)        { dd += 5; r.push({ t:'Temp '+t+'°F — outside ASHRAE 55', std:STD.t.ref, sev:'high' }) }
    else if (t < rng.oMin || t > rng.oMax) { dd += 2; r.push({ t:'Temp '+t+'°F — outside optimal', std:STD.t.ref, sev:'low' }) }
  } else if (d.tc === 'Too hot' || d.tc === 'Too cold') { dd += 4; r.push({ t:'Occupants: '+d.tc, sev:'medium' }) }
  if (d.rh) {
    const v = +d.rh
    if (v < STD.t.rh.min || v > STD.t.rh.max) { dd += 4; r.push({ t:'RH '+v+'% — outside range', std:STD.t.ref, sev:v>70||v<20?'high':'medium' }) }
  } else if (d.hp === 'Too humid / stuffy' || d.hp === 'Too dry') { dd += 3; r.push({ t:'Humidity: '+d.hp, sev:'medium' }) }
  if (d.wd === 'Extensive damage')  { dd += 15; r.push({ t:'Extensive water damage', sev:'critical' }) }
  else if (d.wd === 'Active leak')  { dd += 10; r.push({ t:'Active water intrusion', sev:'high' }) }
  else if (d.wd === 'Old staining') { dd += 3;  r.push({ t:'Historical staining', sev:'low' }) }
  if (!r.length) r.push({ t:'Environment OK', sev:'pass' })
  return { s: Math.max(0, 15-dd), mx: 15, l: 'Environment', r }
}

export function evalOSHA(d, tot) {
  const fl = []
  if (d.cx === 'Yes — complaints reported' && tot < 70) fl.push('Documented complaints + hazard indicators')
  if (d.co2 && +d.co2 > STD.v.co2.con)  fl.push('Ventilation deficiency')
  if (d.wd === 'Active leak' || d.wd === 'Extensive damage' || (d.mi && !['None','Suspected discoloration'].includes(d.mi))) fl.push('Water/mold indicators')
  if (d.sr === 'Yes — clear pattern' && (d.ac === 'More than 10' || d.ac === '6-10')) fl.push('Building-related symptoms — widespread')
  if (d.co && +d.co > STD.c.co.osha)   fl.push('CO exceeds OSHA PEL')
  if (d.hc && +d.hc > STD.c.hcho.osha) fl.push('HCHO exceeds OSHA PEL')
  const hs = !!d.co2 || !!d.tf, hc = d.cx === 'Yes — complaints reported', hk = d.hm !== 'Unknown'
  const conf = (hs&&hc&&hk)?'High':[hs,hc,hk].filter(Boolean).length>=2?'Medium':'Limited'
  const gaps = []
  if (!hs) gaps.push('No instrument data')
  if (!hk) gaps.push('HVAC maintenance unknown')
  return { flag: fl.length > 0, fl, conf, gaps }
}

export function calcVent(su, sf, oc) {
  if (!su || !sf || !oc) return null
  const r = STD.v.oa[su]; if (!r) return null
  const pOA = r.pp * oc, aOA = r.ps * sf, tot = pOA + aOA
  return { pOA, aOA, tot, pp: tot / oc, ref: STD.v.ref }
}

export function genRecs(zoneScores, bldg) {
  const R = { imm: [], eng: [], adm: [], mon: [] }
  zoneScores.forEach(zs => {
    zs.cats.forEach(c => c.r.forEach(r => {
      if (r.sev === 'critical') {
        if (r.t.includes('CO '))   R.imm.push(zs.zoneName+': Evacuate. Investigate combustion source.')
        if (r.t.includes('HCHO'))  R.imm.push(zs.zoneName+': Exposure controls + medical surveillance.')
        if (r.t.toLowerCase().includes('mold') && r.t.includes('xtensive')) R.imm.push(zs.zoneName+': Remediation per EPA/IICRC S520.')
        if (r.t.includes('No airflow')) R.imm.push('Emergency HVAC service.')
        if (r.t.includes('water'))      R.imm.push(zs.zoneName+': Address water intrusion.')
      }
      if (r.sev === 'high') {
        if (r.t.includes('CO2') || r.t.includes('ventilation')) R.eng.push(zs.zoneName+': Evaluate OA delivery. Verify damper.')
        if (r.t.includes('PM'))         R.eng.push('Upgrade filtration to MERV 13+.')
        if (r.t.includes('aintenance')) R.eng.push('Schedule HVAC inspection.')
        if (r.t.includes('mold'))       R.eng.push(zs.zoneName+': Mold assessment per AIHA.')
        if (r.t.includes('affect'))     R.adm.push(zs.zoneName+': Document occupants. Symptom survey.')
      }
    }))
  })
  if (bldg.hm === 'Unknown') R.adm.push('Establish HVAC PM schedule.')
  R.mon.push('Periodic reassessment recommended.')
  Object.keys(R).forEach(k => { R[k] = [...new Set(R[k])] })
  return R
}