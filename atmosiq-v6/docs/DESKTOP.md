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

- **Persistent left sidebar** — `src/components/desktop/DesktopSidebar.jsx`
  (width `SIDEBAR_W = 240`, or `SIDEBAR_W_COLLAPSED = 68` as an icon rail),
  rendered fixed on the left when `isDesktop`. It is fed the **same
  destination data** the mobile side menu uses (`sideMenuPrimary` /
  `sideMenuGroups` / `sideMenuTrash`), so the information architecture stays
  single-source: primary destinations, collapsible Tools/Resources/Support
  groups, Trash, and an account footer. Active state tracks the current
  `view`. The AI launcher leaves the destination list on desktop — it is
  the rail's filled **New chat** action instead.
- **Collapsible rail** (desktop pass, 2026-09). The header toggle and
  **Ctrl/⌘ B** flip the rail between 240px and a 68px icon rail; the choice
  is remembered (`KEYS.desktopRailCollapsed`). Collapsed rows keep a native
  `title` and an `aria-label`. Rows have pointer-only hover states
  (`@media (hover: hover) and (pointer: fine)`), which touch layouts never
  see.
- **Command palette** — `src/components/desktop/DesktopCommandPalette.jsx`.
  **Ctrl/⌘ K** (or the rail's Search row) opens a filter over every rail
  destination, the eight most recent drafts and reports, "New chat", the
  theme switch and the rail toggle. Arrow keys + Enter run a command; Escape
  closes. `matchCommands()` is the pure filter/ranker.
- **AtmosFlow AI is a page, not a sheet.** `FieldAssistant` takes
  `desktop` + `leftInset` (the live rail width): on desktop it drops the
  scrim, pins to the content area right of the rail at full width, centers
  the transcript and composer in an 800px reading column, fades in instead
  of rising, and greets on the empty canvas with the composer lifted toward
  the middle of the window. Picking a rail destination while the chat is
  open closes it. Below 1024px the phone sheet is byte-identical.
- **Bottom floating dock is hidden** on desktop (its destinations live in the
  sidebar); the **hamburger trigger is hidden** (the sidebar is persistent).
  The mobile slide-in drawer stays mobile-only.
- **Offsets**: the fixed header's `left`, the content surface's
  `paddingLeft` and the chat page's `left` shift by the live rail width
  (`railW` in MobileApp) on desktop.
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
- `tests/components/DesktopSidebar.test.jsx` — destinations render, active
  highlight, `onSelect`, group collapse/toggle, account footer; the New chat
  and Search actions, the icon-rail collapse (labels gone, accessible names
  kept), the Ctrl/⌘ B chord (ignored inside a text field), and the
  remembered preference.
- `tests/components/DesktopCommandPalette.test.jsx` — closed by default,
  Ctrl/⌘ K toggles, `openNonce` opens, filter + ranking, arrows / Enter /
  click / Escape.
- `tests/components/FieldAssistant-desktop.test.tsx` — desktop page mode:
  no scrim, pinned right of the rail and following its width, the greeting;
  and the default render is still the phone sheet.
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
4. Press **Ctrl/⌘ B**: the rail collapses to icons and the header / content
   / open chat shift left with it; reload and it stays collapsed. Press
   **Ctrl/⌘ K**, type a report name, Enter: it opens. Click **New chat**:
   the AI page fills the area right of the rail with no scrim, the greeting
   sits over a centered composer, and clicking Projects in the rail closes
   it.

## Follow-ups (not in this change)

- Per-screen desktop compositions (e.g., split-pane results: zone list +
  zone detail side-by-side) building on this shell.
- Recent AI conversations listed in the rail under New chat (the
  Claude / ChatGPT history column). The palette's Drafts / Reports groups
  cover the "search my work" half today; the chat history still lives
  behind the clock button on the AI page.
- A reading-width column (~800px) for prose-heavy screens (Help, report
  narrative review) the way the AI page has one; data screens keep 1280.
