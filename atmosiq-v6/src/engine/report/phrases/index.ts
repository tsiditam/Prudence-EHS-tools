/**
 * AtmosFlow Engine v2.1 — Phrase Library Barrel
 * Merges per-category phrase files into a single PHRASE_LIBRARY constant.
 * Every ConditionType must have an entry — enforced by tests.
 */

import type { ConditionType, PhraseLibraryEntry } from '../../types/domain'
import { VENTILATION_PHRASES } from './ventilation'
import { CONTAMINANTS_PHRASES } from './contaminants'
import { HVAC_PHRASES } from './hvac'
import { COMPLAINTS_PHRASES } from './complaints'
import { ENVIRONMENT_PHRASES } from './environment'

export const PHRASE_LIBRARY: Record<ConditionType, PhraseLibraryEntry> = {
  ...VENTILATION_PHRASES,
  ...CONTAMINANTS_PHRASES,
  ...HVAC_PHRASES,
  ...COMPLAINTS_PHRASES,
  ...ENVIRONMENT_PHRASES,
} as Record<ConditionType, PhraseLibraryEntry>

export function lookupPhrase(conditionType: ConditionType): PhraseLibraryEntry {
  const entry = PHRASE_LIBRARY[conditionType]
  if (!entry) {
    throw new Error(`No phrase library entry for conditionType '${conditionType}'. Every ConditionType must have an entry.`)
  }
  return entry
}
