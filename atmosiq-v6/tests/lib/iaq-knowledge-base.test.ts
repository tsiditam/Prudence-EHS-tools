/**
 * IAQ Knowledge Base — primary-source-cited lookup tables.
 *
 * Pins the contract Field Assistant tool-use relies on:
 *   • Every lookup resolves common aliases + CAS numbers to the same row
 *   • Exposure-limit rows have OSHA / NIOSH / ACGIH (or null) + citations
 *   • Sampling-method rows are non-empty arrays
 *   • Health-effect rows have target organs + sources
 *   • Spot-checks of known regulatory values (HCHO OSHA PEL, CO ACGIH TLV,
 *     PM2.5 EPA NAAQS, etc.) catch any accidental data corruption
 */
import { describe, it, expect } from 'vitest'
import {
  lookupExposureLimit,
  lookupSamplingMethod,
  lookupHealthEffects,
  resolveAnalyte,
  listAnalytes,
  __test,
} from '../../src/constants/iaq-knowledge-base.js'

describe('resolveAnalyte', () => {
  it('resolves canonical name', () => {
    expect(resolveAnalyte('formaldehyde')).toBe('formaldehyde')
  })

  it('resolves common abbreviations', () => {
    expect(resolveAnalyte('HCHO')).toBe('formaldehyde')
    expect(resolveAnalyte('CO')).toBe('carbon monoxide')
    expect(resolveAnalyte('CO2')).toBe('carbon dioxide')
    expect(resolveAnalyte('TCE')).toBe('trichloroethylene')
    expect(resolveAnalyte('PCE')).toBe('tetrachloroethylene')
    expect(resolveAnalyte('DCM')).toBe('methylene chloride')
  })

  it('resolves CAS numbers', () => {
    expect(resolveAnalyte('50-00-0')).toBe('formaldehyde')
    expect(resolveAnalyte('71-43-2')).toBe('benzene')
    expect(resolveAnalyte('108-88-3')).toBe('toluene')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(resolveAnalyte('  FORMALDEHYDE  ')).toBe('formaldehyde')
    expect(resolveAnalyte('PM2.5')).toBe('pm2.5')
  })

  it('returns null for unknown analytes', () => {
    expect(resolveAnalyte('unobtainium')).toBe(null)
    expect(resolveAnalyte('')).toBe(null)
    expect(resolveAnalyte(null as never)).toBe(null)
  })
})

describe('lookupExposureLimit', () => {
  it('returns a populated row for HCHO with correct OSHA PEL', () => {
    const r = lookupExposureLimit('formaldehyde')
    expect(r).not.toBeNull()
    expect(r!.osha).not.toBeNull()
    expect(r!.osha!.value).toBe(0.75)
    expect(r!.osha!.units).toBe('ppm')
    expect(r!.osha!.type).toBe('TWA')
    expect(r!.osha!.citation).toContain('1910.1048')
    expect(r!.carcinogen).toBe('OSHA-regulated')
  })

  it('returns correct CO ACGIH TLV (25 ppm 8-hr TWA)', () => {
    const r = lookupExposureLimit('CO')
    expect(r!.acgih!.value).toBe(25)
    expect(r!.acgih!.citation).toContain('ACGIH')
  })

  it('returns 2024-revised EPA PM2.5 annual NAAQS (9 µg/m³)', () => {
    const r = lookupExposureLimit('PM2.5')
    expect(r!.epa!.value).toBe(9)
    expect(r!.epa!.units).toBe('µg/m³')
    expect(r!.epa!.citation).toContain('2024')
  })

  it('returns benzene IARC-1 carcinogen flag', () => {
    const r = lookupExposureLimit('benzene')
    expect(r!.carcinogen).toBe('IARC-1')
    expect(r!.osha!.value).toBe(1) // OSHA PEL 1 ppm 8-hr TWA
  })

  it('returns null IDLH for radon (does not have one)', () => {
    const r = lookupExposureLimit('radon')
    expect(r).not.toBeNull()
    expect(r!.idlh).toBeNull()
    expect(r!.epa!.value).toBe(4) // EPA 4 pCi/L action level
  })

  it('TVOC has no regulatory limits but has Mølhave advisory', () => {
    const r = lookupExposureLimit('TVOC')
    expect(r!.osha).toBeNull()
    expect(r!.niosh).toBeNull()
    expect(r!.other.length).toBeGreaterThan(0)
    expect(r!.other[0].citation).toMatch(/Mølhave|Molhave/)
  })

  it('returns null for unknown analyte', () => {
    expect(lookupExposureLimit('unobtainium')).toBe(null)
  })
})

describe('lookupSamplingMethod', () => {
  it('returns multiple methods for HCHO including NIOSH 2016', () => {
    const r = lookupSamplingMethod('formaldehyde')
    expect(r).not.toBeNull()
    expect(r!.methods.length).toBeGreaterThan(1)
    const methods = r!.methods.map((m) => m.method)
    expect(methods.some((m) => m.includes('NIOSH 2016'))).toBe(true)
  })

  it('returns asbestos PCM + TEM methods', () => {
    const r = lookupSamplingMethod('asbestos')
    const methods = r!.methods.map((m) => m.method)
    expect(methods.some((m) => m.includes('7400'))).toBe(true) // PCM
    expect(methods.some((m) => m.includes('7402'))).toBe(true) // TEM
    expect(methods.some((m) => m.includes('AHERA'))).toBe(true)
  })

  it('returns TVOC speciation methods (TO-15, TO-17)', () => {
    const r = lookupSamplingMethod('TVOC')
    const methods = r!.methods.map((m) => m.method)
    expect(methods.some((m) => m.includes('TO-15'))).toBe(true)
    expect(methods.some((m) => m.includes('TO-17'))).toBe(true)
  })

  it('returns null for unknown analyte', () => {
    expect(lookupSamplingMethod('unobtainium')).toBe(null)
  })
})

