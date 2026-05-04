# Stacked PR runbook

How to land a chain of dependent PRs on `main` without orphaning the
top of the stack — and how to recover when it happens anyway.

## The hazard

When PR-B is opened with `base = some-feature-branch` (the head of
PR-A) instead of `main`, the dependency works *only* if PR-A is
merged with a rebase or merge-commit strategy. **A squash merge of
PR-A creates a new commit SHA on `main`, leaving PR-B's parent SHA
abandoned.** GitHub will then mark PR-B as "merged" once it lands on
its sibling base, but the commits never reach `main`.

Concrete incident this runbook codifies:

- 2026-05-03 17:35 UTC — PR #139 squash-merged into `main`
- 2026-05-03 23:23 UTC — PR #141 (stacked on `claude/home-settings-ui-pass`) merged into its base. Its single commit `50c34f10` lived only on `origin/claude/cih-credibility-fixes` thereafter.
- The four CIH credibility fixes (tier labels, calibration banner, date-line removal, demo retirement) never reached production. Required PR #143 to replay onto a clean branch off `main`.

The same incident orphaned commit `3bf21200` from PR #139's later push
(wheel time picker, AIHA chip, Reports icon swap) because the merge
fired before the branch caught up.

## Detection

Two checks before declaring a stacked PR done:

```bash
# Is the head SHA actually on main?
git fetch origin main
git branch -r --contains <head-sha>
# → must include `origin/main`. If only the topic branch shows, it's orphaned.

# What did GitHub actually merge from that PR?
gh pr view <num> --json mergeCommit,headRefOid,baseRefName
# → baseRefName must be `main`, mergeCommit.oid must be reachable from origin/main.
```

## Three patterns that don't bite

### 1. Rebase the stack onto main before merging the bottom

The simplest fix. Every time a PR in the stack is about to merge,
the immediately-following PR re-bases onto the new `main` first.

```bash
# After PR-A squash-merges into main:
git fetch origin main
git checkout claude/feature-b
git rebase origin/main
git push --force-with-lease
# now PR-B is rooted on main, not on the orphaned A SHA
```

Before force-pushing, double-check the diff:
`git diff origin/claude/feature-b origin/claude/feature-b@{1}`.

### 2. Open every PR against main with explicit "depends on #X"

Skip the stacking entirely. Each PR targets `main`. The dependency is
documented in the PR body (e.g. `Depends on #N — wait for that to
merge first`). When the dependency lands, the dependent PR resolves
its merge conflict against main once and ships.

This is the recommended pattern for AtmosFlow — no special git
gymnastics, no surprises.

### 3. Merge in dependency order, never skip

If you do stack via sibling bases, merge the bottom of the stack
first, *then* update the next PR's base to `main` via the GitHub UI
("Edit → base") *before* merging it. GitHub auto-rebases on the new
base. This is reliable but easy to forget — pattern 2 is safer.

## Recovery (when an orphan is discovered)

The orphan's content still lives on the topic branch. To replay it
onto `main`:

```bash
git fetch origin main
git checkout -b claude/<descriptive>-replay origin/main
git cherry-pick <orphan-sha>
# resolve conflicts if any (the older the orphan, the more drift)
cd atmosiq-v6
npm run typecheck && npm run lint && npm run test -- --run && npm run build
cd ..
git push -u origin claude/<descriptive>-replay
gh pr create --base main --title 'feat(...): ... — replay of #<orig>' --body '...'
```

Always keep the original PR number visible in the title and body so
the audit trail joins back to the original review.

## What about Vercel + the live site?

A merge to `main` triggers a Vercel build. The user-facing impact
isn't visible until:

1. Vercel finishes the production build (~2–4 min)
2. CDN edge caches refresh (TTL-bound)
3. The user's PWA service worker (`atmosiq-v6/public/sw.js`) hands
   over to the new bundle. On iOS PWA standalone mode, this typically
   requires deleting the home-screen icon and reinstalling, or
   triggering a service-worker update via Settings → Safari →
   Advanced → Website Data → Remove for `atmosiq.prudenceehs.com`.

If the user reports "I cleared cache and still don't see it," check
in this order:

1. Is the PR actually merged into `origin/main`? (`git branch -r
   --contains <head-sha>` includes `origin/main`)
2. Is the Vercel deploy green and pointed at `main`?
3. Did the user reload past the service-worker cache?

## Cross-references

- `CLAUDE.md` — Working principles (Surgical changes only, No
  functional regressions). The principles still apply across stacked
  PRs; this runbook is the procedural complement.
- `docs/GO_LIVE.md` — End-to-end go-live procedure.
- `docs/PRODUCTION_READINESS.md` — Production readiness criteria.

When in doubt: open the next change against `main` and link it to its
dependency in prose. It's slower by one merge cycle but it never
silently drops a commit.
