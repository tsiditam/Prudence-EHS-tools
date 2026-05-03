/**
 * AtmosFlow Assessment Context
 * Shared state for assessment data, scoring results, and operations.
 * Replaces 25+ useState hooks scattered in MobileApp.jsx.
 */

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import STO from '../utils/storage'
import { scoreZone, compositeScore, evalOSHA, genRecs, evalMeasurementConfidence, evalMold } from '../engines/scoring'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains } from '../engines/causalChains'
import { STANDARDS_MANIFEST } from '../constants/standards'
import { Q_QUICKSTART, Q_BUILDING, Q_ZONE, Q_DETAILS } from '../constants/questions'

const AssessmentContext = createContext(null)

export function AssessmentProvider({ children }) {
  // ── Assessment Data ──
  const [draftId, setDraftId] = useState(null)
  const [presurvey, setPresurvey] = useState({})
  const [bldg, setBldg] = useState({})
  const [zones, setZones] = useState([{}])
  const [curZone, setCurZone] = useState(0)
  const [photos, setPhotos] = useState({})
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

  const setZF = useCallback((id, v) => {
    setZones(prev => {
      const z = [...prev]
      z[curZone] = { ...z[curZone], [id]: v }
      return z
    })
  }, [curZone])

  // ── Scoring Pipeline ──
  const runScoring = useCallback(() => {
    const outdoorFields = ['co2o', 'tfo', 'rho', 'pmo', 'tvo']
    const outdoorValues = {}
    outdoorFields.forEach(f => { const z = zones.find(z => z[f]); if (z) outdoorValues[f] = z[f] })
    const zonesWithOutdoor = zones.map(z => {
      const fill = {}
      outdoorFields.forEach(f => { if (!z[f] && outdoorValues[f]) fill[f] = outdoorValues[f] })
      return Object.keys(fill).length > 0 ? { ...z, ...fill } : z
    })
    const zScores = zonesWithOutdoor.map(z => scoreZone(z, bldg))
    const composite = compositeScore(zScores)
    const worst = zonesWithOutdoor.reduce((w, z) => (!w || scoreZone(z, bldg).tot < scoreZone(w, bldg).tot) ? z : w, zonesWithOutdoor[0])
    const osha = evalOSHA({...bldg, ...worst}, composite?.tot || 0)
    const recommendations = genRecs(zScores, bldg, { zones: zonesWithOutdoor, equipment })
    const sp = generateSamplingPlan(zonesWithOutdoor, bldg)
    const cc = buildCausalChains(zonesWithOutdoor, bldg, zScores)
    const mold = zonesWithOutdoor.map(z => evalMold(z)).filter(Boolean)
    const mc = evalMeasurementConfidence(zonesWithOutdoor)
    setZones(zonesWithOutdoor)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setMoldResults(mold); setMeasConf(mc)
    return { zScores, composite, osha, recommendations, sp, cc, mold, mc }
  }, [zones, bldg, equipment])

  // ── Reset Assessment ──
  const resetAssessment = useCallback(() => {
    setDraftId(null); setPresurvey({}); setBldg({}); setZones([{}]); setEquipment([])
    setCurZone(0); setPhotos({}); setFloorPlan(null)
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

  const value = useMemo(() => ({
    // Assessment data
    draftId, setDraftId, presurvey, setPresurvey, bldg, setBldg,
    zones, setZones, curZone, setCurZone, photos, setPhotos,
    floorPlan, setFloorPlan, mergedData, zData,
    equipment, setEquipment,
    // Question navigation
    qsqi, setQsqi, dqi, setDqi, zqi, setZqi,
    // Field setters
    setQSField, setZF,
    // Results
    zoneScores, setZoneScores, comp, setComp, oshaResult, setOshaResult,
    recs, setRecs, narrative, setNarrative, narrativeLoading, setNarrativeLoading,
    samplingPlan, setSamplingPlan, causalChains, setCausalChains,
    moldResults, setMoldResults, measConf, setMeasConf,
    // Operations
    runScoring, resetAssessment, loadDraft, loadReport,
  }), [
    draftId, presurvey, bldg, zones, curZone, photos, floorPlan, mergedData, zData, equipment,
    qsqi, dqi, zqi, setQSField, setZF,
    zoneScores, comp, oshaResult, recs, narrative, narrativeLoading,
    samplingPlan, causalChains, moldResults, measConf,
    runScoring, resetAssessment, loadDraft, loadReport,
  ])

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>
}

export function useAssessment() {
  const ctx = useContext(AssessmentContext)
  if (!ctx) throw new Error('useAssessment must be used within AssessmentProvider')
  return ctx
}

export default AssessmentContext
