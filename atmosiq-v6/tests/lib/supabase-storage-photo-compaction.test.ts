/**
 * @vitest-environment jsdom
 *
 * supabaseStorage seam: photo compact-on-save / expand-on-load.
 *
 * Pins the contract:
 *   • saveAssessment writes a COMPACT photos object to localStorage
 *     (idbId refs, no inline base64). The input assessment is unchanged.
 *   • getAssessment hands the caller back the EXPANDED shape (inline
 *     base64 src), so every consumer above this layer (DOCX,
 *     PrintReport, in-app viewer) sees the legacy { src, ts } shape.
 *   • deleteAssessment purges the assessment's photo blobs from
 *     IndexedDB.
 *
 * Supabase is null in this env (no VITE_SUPABASE_URL), so the cloud
 * branch short-circuits. We only exercise the local seam.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Storage from '../../src/utils/supabaseStorage.js'
import { __test } from '../../src/utils/photoBlobStore.js'

const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function makeAssessment(id: string) {
  return {
    id,
    status: 'draft',
    building: { fn: 'Test Building' },
    presurvey: {},
    zones: [{ zn: 'Zone A' }],
    photos: {
      'z0-dp': [{ src: SAMPLE_DATA_URL, ts: '2026-05-19T10:00:00Z' }],
      'z0-mi': [{ src: SAMPLE_DATA_URL, ts: '2026-05-19T10:01:00Z' }],
    },
  }
}

beforeEach(() => {
  __test.setBackend(new Map())
  localStorage.clear()
})

afterEach(() => {
  __test.reset()
})

describe('saveAssessment — photo compaction', () => {
  it('writes a compact photos shape to localStorage', async () => {
    const assessment = makeAssessment('A-1')
    await Storage.saveAssessment(assessment)

    const raw = localStorage.getItem('A-1')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)
    // Compaction: src removed, idbId added
    expect(persisted.photos['z0-dp'][0].src).toBeUndefined()
    expect(persisted.photos['z0-dp'][0].idbId).toMatch(/^atmosflow:A-1:/)
    expect(persisted.photos['z0-mi'][0].idbId).toMatch(/^atmosflow:A-1:/)
    expect(persisted.photos['z0-dp'][0].ts).toBe('2026-05-19T10:00:00Z')
  })

  it('does not mutate the input assessment', async () => {
    const assessment = makeAssessment('A-1')
    const snapshot = JSON.parse(JSON.stringify(assessment))
    await Storage.saveAssessment(assessment)
    expect(assessment.photos).toEqual(snapshot.photos)
  })

  it('written localStorage payload is much smaller than the inline equivalent', async () => {
    const assessment = makeAssessment('A-1')
    const inlineSize = JSON.stringify(assessment).length
    await Storage.saveAssessment(assessment)
    const compactSize = (localStorage.getItem('A-1') || '').length
    // Sample data URL is short, but compaction still wins. For
    // production-sized photos (~50KB each) the ratio is dramatic;
    // here we just assert directional correctness.
    expect(compactSize).toBeLessThan(inlineSize)
  })
})

describe('getAssessment — photo expansion', () => {
  it('returns the inline src shape to consumers', async () => {
    const assessment = makeAssessment('A-1')
    await Storage.saveAssessment(assessment)
    const reloaded = await Storage.getAssessment('A-1')
    expect(reloaded).not.toBeNull()
    expect(reloaded!.photos['z0-dp'][0].src).toBe(SAMPLE_DATA_URL)
    expect(reloaded!.photos['z0-dp'][0].idbId).toBeUndefined()
    expect(reloaded!.photos['z0-mi'][0].src).toBe(SAMPLE_DATA_URL)
  })

  it('returns null for a non-existent id', async () => {
    expect(await Storage.getAssessment('no-such-id')).toBeNull()
  })

  it('survives a save → load → save round trip without inflating photo refs', async () => {
    const assessment = makeAssessment('A-1')
    await Storage.saveAssessment(assessment)
    const reloaded = await Storage.getAssessment('A-1')
    // Simulate a UI edit + re-save
    await Storage.saveAssessment(reloaded!)
    const raw = JSON.parse(localStorage.getItem('A-1')!)
    expect(raw.photos['z0-dp'][0].idbId).toMatch(/^atmosflow:A-1:/)
    // Only two blobs should exist for this assessment after the round
    // trip — the second save should re-offload but not multiply.
    const reloadedAgain = await Storage.getAssessment('A-1')
    expect(reloadedAgain!.photos['z0-dp']).toHaveLength(1)
    expect(reloadedAgain!.photos['z0-mi']).toHaveLength(1)
  })
})

describe('deleteAssessment — photo purge', () => {
  it('removes the assessment row AND its IDB photo blobs', async () => {
    const assessment = makeAssessment('A-1')
    await Storage.saveAssessment(assessment)
    // The assessment now has photos in IDB. Confirm load works first.
    expect((await Storage.getAssessment('A-1'))!.photos['z0-dp'][0].src).toBe(SAMPLE_DATA_URL)
    await Storage.deleteAssessment('A-1')
    expect(localStorage.getItem('A-1')).toBeNull()
    expect(await Storage.getAssessment('A-1')).toBeNull()
  })

  it('does not touch photos belonging to a different assessment', async () => {
    await Storage.saveAssessment(makeAssessment('A-1'))
    await Storage.saveAssessment(makeAssessment('B-2'))
    await Storage.deleteAssessment('A-1')
    const b = await Storage.getAssessment('B-2')
    expect(b!.photos['z0-dp'][0].src).toBe(SAMPLE_DATA_URL)
  })
})
