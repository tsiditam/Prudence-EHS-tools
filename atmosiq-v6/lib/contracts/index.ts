/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Module-contract barrel — connectivity layer PR E.
 *
 * Re-exports every module's input / output contract so a single
 * `import` line documents the read surface of the connectivity layer:
 *
 *   import type {
 *     AnalyzePhotoResult, NarrativeOk,
 *     JasperTurnRequest, ReportRenderInput,
 *   } from '../../lib/contracts'
 *
 * Adding a new module contract: drop the file in this directory and
 * re-export here. The acceptance criterion `MODULE-CONTRACTS-DEFINED`
 * asserts each file exists.
 */

export * from './photo-analysis'
export * from './narrative'
export * from './report-render'
export * from './jasper-turn'
