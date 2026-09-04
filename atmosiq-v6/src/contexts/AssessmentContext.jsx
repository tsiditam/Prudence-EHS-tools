/**
 * AtmosFlow Assessment Context
 * Shared state for assessment data, scoring results, and operations.
 * Replaces 25+ useState hooks scattered in MobileApp.jsx.
 *
 * Two contexts behind one provider (audit 2026-09 §6 Navigation and state):
 *
 *   • AssessmentDataContext    — what is being EDITED: presurvey, building,
 *     zones, photos, equipment, question cursors, the field setters and the
 *     load / reset / score operations. Changes on every keystroke.
 *   • AssessmentResultsContext — what the engine PRODUCED: zone scores,
 *     composite, OSHA, recommendations, narrative, sampling plan, causal
 *     chains, mold, measurement confidence. Changes only when a scoring run
 *     or a report load lands.
 *
 * Typing into the walkthrough used to re-render every consumer because the
 * two lived in one memoised value. A results-only consumer now subscribes
 * with `useAssessmentResults()` and is untouched by data edits; a
 * data-only one uses `useAssessmentData()`. `useAssessment()` still returns
 * the merged object for the shell and for existing call sites.
 */

import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import STO from '../utils/storage'
import { scoreZone, summarizeAssessment, evalOSHA, genRecs, evalMeasurementConfidence, evalMold } from '../engines/scoring'
import { worstZoneIndex } from '../utils/assessmentVerdict'
import { resolveAssessmentDate } from '../utils/assessmentDate'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains } from '../engines/causalChains'

const AssessmentDataContext = createContext(null)
const AssessmentResultsContext = createContext(null)

