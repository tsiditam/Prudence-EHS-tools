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
  dash: { label: 'Home / dashboard', reachedBy: ['bottom-nav', 'hamburger'] },
  history: { label: 'Reports list', reachedBy: ['bottom-nav'] },
  settings: { label: 'Settings', reachedBy: ['bottom-nav', 'hamburger'] },
  search: { label: 'Search', reachedBy: ['hamburger'] },
  trash: { label: 'Trash', reachedBy: ['hamburger'] },
  'sampling-forms': { label: 'Sampling forms', reachedBy: ['hamburger'] },
  'sensor-data': { label: 'Sensor data', reachedBy: ['hamburger', 'flow'] },
  projects: { label: 'Projects / site folders', reachedBy: ['hamburger'] },
  properties: { label: 'Buildings portfolio (FM)', reachedBy: ['bottom-nav'] },
  'incident-log': { label: 'Incident log (FM)', reachedBy: ['bottom-nav'] },

  // ── Assessment flow ──
  quickstart: { label: 'Quick start', reachedBy: ['flow'] },
  equipment: { label: 'Equipment capture', reachedBy: ['flow'] },
  zone: { label: 'Zone walkthrough', reachedBy: ['flow'] },
  details: { label: 'Assessment details', reachedBy: ['flow'] },
  results: { label: 'Results', reachedBy: ['flow'] },
  spatial: { label: 'Floor-plan zone map', reachedBy: ['flow'] },

  // ── Detail / sub-screens (opened from a list or another screen) ──
  report: { label: 'Saved report view', reachedBy: ['detail', 'flow'] },
  'project-detail': { label: 'Project workspace', reachedBy: ['detail'] },
  'incident-detail': { label: 'Incident detail', reachedBy: ['detail'] },
  'incident-form': { label: 'New / edit incident', reachedBy: ['detail'] },

  // ── Settings sub-pages ──
  'instrument-edit': { label: 'Edit instruments', reachedBy: ['settings'] },
  help: { label: 'Help & FAQ', reachedBy: ['settings', 'search', 'assistant'] },
  tos: { label: 'Terms of Service', reachedBy: ['settings', 'assistant'] },
  privacy: { label: 'Privacy Policy', reachedBy: ['settings', 'assistant'] },
  admin: { label: 'Admin dashboard', reachedBy: ['settings'] },
}

export const ROUTE_IDS = Object.keys(ROUTES)

export default ROUTES
