/**
 * AtmosFlow Assessment Context
 * Shared state for assessment data, scoring results, and operations.
 * Replaces 25+ useState hooks scattered in MobileApp.jsx.
 */

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react'
import type { ZoneData, BuildingData, PresurveyData, ZoneScore, CompositeScore, OSHAResult, Recommendations, SamplingPlan, CausalChain, MoldResult, MeasurementConfidence, PhotoEntry } from '../types/assessment'
import STO from '../utils/storage'
import { scoreZone, compositeScore, evalOSHA, genRecs, evalMeasurementConfidence, evalMold } from '../engines/scoring'
import { generateSamplingPlan } from '../engines/sampling'
import { buildCausalChains } from '../engines/causalChains'
import { STANDARDS_MANIFEST } from '../constants/standards'
import { Q_QUICKSTART, Q_BUILDING, Q_ZONE, Q_DETAILS } from '../constants/questions'

const AssessmentContext = createContext<any>(null)

export function AssessmentProvider({ children }: { children: ReactNode }) {
  // ── Assessment Data ──
  const [draftId, setDraftId] = useState<string | null>(null)
  const [presurvey, setPresurvey] = useState<PresurveyData>({})
  const [bldg, setBldg] = useState<BuildingData>({})
  const [zones, setZones] = useState<ZoneData[]>([{}])
  const [curZone, setCurZone] = useState<number>(0)
  const [photos, setPhotos] = useState<Record<string, PhotoEntry[]>>({})
  const [floorPlan, setFloorPlan] = useState<string | null>(null)

  // ── Question Navigation ──
  const [qsqi, setQsqi] = useState<number>(0)
  const [dqi, setDqi] = useState<number>(0)
  const [zqi, setZqi] = useState<number>(0)

  // ── Computed Results ──
  const [zoneScores, setZoneScores] = useState<ZoneScore[]>([])
  const [comp, setComp] = useState<CompositeScore | null>(null)
  const [oshaResult, setOshaResult] = useState<OSHAResult | null>(null)
  const [recs, setRecs] = useState<Recommendations | null>(null)
  const [narrative, setNarrative] = useState<string | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState<boolean>(false)
  const [samplingPlan, setSamplingPlan] = useState<SamplingPlan | null>(null)
  const [causalChains, setCausalChains] = useState<CausalChain[]>([])
  const [moldResults, setMoldResults] = useState<MoldResult[]>([])
  const [measConf, setMeasConf] = useState<MeasurementConfidence | null>(null)

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
    const recommendations = genRecs(zScores, bldg)
    const sp = generateSamplingPlan(zonesWithOutdoor, bldg)
    const cc = buildCausalChains(zonesWithOutdoor, bldg, zScores)
    const mold = zonesWithOutdoor.map(z => evalMold(z)).filter(Boolean)
    const mc = evalMeasurementConfidence(zonesWithOutdoor)
    setZones(zonesWithOutdoor)
    setZoneScores(zScores); setComp(composite); setOshaResult(osha); setRecs(recommendations)
    setSamplingPlan(sp); setCausalChains(cc); setMoldResults(mold); setMeasConf(mc)
    return { zScores, composite, osha, recommendations, sp, cc, mold, mc }
  }, [zones, bldg])

  // ── Reset Assessment ──
  const resetAssessment = useCallback(() => {
    setDraftId(null); setPresurvey({}); setBldg({}); setZones([{}])
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
    draftId, presurvey, bldg, zones, curZone, photos, floorPlan, mergedData, zData,
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
