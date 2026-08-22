---
name: find-clients
description: Run a prospecting round for AtmosFlow — source, research, and qualify prospective clients against the ICP rubric, then report where the pipeline stands against target. Use when asked to find clients or customers, build or extend a prospect list, work the pipeline, research a market segment, check pipeline status, or hand off qualified leads. Triggers on "find clients", "who should we sell to", "build a target list", "work the pipeline", "prospect list", "qualify these leads", "how's the pipeline". Do NOT use for writing outreach emails or sequences, or for product marketing copy — the prospector's mandate is research and qualification only.
---

# Running a prospecting round

The pipeline lives in `prospecting/`. Read `prospecting/README.md` if you
have not this session — it is short and it explains the pieces.

## 1. Start from what the pipeline already needs

```sh
node prospecting/scripts/lead-store.mjs next
node prospecting/scripts/lead-store.mjs stats
```

`next` names specific work: leads to qualify, leads that score well but have
no contact route, near-misses one signal short of tier A. That work comes
before sourcing anything new — a half-researched lead is cheaper to finish
than a new one is to start.

`stats` says how far the board is from `prospecting/targets.json`. That gap
sizes the round.

## 2. Decide the round's shape

Ask the user only if the answer would change what you do. Reasonable
defaults when they have not said:

- **Segment** — `ih_consultancy` unless the pipeline is already dense there.
  It is the primary audience and the shortest path to a paid subscription.
- **Region** — where AtmosFlow's standards context applies (US). Start near
  Maryland if nothing else is specified; PSEC is in Germantown and a local
  practice is a warmer first conversation.
- **Volume** — enough to close the gap `stats` reported, not more. Fifteen
  new leads is a normal round.

## 3. Dispatch the prospector

Use the `atmosflow-prospector` agent (Agent tool, `subagent_type:
"atmosflow-prospector"`). Give it a concrete brief: the segment, the region,
the source to work, and the number of qualified leads you want back.

For a round spanning several sources or segments, dispatch one agent per
source in a single message so they run concurrently — they write through the
same append-only log, and the store dedupes on domain, so parallel agents
converge rather than collide.

A good brief:

> Work the AIHA consultant listing for IH consultancies in the mid-Atlantic.
> Target 5 qualified leads with verified contact routes. Record every signal
> through the CLI with its source URL. Disqualify what does not stand up
> rather than leaving it in the pipeline.

## 4. Verify before you report

Agents report their own results; the log is what actually happened. Check it:

```sh
node prospecting/scripts/lead-store.mjs list --tier A
node prospecting/scripts/lead-store.mjs show <id>
```

Spot-check two or three leads. Open one evidence URL and confirm it says
what the signal claims. If a signal does not hold up, remove nothing — the
log is append-only — but record the correction with `note` and re-score by
adding the appropriate penalty or disqualifier. A rubric nobody audits stops
being a rubric.

## 5. Hand off

```sh
node prospecting/scripts/lead-store.mjs export --csv prospecting/pipeline/handoff-$(date +%F).csv
```

Then tell the user, in plain numbers: how many qualified this round, where
the board stands against target, which source produced them, and what you
would work next. If the round came up short, say so and say why — a thin
week is information; a padded list is a liability.

## What this skill will not do

Write outreach. No emails, no LinkedIn notes, no call scripts, no subject
lines. The agent's mandate is research and qualification, and the handoff
CSV is the deliverable. If the user wants outreach copy, that is a separate
decision about authority to make deliberately, not something to slide into
at the end of a prospecting round.
