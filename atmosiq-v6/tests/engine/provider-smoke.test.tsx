/**
 * Phase 4 smoke test — verify the provider chain mounts without runtime
 * errors and that the context hooks resolve to the expected surface.
 *
 * Vitest's default env is node; we use react-dom/server to render the
 * provider tree synchronously. A consumer component calls each hook and
 * asserts the destructuring shape matches what MobileApp reads.
 */
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AssessmentProvider, useAssessment } from '../../src/contexts/AssessmentContext.jsx'
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext.jsx'
import { StorageProvider, useStorage } from '../../src/contexts/StorageContext.jsx'

// MobileApp expects these specific keys from each hook. Asserting their
// presence here catches drift between the contexts and consumer code.
const ASSESSMENT_KEYS = [
  'draftId', 'setDraftId', 'presurvey', 'setPresurvey', 'bldg', 'setBldg',
  'qsqi', 'setQsqi', 'dqi', 'setDqi', 'zqi', 'setZqi',
  'zones', 'setZones', 'curZone', 'setCurZone',
  'photos', 'setPhotos', 'floorPlan', 'setFloorPlan',
  'zoneScores', 'setZoneScores', 'comp', 'setComp',
  'oshaResult', 'setOshaResult', 'recs', 'setRecs',
  'narrative', 'setNarrative', 'narrativeLoading', 'setNarrativeLoading',
  'samplingPlan', 'setSamplingPlan', 'causalChains', 'setCausalChains',
  'moldResults', 'setMoldResults', 'measConf', 'setMeasConf',
]
const AUTH_KEYS = ['profile', 'setProfile', 'credits', 'setCredits', 'adminSecret', 'setAdminSecret']
const STORAGE_KEYS = ['index', 'refreshIndex']

function Probe(): React.ReactElement {
  const a = useAssessment()
  const u = useAuth()
  const s = useStorage()
  const aMissing = ASSESSMENT_KEYS.filter(k => !(k in a))
  const uMissing = AUTH_KEYS.filter(k => !(k in u))
  const sMissing = STORAGE_KEYS.filter(k => !(k in s))
  return (
    <div data-test="probe">
      <span data-test="a-missing">{aMissing.join(',')}</span>
      <span data-test="u-missing">{uMissing.join(',')}</span>
      <span data-test="s-missing">{sMissing.join(',')}</span>
      <span data-test="zones-init">{a.zones.length}</span>
      <span data-test="qsqi-init">{a.qsqi}</span>
      <span data-test="comp-init">{a.comp === null ? 'null' : 'set'}</span>
      <span data-test="profile-init">{u.profile === null ? 'null' : 'set'}</span>
      <span data-test="credits-init">{u.credits}</span>
      <span data-test="index-shape">{Array.isArray(s.index.reports) && Array.isArray(s.index.drafts) ? 'ok' : 'bad'}</span>
    </div>
  )
}

function Tree() {
  return (
    <AuthProvider>
      <StorageProvider>
        <AssessmentProvider>
          <Probe />
        </AssessmentProvider>
      </StorageProvider>
    </AuthProvider>
  )
}

describe('Phase 4 provider smoke', () => {
  it('Provider tree renders without throwing (proves no runtime import / context errors)', () => {
    expect(() => renderToString(<Tree />)).not.toThrow()
  })

  it('Each hook exposes the keys MobileApp.jsx destructures', () => {
    const html = renderToString(<Tree />)
    expect(html).toContain('data-test="a-missing">')
    // Extract each missing-keys span and assert it's empty.
    const aMissing = (/data-test="a-missing">([^<]*)</.exec(html) ?? [])[1]
    const uMissing = (/data-test="u-missing">([^<]*)</.exec(html) ?? [])[1]
    const sMissing = (/data-test="s-missing">([^<]*)</.exec(html) ?? [])[1]
    expect(aMissing).toBe('')
    expect(uMissing).toBe('')
    expect(sMissing).toBe('')
  })

  it('Initial state values match MobileApp expectations', () => {
    const html = renderToString(<Tree />)
    const get = (k: string) => (new RegExp(`data-test="${k}">([^<]*)<`).exec(html) ?? [])[1]
    expect(get('zones-init')).toBe('1') // [{}]
    expect(get('qsqi-init')).toBe('0')
    expect(get('comp-init')).toBe('null')
    expect(get('profile-init')).toBe('null')
    expect(get('credits-init')).toBe('5')
    expect(get('index-shape')).toBe('ok')
  })

  it('Hooks throw outside their provider', () => {
    function NoProvider() {
      useAssessment()
      return null
    }
    expect(() => renderToString(<NoProvider />)).toThrow(/AssessmentProvider/)
  })
})
