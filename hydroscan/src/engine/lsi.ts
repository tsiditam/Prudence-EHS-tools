/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Langelier Saturation Index (LSI) — a calcium-carbonate saturation indicator
 * used to characterize whether water is corrosive (scale-dissolving, which
 * promotes lead/copper leaching) or scale-forming. Standard formulation:
 *
 *   LSI = pH − pHs
 *   pHs = (9.3 + A + B) − (C + D)
 *     A = (log10(TDS) − 1) / 10
 *     B = −13.12 · log10(T_K) + 34.55          (T_K = °C + 273.15)
 *     C = log10(Ca hardness as CaCO3) − 0.4
 *     D = log10(total alkalinity as CaCO3)
 *
 * Screening only — strengthens the corrosion causal chain when the inputs are
 * available; it does not replace a corrosion-control study. Returns null when
 * any required input is missing (we never fabricate a value to force a result).
 */

export interface LSIInputs {
  ph: number
  tds: number          // mg/L
  tempC: number        // °C
  calciumHardness: number // mg/L as CaCO3 (total hardness accepted as a proxy)
  alkalinity: number   // mg/L as CaCO3
}

export interface LSIResult {
  lsi: number
  phs: number
  corrosive: boolean
  interpretation: string
}

function isPos(n: unknown): n is number {
  return typeof n === 'number' && isFinite(n) && n > 0
}

export function computeLSI(input: Partial<LSIInputs>): LSIResult | null {
  const { ph, tds, tempC, calciumHardness, alkalinity } = input
  if (!isPos(ph) || !isPos(tds) || typeof tempC !== 'number' || !isPos(calciumHardness) || !isPos(alkalinity)) {
    return null
  }
  const tK = tempC + 273.15
  if (tK <= 0) return null

  const A = (Math.log10(tds) - 1) / 10
  const B = -13.12 * Math.log10(tK) + 34.55
  const C = Math.log10(calciumHardness) - 0.4
  const D = Math.log10(alkalinity)
  const phs = 9.3 + A + B - (C + D)
  const lsi = ph - phs

  let interpretation: string
  if (lsi <= -0.5) interpretation = `LSI ${lsi.toFixed(2)} — corrosive / undersaturated; water tends to dissolve protective scale and can leach lead and copper from plumbing.`
  else if (lsi < 0) interpretation = `LSI ${lsi.toFixed(2)} — mildly corrosive; slightly undersaturated with calcium carbonate.`
  else if (lsi <= 0.5) interpretation = `LSI ${lsi.toFixed(2)} — near balanced (close to calcium-carbonate equilibrium).`
  else interpretation = `LSI ${lsi.toFixed(2)} — scale-forming; supersaturated with calcium carbonate.`

  return { lsi: Number(lsi.toFixed(2)), phs: Number(phs.toFixed(2)), corrosive: lsi < 0, interpretation }
}