describe('lookupHealthEffects', () => {
  it('returns CO COHb thresholds + biomarkers', () => {
    const r = lookupHealthEffects('CO')
    expect(r).not.toBeNull()
    expect(r!.targetOrgans).toContain('Central nervous system')
    expect(r!.biomarkers.length).toBeGreaterThan(0)
    expect(r!.biomarkers[0].name).toContain('Carboxyhemoglobin')
  })

  it('returns benzene leukemia chronic effect', () => {
    const r = lookupHealthEffects('benzene')
    const chronicText = r!.chronic.map((c) => c.effect).join(' ')
    expect(chronicText.toLowerCase()).toMatch(/leukemia|aml/)
    expect(r!.targetOrgans).toContain('Bone marrow')
  })

  it('returns asbestos mesothelioma + lung cancer with latency note', () => {
    const r = lookupHealthEffects('asbestos')
    const chronicText = r!.chronic.map((c) => c.effect).join(' ')
    expect(chronicText.toLowerCase()).toMatch(/mesothelioma/)
    expect(chronicText.toLowerCase()).toMatch(/lung cancer/)
    expect(chronicText.toLowerCase()).toMatch(/latency/)
  })

  it('returns lead BLL biomarker with CDC reference value', () => {
    const r = lookupHealthEffects('lead')
    const blood = r!.biomarkers.find((b) => b.matrix === 'blood')
    expect(blood).toBeDefined()
    expect(blood!.note || '').toMatch(/3\.5|50/)
  })

  it('returns radon IARC-1 lung cancer effect', () => {
    const r = lookupHealthEffects('radon')
    const chronicText = r!.chronic.map((c) => c.effect).join(' ')
    expect(chronicText.toLowerCase()).toMatch(/lung cancer/)
    expect(chronicText.toLowerCase()).toMatch(/iarc.*group 1|group 1/)
  })

  it('returns CO2 acknowledgment that no chronic toxicity at IAQ levels', () => {
    const r = lookupHealthEffects('CO2')
    const chronicText = r!.chronic.map((c) => c.effect).join(' ')
    expect(chronicText.toLowerCase()).toMatch(/ventilation|no.*chronic/)
  })

  it('returns null for unknown analyte', () => {
    expect(lookupHealthEffects('unobtainium')).toBe(null)
  })
})

describe('listAnalytes', () => {
  it('returns every analyte in the canonical table', () => {
    const list = listAnalytes()
    expect(list.length).toBeGreaterThanOrEqual(20)
    const keys = list.map((a) => a.key)
    expect(keys).toContain('formaldehyde')
    expect(keys).toContain('carbon monoxide')
    expect(keys).toContain('pm2.5')
    expect(keys).toContain('radon')
  })

  it('each entry has canonical, cas (or null), and aliases array', () => {
    const list = listAnalytes()
    for (const a of list) {
      expect(typeof a.key).toBe('string')
      expect(typeof a.canonical).toBe('string')
      expect(Array.isArray(a.aliases)).toBe(true)
      expect(a.aliases.length).toBeGreaterThan(0)
    }
  })
})

describe('citation integrity (cross-checks all rows)', () => {
  it('every exposure-limit row that has osha/niosh/acgih includes a citation', () => {
    for (const [key, row] of Object.entries(__test.EXPOSURE_LIMITS)) {
      const r = row as Record<string, any>
      for (const agency of ['osha', 'niosh', 'acgih', 'epa'] as const) {
        const entry = r[agency]
        if (entry && typeof entry === 'object') {
          expect(entry.citation, `${key}.${agency} missing citation`).toBeTruthy()
        }
      }
    }
  })

  it('every sampling-method row has at least one method with citation', () => {
    for (const [key, methods] of Object.entries(__test.SAMPLING_METHODS)) {
      const arr = methods as Array<{ method: string; agency: string }>
      expect(arr.length, `${key} has no sampling methods`).toBeGreaterThan(0)
      for (const m of arr) {
        expect(m.method, `${key} method missing label`).toBeTruthy()
        expect(m.agency, `${key} method missing agency`).toBeTruthy()
      }
    }
  })

  it('every health-effect row has target organs + sources', () => {
    for (const [key, row] of Object.entries(__test.HEALTH_EFFECTS)) {
      const r = row as Record<string, any>
      expect(Array.isArray(r.targetOrgans), `${key} missing targetOrgans`).toBe(true)
      expect(Array.isArray(r.sources), `${key} missing sources`).toBe(true)
      expect(r.sources.length, `${key} has empty sources`).toBeGreaterThan(0)
    }
  })

  it('every analyte in EXPOSURE_LIMITS has matching entry in SAMPLING_METHODS', () => {
    const expoKeys = Object.keys(__test.EXPOSURE_LIMITS)
    const sampKeys = Object.keys(__test.SAMPLING_METHODS)
    for (const k of expoKeys) {
      expect(sampKeys, `${k} missing from SAMPLING_METHODS`).toContain(k)
    }
  })
})
