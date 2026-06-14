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
2. **Desktop browser, first visit** → the marketing `LandingPage`; its CTAs
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
  (width `SIDEBAR_W = 240`), rendered fixed on the left when `isDesktop`. It is
  fed the **same destination data** the mobile side menu uses
  (`sideMenuPrimary` / `sideMenuGroups` / `sideMenuTrash`), so the information
  architecture stays single-source: primary destinations, collapsible
  Tools/Resources/Support groups, Trash, and an account footer. Active state
  tracks the current `view`.
- **Bottom floating dock is hidden** on desktop (its destinations live in the
  sidebar); the **hamburger trigger is hidden** (the sidebar is persistent).
  The mobile slide-in drawer stays mobile-only.
- **Offsets**: the fixed header's `left` and the content surface's
  `paddingLeft` shift by `SIDEBAR_W` on desktop.
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
  highlight, `onSelect`, group collapse/toggle, account footer.
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

## Follow-ups (not in this change)

- Per-screen desktop compositions (e.g., split-pane results: zone list +
  zone detail side-by-side) building on this shell.
