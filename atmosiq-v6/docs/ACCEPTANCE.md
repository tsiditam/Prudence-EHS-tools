# AtmosFlow Acceptance System

The acceptance system is a hard gate that prevents Claude Code sessions
(and human contributors) from self-certifying a change against ambiguous
prose. `scripts/acceptance-check.mjs` runs machine-checkable assertions
against the source tree — and, with the `api_boot` check, against the
runtime — and exits non-zero if any criterion fails.

## Why this exists

Earlier engine releases shipped after the conversational review claimed
completion, but later inspection revealed missed items. The acceptance
system makes "done" a binary signal: the runner exits 0 or it doesn't.

The September 2026 audit added a second lesson: 75 grep-and-file-exists
criteria were green while every API route reached through an
extension-less import returned 500 in production. Criteria that only
assert that expected strings exist measure intent, not behaviour; the
`api_boot` check type was added so at least one criterion executes the
runtime shape that failed.

## Running it

```sh
npm run accept:prod-ready       # scripts/acceptance/prod-ready.json (76 criteria)
npm run accept:go-live          # scripts/acceptance/go-live.json    (22)
npm run accept:pricing-rollout  # scripts/acceptance/pricing-rollout.json (19)
npm run accept:api-boot         # scripts/acceptance/api-boot.json   (1 — API-BOOT alone, for CI)
npm run accept:kg               # scripts/acceptance/kg.json
npm run accept:mold             # scripts/acceptance/mold.json
```

Or directly: `node scripts/acceptance-check.mjs --config <path> [--verbose]`.
With no `--config` the runner defaults to `scripts/acceptance/prod-ready.json`.
Exit codes: 0 all criteria passed, 1 at least one failed, 2 the runner
itself errored (bad config path, unparseable JSON, crash).

`prod-ready.json` and `go-live.json` run the full Vitest suite exactly
once, through `BUILD-02`. Until 2026-09 `prod-ready.json` ran it eight
times (seven feature criteria each carried their own `npm_script_passes:
test`), which is why the gate took ten minutes and timed out in the audit.
Feature criteria now assert the test files exist and leave execution to
`BUILD-02`.

CI (`.github/workflows/atmosflow-ci.yml`) runs `accept:api-boot` on every
PR as its own job and `accept:prod-ready` once the typecheck / lint /
test / build job is green.

## Configs

| Config | Script | Scope |
|---|---|---|
| `prod-ready.json` | `accept:prod-ready` | Group A — production readiness: build gates, billing, deletion, rate limits, offline sync, Jasper layers, Sentry, smoke test, engine guard-rails |
| `pricing-rollout.json` | `accept:pricing-rollout` | Group B — pricing rollout |
| `go-live.json` | `accept:go-live` | Group C — onboarding, landing page, email loops, account settings |
| `api-boot.json` | `accept:api-boot` | The `API-BOOT` criterion on its own |
| `kg.json`, `mold.json` | `accept:kg`, `accept:mold` | Knowledge-graph and mold-module feature gates |

The legacy `v2.X.json` engine configs referenced in older docs no longer
exist; engine-version checks live in the test suite.

## Adding a criterion

Edit the relevant config. Each entry has:

```json
{ "id": "STABLE-ID", "label": "Human-readable label", "checks": [
  { "type": "...", ... }
]}
```

Optional fields: `"_comment"` (why the criterion exists — encouraged),
`"skip": true` with `"skipReason"`.

Supported check types (`scripts/acceptance-check.mjs`):

- `file_exists` — `path` must exist, relative to the package root or absolute.
- `file_min_size` — `path` exists and is at least `minBytes` bytes.
- `grep_matches` — regex `pattern` appears in at least one of `paths`
  (files or directories, searched recursively); optional `minCount`.
- `grep_excludes` — `pattern` appears in none of `paths`. Fails, rather
  than passing vacuously, when none of the paths exist.
- `npm_script_passes` — `npm run <script>` exits 0.
- `constant_equals` — `export const <name> = '<value>'` in `path` equals `value`.
- `rendered_contains` / `rendered_excludes` — a rendered report at
  `reportPath` contains / does not contain the literal `needle`.
- `rendered_regex_count` — number of `regex` matches in `reportPath` is
  within `[min, max]`.
- `api_boot` — for every entry under `api/**` (recursive, `.js` and `.ts`,
  `_`-prefixed helpers excluded): bundle it with esbuild (`platform:
  node`, `format: esm`, `packages: external`), refuse any relative ESM
  import without a file extension at resolve time, dynamically import the
  output under plain Node, and assert the default export (`module.exports`
  for CJS entries) is a function. Implementation:
  `scripts/api-boot-check.mjs`; fixture tests:
  `tests/scripts/api-boot-check.test.ts`. Optional `entries` narrows the set.

Keep IDs stable and case-locked; the IDs appear in commit messages and
PR descriptions when criteria are added or retired.

## When a criterion fails

Read the failure line — it names the criterion ID and the reason.
- `pattern X matched 0 times; need >= 1` — the source change did not land
  in the expected file or the regex is wrong.
- `none of the paths exist` — the file a criterion watches was moved or
  deleted; re-point the criterion rather than deleting it.
- `N of M api entries failed to boot under plain Node` — the detail names
  each entry and the cause: an extension-less relative import (append
  `.js`; see CLAUDE.md pitfall #4), an unresolvable import, a module that
  throws at import time, or a default export that is not a function.
- `npm run test exited 1` — run `npm test` directly for the full output.

## Don't bypass it

If a criterion is genuinely wrong, change the JSON and explain why in
the commit. Do **not** comment-out checks, do not weaken thresholds
without explanation, and do not declare a task done while the runner
exits non-zero.
