/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Route registry — every view the shell renders, with how it is reached.
 *
 * Fields:
 *   label      descriptive name (tests, docs)
 *   short      the name the header back pill shows when this is the
 *              destination ("‹ Project"), and the Tools hub row title
 *   reachedBy  entry-point kinds (see ENTRY_POINTS) — a route with none is
 *              an orphan and the registry test fails
 *   parent     where back() goes when the in-app stack has nothing beneath
 *              (after a reload or a deep link). null = a top-level home
 *   restore    whether a reload / history entry can rebuild the screen:
 *              true | false | the id field it needs
 *
 * tests/components/routes-registry.test.js keeps this in step with the
 * render branches in MobileApp.jsx; tests/components/routes-parents.test.js
 * keeps every parent pointing at a registered, acyclic route.
 */

export const ENTRY_POINTS = ['bottom-nav', 'hamburger', 'tools-hub', 'settings', 'search', 'assistant', 'flow', 'detail']

export const ROUTES = {
  // ── Primary navigation ──
  // Desktop landing (2026-09): the state of the work — counts, what needs
  // attention, recent projects and activity. Phones land on Projects.
  home: { label: 'Home / workspace', short: 'Home', reachedBy: ['hamburger'], parent: null, restore: true },
  dash: { label: 'Home / dashboard', short: 'Home', reachedBy: ['bottom-nav', 'hamburger'], parent: null, restore: true },
  projects: { label: 'Projects / site folders', short: 'Projects', reachedBy: ['bottom-nav', 'hamburger'], parent: null, restore: true },
  history: { label: 'Reports list', short: 'Reports', reachedBy: ['bottom-nav', 'hamburger'], parent: 'projects', restore: true },
  tools: { label: 'Tools hub', short: 'Tools', reachedBy: ['bottom-nav', 'hamburger'], parent: 'projects', restore: true },
  account: { label: 'Account / profile', short: 'Account', reachedBy: ['bottom-nav', 'hamburger'], parent: 'projects', restore: true },
  settings: { label: 'Settings', short: 'Settings', reachedBy: ['bottom-nav', 'hamburger'], parent: 'projects', restore: true },
  search: { label: 'Search', short: 'Search', reachedBy: ['tools-hub'], parent: 'tools', restore: true },
  trash: { label: 'Trash', short: 'Trash', reachedBy: ['hamburger'], parent: 'projects', restore: true },
  properties: { label: 'Buildings portfolio (FM)', short: 'Buildings', reachedBy: ['bottom-nav'], parent: 'dash', restore: true },

  // ── Tools (open from the Tools hub or a project workspace; the FM dock
  //    keeps Logger Studio and Incidents as tabs; back returns to wherever
  //    they were opened from) ──
  'sensor-data': { label: 'Logger Studio', short: 'Logger Studio', reachedBy: ['tools-hub', 'bottom-nav', 'flow', 'detail'], parent: 'tools', restore: true },
  'sampling-forms': { label: 'Sampling forms', short: 'Sampling forms', reachedBy: ['tools-hub', 'detail'], parent: 'tools', restore: true },
  ventilation: { label: 'Ventilation calculator', short: 'Ventilation', reachedBy: ['tools-hub'], parent: 'tools', restore: true },
  'incident-log': { label: 'Incident log', short: 'Incidents', reachedBy: ['tools-hub', 'bottom-nav'], parent: 'tools', restore: true },

  // ── Assessment flow ──
  quickstart: { label: 'Quick start', short: 'Assessment', reachedBy: ['flow'], parent: 'projects', restore: false },
  equipment: { label: 'Equipment capture', short: 'Assessment', reachedBy: ['flow'], parent: 'projects', restore: false },
  zone: { label: 'Zone walkthrough', short: 'Assessment', reachedBy: ['flow'], parent: 'projects', restore: false },
  details: { label: 'Assessment details', short: 'Assessment', reachedBy: ['flow'], parent: 'projects', restore: false },
  results: { label: 'Results', short: 'Results', reachedBy: ['flow'], parent: 'projects', restore: false },
  // The floor plan is no longer a route. It became the "Site plan" tab of
  // the results screen in 2026-09; as a standalone view behind the header
  // overflow menu it was somewhere nobody looked. See SpatialMap.jsx.

  // ── Detail / sub-screens (opened from a list or another screen) ──
  report: { label: 'Saved report view', short: 'Report', reachedBy: ['detail', 'flow'], parent: 'history', restore: 'rptId' },
  'project-detail': { label: 'Project workspace', short: 'Project', reachedBy: ['detail'], parent: 'projects', restore: 'projectId' },
  'incident-detail': { label: 'Incident detail', short: 'Incident', reachedBy: ['detail'], parent: 'incident-log', restore: 'incidentId' },
  'incident-form': { label: 'New / edit incident', short: 'New incident', reachedBy: ['detail'], parent: 'incident-log', restore: false },

  // ── Settings sub-pages ──
  'instrument-edit': { label: 'Edit instruments', short: 'Instruments', reachedBy: ['settings'], parent: 'account', restore: false },
  sites: { label: 'Site library', short: 'Sites', reachedBy: ['tools-hub'], parent: 'tools', restore: true },
  'report-templates': { label: 'Report templates', short: 'Templates', reachedBy: ['tools-hub'], parent: 'tools', restore: true },
  help: { label: 'Help & FAQ', short: 'Help', reachedBy: ['settings', 'search', 'assistant'], parent: 'settings', restore: true },
  tos: { label: 'Terms of Service', short: 'Terms', reachedBy: ['settings', 'assistant'], parent: 'settings', restore: true },
  privacy: { label: 'Privacy Policy', short: 'Privacy', reachedBy: ['settings', 'assistant'], parent: 'settings', restore: true },
  admin: { label: 'Admin dashboard', short: 'Admin', reachedBy: ['settings'], parent: 'settings', restore: false },
}

export const ROUTE_IDS = Object.keys(ROUTES)

export default ROUTES
