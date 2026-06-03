/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * State-limit overlay — applies stricter-than-federal state drinking-water
 * limits (NJ, CA, MA, VT, NH, MI) on top of the federal evaluation. Values
 * come from STATE_STDS in the hardcoded manifest; this never introduces a
 * threshold of its own. Surfaces state_exceedance findings the federal pass
 * may not flag (e.g. a state PFAS sum, or a state limit below the federal MCL).
 */

import { PARAM_MAP, STATE_STDS } from '../constants/standards.js'
import type { LabResult, StateExceedance } from '../types/engine'

// State keys that are program-level sums rather than single parameters.
const PFAS6 = ['pfoa', 'pfos', 'pfhxs', 'pfna', 'hfpoda', 'pfbs']
const PFAS5 = ['pfoa', 'pfos', 'pfhxs', 'pfna', 'hfpoda']

function federalRef(id: string): number | null {
  const p = PARAM_MAP[id]
  if (!p) return null
  if (typeof p.mcl === 'number') return p.mcl
  if (typeof p.al === 'number') return p.al
  return null
}

/**
 * @param results lab results [{ id, value, qualifier }]
 * @param stateCode two-letter code (e.g. 'NJ'); falsy returns []
 * @returns state exceedances for any parameter/sum over a state limit
 */
export function applyStateOverlay(results: LabResult[], stateCode?: string | null): StateExceedance[] {
  const code = (stateCode || '').trim().toUpperCase()
  const row: any = code ? (STATE_STDS as any)[code] : null
  if (!row) return []

  const values = new Map<string, number>()
  for (const r of results || []) {
    const v = parseFloat(r.value as string)
    if (!isNaN(v)) values.set(r.id, v)
  }

  const out: StateExceedance[] = []

  for (const [key, limitRaw] of Object.entries(row)) {
    if (key === 'label' || limitRaw == null || typeof limitRaw !== 'number') continue
    const limit = limitRaw as number

    // Program-level PFAS sums.
    if (key === 'pfas6_total' || key === 'pfas5_total') {
      const set = key === 'pfas6_total' ? PFAS6 : PFAS5
      const present = set.filter((id) => values.has(id))
      if (present.length === 0) continue
      const sum = present.reduce((acc, id) => acc + (values.get(id) as number), 0)
      if (sum > limit) {
        out.push({ state: code, program: row.label, parameter: key === 'pfas6_total' ? 'PFAS6 sum' : 'PFAS5 sum', value: Number(sum.toFixed(2)), stateLimit: limit, unit: 'ppt', stricterThanFederal: true })
      }
      continue
    }

    // Single-parameter state limit (only if we track that parameter).
    const p = PARAM_MAP[key]
    if (!p || !values.has(key)) continue
    const v = values.get(key) as number
    if (v > limit) {
      const fed = federalRef(key)
      out.push({ state: code, program: row.label, parameter: p.name, value: v, stateLimit: limit, unit: p.unit, stricterThanFederal: fed == null ? true : limit < fed })
    }
  }

  return out
}
