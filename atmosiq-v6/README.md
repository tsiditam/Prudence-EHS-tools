# AtmosFlow

CIH-defensible indoor air quality assessment engine and report
renderer. Engine version: **`atmosflow-engine-2.6.0`**.

## Quickstart — programmatic engine

```ts
import { score, report } from './src/engine'

const result = score({
  meta: { /* AssessmentMeta */ },
  zonesData: [
    { zn: 'Data Hall A', zone_subtype: 'data_hall',
      co2: '1180', co2o: '420', tf: '74', rh: '52', pm: '12',
      sy: ['Headache'], gaseous_corrosion: 'G2 (moderate)' },
  ],
  buildingData: { hm: 'Over 12 months', fc: 'Heavily loaded' },
})

// v2.6 — diagnostic-reasoning passes are populated automatically
console.log(result.causalChains.length)   // e.g. 2
console.log(result.hypotheses.length)     // e.g. 3

// Render the client-facing report
const clientReport = report.client(result)
// or the operator dashboard with full hypothesis + chain detail
const internalReport = report.internal(result)
```

`score(input)` is the v2.6 public entry point. It composes the
legacy scoring pass, the v2.1 bridge mapping, the v2.6 causal-chain
engine, and the v2.6 hypothesis engine into a single
`AssessmentScore`. Existing callers of `legacyToAssessmentScore`
also receive populated `causalChains` and `hypotheses` arrays
because the bridge invokes both derivers internally.

## Architecture

See [`docs/REPORT_ARCHITECTURE.md`](docs/REPORT_ARCHITECTURE.md)
for the engine design, phrase library rules, conditional rendering
logic, and per-version notes (v2.1 through v2.6).

See [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) for the acceptance
runner — the gate that prevents shipping a release that doesn't
meet its own spec.

## Running the test suite

```sh
npm run typecheck       # tsc --noEmit
npm test                # vitest run (unit + integration)
npm run accept:v2.6     # full acceptance gate (49 baseline + 8 v2.6 criteria)
```

The acceptance gate is the single source of truth for "ready to
ship". `npm run accept:v2.6` exits 0 only when every criterion in
`scripts/acceptance/v2.6.json` passes against a freshly rendered
canonical fixture.
