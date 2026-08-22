# Who AtmosFlow is for

This is the agent's target definition. It is also the contract the scoring
code answers to: every key below exists in `scripts/score.mjs`, and
`prospecting.test.mjs` fails if this file and that file disagree. Change the
rubric here and in the code together, or the tests will say so.

## The segments, in the order they matter

Taken from `atmosiq-v6/docs/white-paper/06-target-audience-and-go-to-market.md`,
not invented here.

| Segment key | Who | Why they buy | Likely tier |
|---|---|---|---|
| `ih_consultancy` | Board-certified IHs (CIH, CSP) running IAQ investigations, solo or in a small firm | 8–20 hours of post-field report preparation disappears | Solo $129 / Pro $329 |
| `ehs_multi_site` | Corporate EHS directors across several facilities | One methodology across every site, and a record that survives a claim | Practice $749 |
| `fm_property_manager` | Commercial property and facility operators | Document a complaint without retaining a consultant for each one, and know when to escalate | Solo $129 |
| `restoration_remediation` | Restoration and remediation contractors | Post-remediation verification with a document behind it | Solo / Pro |

`unknown` is the honest answer before the research is done. It scores zero,
which is the point: an unclassified lead cannot reach tier A by accumulating
soft signals.

## What the agent is looking for

Points are assigned by `scripts/score.mjs`. Every signal needs a URL the
reviewer can open — a signal without one is dropped and shown as dropped,
never quietly rounded down.

**Practice evidence — do they run IAQ investigations at all?**

- `iaq_service_page` (+10) — a live service page offering IAQ investigation.
- `iaq_report_sample_published` (+6) — a sample report or case study with their name on it.
- `mold_moisture_services` (+4) — mold, moisture intrusion, or post-remediation verification.
- `instrument_ownership_evidence` (+5) — they name their own meters, loggers, or pumps. AtmosFlow assumes the assessor brings the instruments; someone who subcontracts sampling is a different sale.

**Credentials — does the buyer clear the professional bar?**

- `cih_on_staff` (+12) — the strongest single signal in the rubric. The report engine is built to survive CIH peer review, so the CIH is the person who can tell whether it does.
- `csp_on_staff` (+5)
- `aiha_member` (+4)
- `assp_member` (+4)

**Pain — is report turnaround visibly costing them something?**

- `hiring_report_writer` (+8) — an open role centred on writing or reviewing reports. They have priced the problem and decided to pay salary for it.
- `job_posting_iaq_staff` (+6) — capacity constrained.
- `states_report_turnaround` (+8) — they publish a turnaround time or complain about one.
- `manual_template_evidence` (+5) — a downloadable Word or PDF report template: the exact workflow the product replaces.

**Size — which tier does their volume land on?**

- `size_solo` (+6), `size_2_10` (+10), `size_11_50` (+8), `size_50_plus` (+4).

2–10 scores highest because it is the densest part of this market and the
shortest path from interest to a paid subscription. 50+ scores lowest not
because the money is worse but because procurement is long and this agent is
measured on qualified leads, not logos.

**Reachability — can a human actually start a conversation?**

- `public_contact_email` (+6) — a published business address. Never a guessed or pattern-built one.
- `named_decision_maker` (+8) — a named principal or practice lead, with the page that names them.
- `warm_path` (+10) — a real introduction route: shared association, conference, mutual contact.

These three are normally derived automatically when a contact route is
recorded, rather than asserted separately.

**Timing — is something happening right now?**

- `recent_iaq_rfp` (+8) — an open or recently closed IAQ solicitation.
- `conference_attendee` (+5) — speaking at or exhibiting at AIHA, ASSP, IFMA, or BOMA.
- `expansion_signal` (+3) — new office, acquisition, or announced practice-area expansion.

## What pulls a lead down

Penalties, not stops:

- `non_us_primary_market` (−10) — the engine cites OSHA, ASHRAE, and AIHA. A practice outside that standards context is a real prospect with a real gap, and the gap belongs on the record.
- `no_web_presence` (−8) — nothing to verify against beyond a directory stub.
- `stale_evidence` (−6) — the most recent evidence is over 24 months old.
- `no_named_humans` (−5) — outreach would have no addressee.

## What ends a lead

Hard stops. Score goes to zero and the lead is filed with its reason:

- `competitor` — builds or resells competing IAQ assessment software.
- `no_iaq_practice` — no evidence of indoor air quality work of any kind.
- `do_not_contact` — asked not to be contacted, or the source forbids this use.
- `existing_customer` — already an AtmosFlow account.
- `unverifiable` — nothing could be confirmed from a primary source. This one is not a judgement about the company. It means the research did not land, and the lead should not sit in the pipeline pretending otherwise.

## Tiers

| Tier | Score | What it means |
|---|---|---|
| A | 70+ | Work now. The evidence would stand up in a conversation today. |
| B | 50–69 | One specific signal short. Go find that signal, not more leads. |
| C | 30–49 | Park. Revisit when a timing signal appears. |
| D | under 30 | Not a fit on current evidence. |

Tier A needs breadth, not one big number: the segment base plus a credential
gets you to 42, and no combination of guesses gets past 70 without evidence
from at least three different groups. That is deliberate. A lead is tier A
when several independent facts point the same way.

## The disqualifying question

Before recording any signal: *would the person named in this evidence
recognise the description of themselves?* If the answer needs a maybe, the
signal is not evidence yet. Keep researching or record nothing.
