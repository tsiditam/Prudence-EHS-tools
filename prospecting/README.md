# The AtmosFlow prospector

An agent that finds the people who should be using AtmosFlow, establishes
that they should be, and hands you a list where every claim has a URL behind
it.

It researches and qualifies. It does not write outreach and it does not
contact anyone — that stays with you.

## Running it

```sh
/find-clients                                   # run a round
node prospecting/scripts/lead-store.mjs next    # what the pipeline needs now
node prospecting/scripts/lead-store.mjs stats   # where it stands against target
node prospecting/scripts/lead-store.mjs list --tier A
node prospecting/scripts/lead-store.mjs show <lead-id>
node prospecting/scripts/lead-store.mjs export --csv handoff.csv
```

The agent can also be dispatched directly as `atmosflow-prospector` for a
single focused hunt ("work the ABIH directory for CIHs in Virginia").

## The pieces

| File | What it is |
|---|---|
| `.claude/agents/atmosflow-prospector.md` | The agent: mandate, loop, boundaries |
| `.claude/skills/find-clients/SKILL.md` | `/find-clients` — how a round is run and verified |
| `icp.md` | Who we sell to, every signal, what each is worth |
| `sources.md` | Where to look, and the sourcing boundaries |
| `targets.json` | The scoreboard the agent works against |
| `scripts/score.mjs` | Deterministic scoring. No model input |
| `scripts/lead-store.mjs` | The pipeline CLI — the only way records are written |
| `pipeline/events.jsonl` | Append-only event log; lead state is its fold |
| `pipeline/learnings.md` | What each round taught us about sourcing |

## Two design decisions worth knowing

**The model researches; the code judges.** The agent gathers evidence and
records signals. `score.mjs` turns those into a number, and the agent cannot
influence it — an unrecognised signal key raises an error rather than
scoring zero, and a signal without a source URL is dropped and shown as
dropped. This is the same order of operations the product uses on its own
reports, for the same reason: a score you cannot reproduce from the inputs
is an opinion wearing a number.

**The log is append-only.** Lead state is the fold of `events.jsonl`, so you
can always ask what was known about a firm on a given day, and a later
research pass cannot quietly overwrite an earlier finding. A `do_not_contact`
recorded once stays recorded.

## Changing the rubric

`icp.md` and `score.mjs` have to agree — the test suite checks key-by-key
and point-by-point, so a change to one without the other fails:

```sh
node --test prospecting/scripts/prospecting.test.mjs
```

Change them together and deliberately. The weights are a hypothesis about
this market, and `pipeline/learnings.md` is where the evidence for revising
them accumulates. Raising the targets in `targets.json` raises effort;
lowering the rubric lowers the value of everything already in the pipeline.

## On the agent's incentives

There is deliberately no survival pressure in the agent's instructions. An
agent told its existence depends on hitting a number optimises for the
number — scraped lists, personalization it cannot support, a domain
reputation that takes a year to rebuild. In a market of licensed
professionals who source their own claims for a living, that is not a
tolerable failure mode.

The persistence comes from structure instead: a standing target, a `next`
command that always names concrete work, a rubric that cannot be argued
with, and a learnings file that makes the tenth round better than the first.
The agent keeps working because there is always a specific next thing to do
and a number that says whether it is done — not because it is afraid.

## If this outgrows the repo

The event log is deliberately the same shape as a Postgres append-only
table: `(lead_id, type, at, payload)`, with the current view materialised by
folding. Moving to Supabase and a scheduled run means porting `loadLeads`
to a query and leaving the rubric untouched. Nothing here needs a rewrite
to become a service; it needs infrastructure, which is a decision to take
when the volume justifies it.