export function AssessmentProvider({ children }) {
  // ── Assessment Data ──
  const [draftId, setDraftId] = useState(null)
  const [presurvey, setPresurvey] = useState({})
  const [bldg, setBldg] = useState({})
  const [zones, setZones] = useState([{}])
  const [curZone, setCurZoneState] = useState(0)
  const [photos, setPhotos] = useState({})
  // Per-zone "photo capture not feasible" overrides, keyed by zone name:
  // { [zoneName]: { reason } }. Lets a Critical/High photo blocker be
  // cleared with a documented justification instead of a photo.
  const [photoOverrides, setPhotoOverrides] = useState({})
  const [floorPlan, setFloorPlan] = useState(null)
  // HvacEquipment[] captured during the walkthrough. Drives
  // equipment-scoped recommendation grouping in genRecs (v2.8.0+).
  // Drafts that pre-date equipment capture load with [] and trigger
  // the unmapped-equipment fallback path on next engine run.
  const [equipment, setEquipment] = useState([])

  // ── Question Navigation ──
  const [qsqi, setQsqi] = useState(0)
  const [dqi, setDqi] = useState(0)
  const [zqi, setZqi] = useState(0)

  // ── Computed Results ──
  const [zoneScores, setZoneScores] = useState([])
  const [comp, setComp] = useState(null)
  const [oshaResult, setOshaResult] = useState(null)
  const [recs, setRecs] = useState(null)
  const [narrative, setNarrative] = useState(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [samplingPlan, setSamplingPlan] = useState(null)
  const [causalChains, setCausalChains] = useState([])
  const [moldResults, setMoldResults] = useState([])
  const [measConf, setMeasConf] = useState(null)

  // ── Merged Data (presurvey + building) ──
  const mergedData = useMemo(() => ({ ...presurvey, ...bldg }), [presurvey, bldg])
  const zData = useMemo(() => zones[curZone] || {}, [zones, curZone])

  // ── Field Setters ──
  const setQSField = useCallback((id, v) => {
    if (['fn','fl','ft','ht','sa','ba','rn','hm','fm','fc','od','dp','bld_pressure','bld_exhaust','bld_intake_proximity','wx_temp','wx_rh','wx_sky','wx_precip','wx_wind','wx_notes'].includes(id)) {
      setBldg(p => ({...p, [id]: v}))
    } else {
      setPresurvey(p => ({...p, [id]: v}))
    }
  }, [])

  // The active zone index lives in a ref as well as state so `setZF` is
  // stable and never writes to a stale zone: with `curZone` in its closure,
  // a setCurZone + setZF in the same tick (voice / Jasper actions do this)
  // wrote the value into the zone the user had just LEFT.
  const curZoneRef = useRef(curZone)
  curZoneRef.current = curZone
  // setCurZone updates the ref synchronously so a setZF in the same tick
  // already targets the new zone (React only commits the state later).
  const setCurZone = useCallback((v) => {
    const next = typeof v === 'function' ? v(curZoneRef.current) : v
    curZoneRef.current = next
    setCurZoneState(next)
  }, [])
  const setZF = useCallback((id, v) => {
    setZones(prev => {
      const zi = curZoneRef.current
      const z = [...prev]
      z[zi] = { ...(z[zi] || {}), [id]: v }
      return z
    })
  }, [])

  // ── Scoring Pipeline ──
  //
  // Pure with respect to the DATA state: it reads zones/bldg/equipment/
  // presurvey and writes only the results. It used to end with
  // `setZones(zonesWithOutdoor)` — a data write in the middle of a results
  // computation, which re-rendered every data consumer and, because the
  // outdoor fill is derived, put a computed value back into the record.
  // The filled zones are returned instead (`zones`) for callers that need
  // them; the stored zones keep only what the assessor entered.
  const runScoring = useCallback(() => {
    const outdoorFields = ['co2o', 'tfo', 'rho', 'pmo', 'tvo']
    const outdoorValues = {}
    outdoorFields.forEach(f => { const z = zones.find(z => z[f]); if (z) outdoorValues[f] = z[f] })
    const zonesWithOutdoor = zones.map(z => {
      const fill = {}
      outdoorFields.forEach(f => { if (!z[f] && outdoorValues[f]) fill[f] = outdoorValues[f] })
      return Object.keys(fill).length > 0 ? { ...z, ...fill } : z
    })
    // The survey date rides in on the building object (scoreZone reads
    // `assessmentDate`; see field-registry INJECTED_KEYS). Without it the
    // engine states a comfort-band data gap rather than guessing a season.
    // A draft has no `ts` in this context, so presurvey.ps_survey_date is
    // the only source; null → the engine reports the gap, which is the
    // correct answer for a draft with no survey date (CLAUDE.md pitfall #3).
    const surveyDate = resolveAssessmentDate({ presurvey })
    const scoringBldg = surveyDate ? { ...bldg, assessmentDate: surveyDate } : bldg
    const zScores = zonesWithOutdoor.map(z => scoreZone(z, scoringBldg))
    const composite = summarizeAssessment(zScores)
    // The zone carrying the worst finding. This used to re-run scoreZone
    // twice per comparison to find the LOWEST-SCORING zone — O(n²) calls
    // into the engine for a number that no longer exists.
    const worst = zonesWithOutdoor[worstZoneIndex(zScores)]
    const osha = evalOSHA({...bldg, ...worst})
    const recommendations = genRecs(zScores, bldg, { zones: zonesWithOutdoor, equipment })
    const sp = generateSamplingPlan(zonesWithOutdoor, bldg)
    const cc = buildCausalChains(zonesWithOutdoor, bldg, zScores)
    const mold = zonesWithOutdoor.map(z => evalMold(z)).filter(Boolean)
    const mc = evalMeasurementConfidence(zonesWithOutdoor)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setMoldResults(mold); setMeasConf(mc)
    return { zScores, composite, osha, recommendations, sp, cc, mold, mc, zones: zonesWithOutdoor }
  }, [zones, bldg, equipment, presurvey])

  // ── Reset Assessment ──
  const resetAssessment = useCallback(() => {
    setDraftId(null); setPresurvey({}); setBldg({}); setZones([{}]); setEquipment([])
    setCurZone(0); setPhotos({}); setPhotoOverrides({}); setFloorPlan(null)
    setQsqi(0); setDqi(0); setZqi(0)
    setZoneScores([]); setComp(null); setOshaResult(null); setRecs(null)
    setNarrative(null); setSamplingPlan(null); setCausalChains([]); setMoldResults([])
    setMeasConf(null)
  }, [])

  // ── Load Draft ──
  const loadDraft = useCallback(async (id) => {
    const d = await STO.get(id)
    if (!d) return false
    setDraftId(d.id)
    setPresurvey(d.presurvey || {})
    setBldg(d.bldg || d.building || {})
    setZones(d.zones || [{}])
    setEquipment(d.equipment || [])
    setPhotos(d.photos || {})
    setPhotoOverrides(d.photoOverrides || {})
    setFloorPlan(d.floorPlan || null)
    setQsqi(d.qsqi || 0)
    setDqi(d.dqi || 0)
    setCurZone(d.curZone || 0)
    setZqi(d.zqi || 0)
    return d
  }, [])

  // ── Load Report ──
  const loadReport = useCallback(async (id) => {
    const rpt = await STO.get(id)
    if (!rpt) return null
    setPresurvey(rpt.presurvey || {})
    setBldg(rpt.building || rpt.bldg || {})
    setZones(rpt.zones || [])
    setEquipment(rpt.equipment || [])
    setPhotos(rpt.photos || {})
    setPhotoOverrides(rpt.photoOverrides || {})
    setFloorPlan(rpt.floorPlan || null)
    setZoneScores(rpt.zoneScores || [])
    setComp(rpt.comp || rpt.composite)
    setOshaResult(rpt.oshaEvals?.[0] || rpt.osha || null)
    setRecs(rpt.recs || null)
    setSamplingPlan(rpt.samplingPlan || null)
    setCausalChains(rpt.causalChains || [])
    setNarrative(rpt.narrative || null)
    return rpt
  }, [])

  const dataValue = useMemo(() => ({
    // Assessment data
    draftId, setDraftId, presurvey, setPresurvey, bldg, setBldg,
    zones, setZones, curZone, setCurZone, photos, setPhotos,
    photoOverrides, setPhotoOverrides,
    floorPlan, setFloorPlan, mergedData, zData,
    equipment, setEquipment,
    // Question navigation
    qsqi, setQsqi, dqi, setDqi, zqi, setZqi,
    // Field setters
    setQSField, setZF,
    // Operations (runScoring depends on the data, so it lives here — a
    // results consumer that needs to trigger scoring takes it from
    // useAssessmentData without subscribing to results churn, and vice
    // versa)
    runScoring, resetAssessment, loadDraft, loadReport,
  }), [
    draftId, presurvey, bldg, zones, curZone, photos, photoOverrides, floorPlan, mergedData, zData, equipment,
    qsqi, dqi, zqi, setQSField, setZF,
    runScoring, resetAssessment, loadDraft, loadReport,
  ])

  const resultsValue = useMemo(() => ({
    zoneScores, setZoneScores, comp, setComp, oshaResult, setOshaResult,
    recs, setRecs, narrative, setNarrative, narrativeLoading, setNarrativeLoading,
    samplingPlan, setSamplingPlan, causalChains, setCausalChains,
    moldResults, setMoldResults, measConf, setMeasConf,
  }), [
    zoneScores, comp, oshaResult, recs, narrative, narrativeLoading,
    samplingPlan, causalChains, moldResults, measConf,
  ])

  return (
    <AssessmentDataContext.Provider value={dataValue}>
      <AssessmentResultsContext.Provider value={resultsValue}>
        {children}
      </AssessmentResultsContext.Provider>
    </AssessmentDataContext.Provider>
  )
}

/** Data being edited + operations. Does not re-render on scoring results. */
export function useAssessmentData() {
  const ctx = useContext(AssessmentDataContext)
  if (!ctx) throw new Error('useAssessmentData must be used within AssessmentProvider')
  return ctx
}

/** Engine results. Does not re-render while the assessor types. */
export function useAssessmentResults() {
  const ctx = useContext(AssessmentResultsContext)
  if (!ctx) throw new Error('useAssessmentResults must be used within AssessmentProvider')
  return ctx
}

/** Everything — the shell's view. Prefer the two selector hooks above in leaves. */
export function useAssessment() {
  const data = useContext(AssessmentDataContext)
  const results = useContext(AssessmentResultsContext)
  if (!data || !results) throw new Error('useAssessment must be used within AssessmentProvider')
  return useMemo(() => ({ ...data, ...results }), [data, results])
}

export default AssessmentDataContext
