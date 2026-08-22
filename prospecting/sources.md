# Where to look

The agent works this list. It is ordered by how well each source has
historically converted, and the agent is expected to re-order it as the
pipeline teaches it something — with a note in the log saying what it
learned.

## Public professional registries

- **ABIH CIH directory** — the certification body's own public roster. The
  primary source for `cih_on_staff`; a name here beats a claim on a website.
- **BCSP CSP directory** — same, for `csp_on_staff`.
- **AIHA consultant listing and local section rosters** — consultants who
  have already self-identified as taking IAQ work.
- **ASSP chapter rosters and event pages.**

## The practices themselves

- Firm websites: services pages, team pages, published sample reports,
  contact pages. This is where most signals actually come from, and it is
  the only place a contact route may be taken from.
- Their published FAQs and blog posts, for `states_report_turnaround` and
  `manual_template_evidence`.

## Hiring and demand signals

- Public job boards for IH, IAQ, and EHS roles — an open report-writing role
  is the single loudest pain signal in the rubric.
- Public solicitation portals (SAM.gov, state and municipal procurement) for
  `recent_iaq_rfp`. Awards are as useful as open bids: the winner just took
  on work they now have to report on.

## Events

- AIHce, ASSP Safety, IFMA World Workplace, BOMA International: exhibitor
  and speaker lists are published, current, and self-selecting.

## Adjacent

- IICRC-certified restoration firms advertising post-remediation
  verification.
- Property management firms publishing tenant IAQ complaint procedures.

---

## The boundaries, and why they hold

These are not formalities. AtmosFlow sells to licensed professionals whose
own work depends on defensible sourcing, and a prospecting method they would
find sloppy is a product argument against us.

**Public pages only, as a person would read them.** No logged-in scraping,
no bypassing a paywall or a robots directive, no automated bulk harvesting
of a directory that forbids it. If a source's terms say don't, that is a
`do_not_contact` on anything found there, not a puzzle to route around.

**No email guessing.** A contact route is recorded only from the page that
publishes it. Pattern-built addresses (`first.last@`) are not permitted, and
the store rejects a contact whose `--source-url` does not resolve to a real
published page. A verified contact form beats a guessed inbox.

**No personal data beyond the professional record.** Name, role, employer,
credential, published business contact. Nothing about the individual as a
private person, ever, even where it is technically visible.

**Respect a no, permanently.** Any request not to be contacted becomes a
`do_not_contact` disqualifier on the record. The event log is append-only,
so it cannot be undone by a later research pass that forgets.

**Evidence has a shelf life.** Over 24 months and it is `stale_evidence`.
People move firms and firms drop service lines; the pipeline should know
the difference between what is true and what was true.
