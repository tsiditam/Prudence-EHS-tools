# AtmosFlow Acceptance System

The acceptance system is a hard gate that prevents Claude Code sessions
(and human contributors) from self-certifying a release against
ambiguous prose. It runs concrete, machine-checkable assertions against
both the source tree and a freshly rendered fixture report, and exits
non-zero if any criterion fails.

## Why this exists

Earlier engine releases (v2.1 → v2.3) shipped after the conversational
review claimed completion, but later inspection revealed missed items
(parameter prose unwired, footer leak, mid-word truncation, finding
duplication). The acceptance system makes "done" a binary signal:
`npm run accept:v2.4` exits 0 or it doesn't.

## Running it

```sh
npm run accept:v2.4
```

This is composed of two scripts:

1. `npm run render:acceptance` — renders two `.docx` fixture reports
   and extracts each to a side-by-side `.txt` file via JSZip. The
   fixtures live at `/tmp/acceptance-report.docx[.txt]` (canonical
   3-zone Hizinburg-style commercial fixture with HVAC findings and
   sick-building pattern) and `/tmp/acceptance-report-no-building.docx
   [.txt]` (zone-only, no HVAC findings).
2. `node scripts/acceptance-check.mjs --config scripts/acceptance/v2.4.json`
   — runs the JSON-driven acceptance criteria against the source tree
   and the rendered fixtures.

If you only changed source files but did not yet re-render, the runner
will still pass `npm run render:acceptance` first to keep the fixtures
in sync.

## Adding a criterion

Edit `scripts/acceptance/v2.4.json`. Each entry has:

```json
{ "id": "STABLE-ID", "label": "Human-readable label", "checks": [
  { "type": "...", ... }
]}
```

Supported check types:

- `file_exists` — `path` must exist relative to repo root, or absolute.
- `file_min_size` — `path` exists and is at least `minBytes` bytes.
- `grep_matches` — `pattern` must appear in `paths` (regex).
- `grep_excludes` — `pattern` must NOT appear in `paths`.
- `npm_script_passes` — `script` exits 0 (e.g. `typecheck`).
- `rendered_contains` — `reportPath` must contain literal `needle`.
- `rendered_excludes` — `reportPath` must NOT contain `needle`.
- `rendered_regex_count` — match count of `regex` in `reportPath` is
  within `[min, max]` bounds.
- `constant_equals` — `pattern` (regex with one capture group) in
  `path` must equal `value`.

Keep IDs stable and case-locked; the IDs appear in commit messages and
PR descriptions when criteria are added or retired.

## When a criterion fails

Read the failure line — it names the criterion ID and the reason.
- `pattern X matched 0 times; need >= 1` — the source change did not land
  in the expected file or the regex is wrong.
- `rendered report missing required string: "X"` — the renderer did not
  emit the needle. Re-render fixtures (`npm run render:acceptance`) to
  rule out a stale `.txt`, then dig into the renderer.
- `regex matched N; need <= M` — duplication. Add or tighten dedup at
  the engine layer, not at the renderer (renderers are dumb formatters).

## Don't bypass it

If a criterion is genuinely wrong, change the JSON and explain why in
the commit. Do **not** comment-out checks, do not weaken thresholds
without explanation, and do not run the renderer once and then ship
without re-running the acceptance check after a code change.
