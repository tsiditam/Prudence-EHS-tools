# AtmosFlow on desktop

AtmosFlow is one responsive web app. At **≥ 1024px** it renders a **desktop
layout** — a persistent left navigation sidebar and wider, multi-column
content — while phones and tablets keep the bottom floating dock + hamburger
drawer. There is no separate desktop build, no native wrapper; same SPA, same
`/api` + Supabase backend.

## Breakpoint

The single source of truth is `useMediaQuery()` (`src/hooks/useMediaQuery.js`):

| flag | width | notes |
|---|---|---|
| `isMobile` | `< 768` | phone |
| `isTablet` | `≥ 768` | also true on desktop |
| `isTabletLand` | `≥ 768` & landscape | |
| `isDesktop` | **`≥ 1024`** | desktop layout gate |

`isDesktop` is intentionally **not** gated on `!standalone` — an installed
desktop PWA window ≥1024 also gets the desktop layout.

## Routing into the app (`src/App.jsx`)

`App.jsx` is the top router:

1. Peer-review magic link → `PeerReviewLanding`.
2. **Desktop browser, first visit** → the marketing page (`public/atmosflow-landing.html`); its CTAs
   call `goToApp()`, which sets a sticky `localStorage['af_desktop_entered']`
   and enters the app. Returning desktop visitors skip straight in. An
   installed desktop PWA (standalone) always skips straight in.
3. Everything else (mobile/tablet, and desktop after entering) → the modern
   **`MobileApp`** shell (wrapped in the Auth/Storage/Assessment providers).

> The legacy desktop assessment wizard that used to live in `App.jsx` (with
> `HistoryView` / `ReportView` / `src/components/DesktopSidebar.jsx`) was
> superseded by routing desktop into `MobileApp` and has been **removed**;
> `App.jsx` is now a thin entry router.

## Desktop shell (`src/components/MobileApp.jsx`)

Everything desktop is gated on `isDesktop`, so **mobile/tablet behavior is
unchanged**:

- **Home is the desktop landing** (consultant mode) —
  `src/components/desktop/DesktopHome.jsx`, view `home`. The state of the
  work: a greeting, four counts (active investigations, reports issued,
  needing attention, projects), a **Needs attention** card (the active
  draft with its zones / readings / observations census, else the report
  with findings needing attention, else an empty state), recent projects
  with status, and a recent-activity feed merged from drafts, reports and
  project activity. Reads the same index and project store the Reports and
  Projects screens read. `shellHome` in MobileApp is `home` on desktop and
  `homeView(userMode)` elsewhere; a phone that restores a `home` entry
  renders Projects.
- **Workflow-ordered rail** — `src/components/desktop/DesktopSidebar.jsx`
  (`SIDEBAR_W = 232`, `SIDEBAR_W_COLLAPSED = 64`). Search (Ctrl/⌘ K), then
  Home / Projects / Sites / Reports, **Analysis** (Logger Studio,
  Ventilation), **AtmosFlow AI** (the one cyan mark on the rail; toggles
  the panel), **Library** (Templates, Forms, Incidents, All tools),
  **Recent** (the four projects touched last), then Settings / Help /
  Trash above the account footer. The desktop rail has its own data
  (`railSections` / `railRecent` / `railBottom` in MobileApp); the phone
  menu keeps its list. The selected row is a raised tile in the primary
  ink, not an accent tint.
- **Collapsible rail.** The header toggle and **Ctrl/⌘ B** flip the rail
  between 232px and a 64px icon rail; the choice is remembered
  (`KEYS.desktopRailCollapsed`). Collapsed rows keep a native `title` and
  an `aria-label`. Rows have pointer-only hover states
  (`@media (hover: hover) and (pointer: fine)`), which touch layouts never
  see.
