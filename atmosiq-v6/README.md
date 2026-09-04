# AtmosFlow

Indoor air quality assessment engine and report renderer for
industrial hygienists and EHS professionals. Engine version:
**`atmosflow-engine-3.0.0`** — the single source of truth is
`ENGINE_VERSION` in [`src/version.js`](src/version.js) (exported as
`ENGINE_VERSION_TAG`); this line is copied from there and is not
authoritative.

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

// Diagnostic-reasoning passes (v2.6+) are populated automatically
console.log(result.causalChains.length)   // e.g. 2
console.log(result.hypotheses.length)     // e.g. 3

// Render the client-facing report
const clientReport = report.client(result)
// or the operator dashboard with full hypothesis + chain detail
const internalReport = report.internal(result)
```

`score(input)` is the public entry point (since v2.6). It composes the
legacy scoring pass, the v2.1 bridge mapping, the v2.6 causal-chain
engine, and the v2.6 hypothesis engine into a single
`AssessmentScore`. Existing callers of `legacyToAssessmentScore`
also receive populated `causalChains` and `hypotheses` arrays
because the bridge invokes both derivers internally.

## Architecture

See [`docs/REPORT_ARCHITECTURE.md`](docs/REPORT_ARCHITECTURE.md)
for the engine design, phrase library rules, conditional rendering
logic, and per-version notes (v2.1 onward; the composite score was
removed in v3.0 — see CHANGELOG.md).

See [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) for the acceptance
runner — the gate that prevents shipping a release that doesn't
meet its own spec.

## Running the test suite

Every command runs from `atmosiq-v6/` (this is a monorepo; see CLAUDE.md
"Session-learned pitfalls" #1). The scripts below are the ones defined
in `package.json`:

```sh
npm ci                        # install (Node 20 — see .nvmrc)
npm run typecheck             # tsc --noEmit -p tsconfig.check.json (api/, lib/, scripts/, components/, pages/, src/**/*.ts(x), typed tests)
npm run lint                  # lint:eslint (infra paths, zero warnings) + lint:src (src/ under a warning ratchet) + lint:imports
npm test                      # vitest run — unit + integration
npm run test:coverage         # vitest run --coverage (v8; thresholds in vite.config.js)
npm run build                 # vite build → dist/
npm run accept:api-boot       # bundle every api/** entry with esbuild and import it under plain Node
npm run accept:prod-ready     # production-readiness acceptance gate (runs the suite once via BUILD-02)
npm run accept:go-live        # go-live acceptance gate
npm run accept:pricing-rollout
```

Focused subsets: `npm run test:kg`, `npm run test:mold`, and the matching
`accept:kg` / `accept:mold` gates. `npm run bundle:api` and
`npm run check:env` belong to the container path (docs/CONTAINER.md);
`npm run db:migrate` / `db:migrate:status` to the migration runner
(docs/DATABASE_MIGRATIONS.md).

CI (`.github/workflows/atmosflow-ci.yml`) runs typecheck → lint → test →
build, `accept:api-boot` + `bundle:api`, and `accept:prod-ready` on every
pull request and push to `main` that touches `atmosiq-v6/`.

The acceptance gates are the source of truth for "ready to ship":
`scripts/acceptance-check.mjs` exits 0 only when every criterion in the
named config passes (see [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)).
