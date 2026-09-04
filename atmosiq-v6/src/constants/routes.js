/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Central route registry — the single source of truth for the app's
 * "views" (the flat `view` string state in MobileApp) and how each one is
 * reached.
 *
 * MobileApp dispatches navigation from several places — the mode-dependent
 * bottom nav, the hamburger menu, in-screen `onNavigate` props, and the AI
 * copilot's `setView(action.target)` — and renders each view as a
 * `{view==='x' && <Screen/>}` branch. With no single inventory, screens
 * drifted into an orphaned state (rendered but unreachable): the org audit
 * found three (IHDirectory, InterventionTracker, InstrumentManager) that
 * were imported and rendered but had no entry point, and were removed.
 *
 * This registry plus its guard test (tests/components/routes-registry.test.js)
 * prevent that recurring:
 *   • every rendered `view==='x'` branch must be registered here, and
 *   • every registered route must declare at least one entry point.
 * A new view that isn't registered, a stale registry entry, or a route
 * with no way to reach it now fails CI instead of silently shipping.
 *
 * This is a source-of-truth + guard, not a router — MobileApp still owns
 * the actual render switch. Wiring dispatch (nav labels, the AI target
 * allow-list) to read from here is a safe incremental follow-up.
 *
 * `restore` — how the route survives a browser back gesture / refresh
 * (src/hooks/useViewHistory.js mirrors `view` into history.pushState):
 *   true         — a plain screen; restored from the history entry as-is
 *   'rptId' /
 *   'projectId' /
 *   'incidentId' — restored by loading that record (the id rides in the
 *                  history entry)
 *   false        — depends on in-memory draft state (assessment flow,
 *                  admin secret, tool sub-screens); a refresh falls back
 *                  to the home view, a back gesture to the previous entry.
 *
 * `reachedBy` entry-point kinds:
 *   'bottom-nav' — a tab in the (IH or FM) bottom navigation
 *   'hamburger'  — an item in the top-left menu
 *   'settings'   — a sub-page opened from the Settings screen
 *   'search'     — opened from the Search screen
 *   'assistant'  — an AI-copilot navigation target (setView(action.target))
 *   'flow'       — a step in the assessment flow, or opened from another screen
 *   'detail'     — a detail screen opened from a list (report, project, incident)
 */

export const ENTRY_POINTS = ['bottom-nav', 'hamburger', 'settings', 'search', 'assistant', 'flow', 'detail']

export const ROUTES = {
  // ── Primary navigation ──
  dash: { label: 'Home / dashboard', reachedBy: ['bottom-nav', 'hamburger'], restore: true },
  history: { label: 'Reports list', reachedBy: ['bottom-nav'], restore: true },
  settings: { label: 'Settings', reachedBy: ['bottom-nav', 'hamburger'], restore: true },
  search: { label: 'Search', reachedBy: ['hamburger'], restore: true },
  trash: { label: 'Trash', reachedBy: ['hamburger'], restore: true },
  'sampling-forms': { label: 'Sampling forms', reachedBy: ['hamburger'], restore: true },
  'sensor-data': { label: 'Sensor data', reachedBy: ['hamburger', 'flow'], restore: true },
  projects: { label: 'Projects / site folders', reachedBy: ['hamburger'], restore: true },
  account: { label: 'Account / profile', reachedBy: ['bottom-nav', 'hamburger'], restore: true },
  properties: { label: 'Buildings portfolio (FM)', reachedBy: ['bottom-nav'], restore: true },
  'incident-log': { label: 'Incident log (FM)', reachedBy: ['bottom-nav'], restore: true },

  // ── Assessment flow ──
  quickstart: { label: 'Quick start', reachedBy: ['flow'], restore: false },
  equipment: { label: 'Equipment capture', reachedBy: ['flow'], restore: false },
  zone: { label: 'Zone walkthrough', reachedBy: ['flow'], restore: false },
  details: { label: 'Assessment details', reachedBy: ['flow'], restore: false },
  results: { label: 'Results', reachedBy: ['flow'], restore: false },
  spatial: { label: 'Floor-plan zone map', reachedBy: ['flow'], restore: false },

  // ── Detail / sub-screens (opened from a list or another screen) ──
  report: { label: 'Saved report view', reachedBy: ['detail', 'flow'], restore: 'rptId' },
  'project-detail': { label: 'Project workspace', reachedBy: ['detail'], restore: 'projectId' },
  'incident-detail': { label: 'Incident detail', reachedBy: ['detail'], restore: 'incidentId' },
  'incident-form': { label: 'New / edit incident', reachedBy: ['detail'], restore: false },

  // ── Settings sub-pages ──
  'instrument-edit': { label: 'Edit instruments', reachedBy: ['settings'], restore: false },
  help: { label: 'Help & FAQ', reachedBy: ['settings', 'search', 'assistant'], restore: true },
  tos: { label: 'Terms of Service', reachedBy: ['settings', 'assistant'], restore: true },
  privacy: { label: 'Privacy Policy', reachedBy: ['settings', 'assistant'], restore: true },
  admin: { label: 'Admin dashboard', reachedBy: ['settings'], restore: false },
}

export const ROUTE_IDS = Object.keys(ROUTES)

export default ROUTES