- **Command palette** — `src/components/desktop/DesktopCommandPalette.jsx`.
  **Ctrl/⌘ K** (or the rail's Search row) opens a filter over every rail
  destination, the recent projects, the eight most recent drafts and
  reports, Ask AtmosFlow AI, New investigation, feedback, the theme switch
  and the rail toggle. Arrow keys + Enter run a command; Escape closes.
  `matchCommands()` is the pure filter/ranker.
- **AtmosFlow AI is a docked panel, not a sheet or an orb.** `FieldAssistant`
  takes `desktop` + `panelWidth` (`AI_PANEL_W = 420`): on desktop it drops
  the scrim, docks to the right edge beside the work (the header and the
  content surface give up `aiW` to it), slides in from that edge, and
  greets on the empty canvas. **Ctrl/⌘ J** toggles it; so does the rail's
  AtmosFlow AI row. The floating launcher orb is not rendered on desktop.
  Below 1024px the phone sheet and the orb are byte-identical.
- **Tools is a toolkit dashboard** on desktop (`ToolsHub desktop`): the
  seven tools as grouped cards (Analysis / Field & documentation / System)
  with a sentence each and the criterion or output they work against.
- **Results hero** carries a four-count stat strip (zones, measurements,
  observations, occupant reports) under the verdict; the At-a-glance list
  no longer prints the measurement-confidence word (see the CHANGELOG).
- **Bottom floating dock is hidden** on desktop (its destinations live in the
  sidebar); the **hamburger trigger is hidden** (the sidebar is persistent).
  The mobile slide-in drawer stays mobile-only.
- **Offsets**: the fixed header's `left` and the content surface's
  `paddingLeft` shift by the live rail width (`railW`); their right edges
  shift by the AI panel width (`aiW`) while it is open.
- **Wider content**: `contentMax = 1280` and `padX = 40` on desktop (vs.
  620/860/1080 and 20/28 below). Existing `isTablet`-gated grid flips (results
  two-up, findings table, zone split, etc.) already activate at ≥1024, so
  content goes multi-column for free.

## What is NOT changed

- Mobile/tablet (`< 1024`) layout, the dock, the drawer, the viewport — byte
  identical.
- The engine, scoring, report generation, and all `/api` endpoints.
- Screening-only positioning and copy.

## Tests

- `tests/components/useMediaQuery.test.tsx` — the `isDesktop` gate at 1280 /
  800 / 375 and the standalone-desktop case.
- `tests/components/DesktopSidebar.test.jsx` — sections, recent and bottom
  items render, active highlight by view or explicit flag, `onSelect`,
  account footer, the Search row, the icon-rail collapse (labels gone,
  accessible names kept), the Ctrl/⌘ B chord (ignored inside a text
  field), and the remembered preference.
- `tests/components/DesktopCommandPalette.test.jsx` — closed by default,
  Ctrl/⌘ K toggles, `openNonce` opens, filter + ranking, arrows / Enter /
  click / Escape.
- `tests/components/DesktopHome.test.jsx` — greeting, counts, the
  Needs-attention card's three states and the async census, recent
  projects, the activity feed, and the pure helpers.
- `tests/components/ToolsHub-desktop.test.jsx` — grouped cards on desktop,
  the phone list otherwise.
- `tests/components/FieldAssistant-desktop.test.tsx` — desktop panel mode:
  no scrim, docked right at the panel width, the greeting; and the default
  render is still the phone sheet.
- Full suite stays green (no mobile regressions).

## Verification

1. `npm run build` (the SPA gate) — must pass.
2. `npm run test` — full suite green.
3. On `npm run dev` / the Vercel preview: at **≥1024px** the left sidebar
   appears, the bottom dock is gone, the header starts after the rail, and
   content widens to 1280 / multi-column; **resize below 1024** and the app
   returns to the exact mobile layout (dock + hamburger). Verify in **both
   light and dark** themes. Confirm the desktop marketing landing CTA enters
   the app and that the choice sticks across reload.
4. Sign in on desktop: the landing is **Home** (greeting, counts, Needs
   attention, recent projects, activity). Press **Ctrl/⌘ B**: the rail
   collapses to icons and the header / content shift left with it; reload
   and it stays collapsed. Press **Ctrl/⌘ K**, type a project or report
   name, Enter: it opens. Press **Ctrl/⌘ J** (or click AtmosFlow AI in the
   rail): the AI panel docks on the right with no scrim, the content and
   header narrow to make room, and the floating orb is absent. Open Tools:
   grouped cards. Open a finalized report: the stat strip sits under the
   verdict and At a glance has no Confidence row.

## Follow-ups (not in this change)

- Per-screen desktop compositions (e.g., split-pane results: zone list +
  zone detail side-by-side) building on this shell.
- Contextual AI actions in place (✦ Refine on the executive summary,
  ✦ Summarize relationships on the findings, ✦ Explain this pattern in
  Logger Studio) that open the docked panel with the question pre-filled.
- A "Zones" list on the results screen that drills into a per-zone
  measurement grid (CO₂ / PM₂.₅ / temperature / RH with their criterion
  state), observations and occupant input.
- A cyan audit of the remaining screens: the accent should be the primary
  action, the selected data point and the AI mark, nothing else.
- Recent AI conversations listed in the panel (the history column) rather
  than behind its clock button.
