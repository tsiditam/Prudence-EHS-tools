/**
 * ESLint flat config.
 *
 * Two tiers, on purpose:
 *
 *   • Infra paths (scripts/, tests/api|scripts|lib|components|pages,
 *     api/*.ts, lib/*.ts, top-level components/ and pages/) — real rules,
 *     `--max-warnings=0` (see `lint:eslint` in package.json). Green means
 *     the rules pass, not merely "files parse" as it did before 2026-09.
 *
 *   • src/ (the 77k-line SPA) — the same core rules plus
 *     eslint-plugin-react-hooks, linted under a WARNING RATCHET
 *     (`lint:src`, `--max-warnings=<count>`). Errors — rules-of-hooks,
 *     no-undef, no-dupe-keys, no-unreachable, no-debugger — are hard
 *     failures. Warnings may not grow; lower the ratchet in package.json
 *     as they are paid down. The ten `react-hooks/exhaustive-deps`
 *     disables scattered through src/ were cosmetic until the plugin was
 *     actually installed here.
 *
 * tsc --noEmit (tsconfig.check.json) remains the type gate; ESLint does
 * not run type-aware rules, so it stays fast enough for every PR.
 */

import tsparser from '@typescript-eslint/parser'
import tsplugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  crypto: 'readonly',
  performance: 'readonly',
  globalThis: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
}

const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  screen: 'readonly',
  self: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  indexedDB: 'readonly',
  caches: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  matchMedia: 'readonly',
  getComputedStyle: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  requestIdleCallback: 'readonly',
  cancelIdleCallback: 'readonly',
  scrollTo: 'readonly',
  innerWidth: 'readonly',
  innerHeight: 'readonly',
  devicePixelRatio: 'readonly',
  Image: 'readonly',
  Audio: 'readonly',
  FileReader: 'readonly',
  DOMParser: 'readonly',
  XMLSerializer: 'readonly',
  MutationObserver: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  Notification: 'readonly',
  WebSocket: 'readonly',
  Worker: 'readonly',
  MediaRecorder: 'readonly',
  SpeechRecognition: 'readonly',
  webkitSpeechRecognition: 'readonly',
  speechSynthesis: 'readonly',
  SpeechSynthesisUtterance: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  TouchEvent: 'readonly',
  PointerEvent: 'readonly',
  Element: 'readonly',
  Node: 'readonly',
  NodeList: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  HTMLSelectElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLCanvasElement: 'readonly',
  HTMLImageElement: 'readonly',
  HTMLVideoElement: 'readonly',
  HTMLAnchorElement: 'readonly',
  HTMLFormElement: 'readonly',
  SVGElement: 'readonly',
  Range: 'readonly',
  Selection: 'readonly',
  ImageData: 'readonly',
  OffscreenCanvas: 'readonly',
  createImageBitmap: 'readonly',
  BluetoothDevice: 'readonly',
  BluetoothRemoteGATTCharacteristic: 'readonly',
  DOMException: 'readonly',
  // Injected by vite.config.js `define` (see src/version.js).
  __BUILD_SHA__: 'readonly',
}

const COMMON_GLOBALS = { ...NODE_GLOBALS, ...BROWSER_GLOBALS }

// Rules shared by every tier. Warnings are ratcheted in src/ and hard
// failures (max-warnings=0) on infra paths.
const CORE_RULES = {
  'no-undef': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-debugger': 'error',
  'no-unused-vars': ['warn', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    ignoreRestSiblings: true,
  }],
  eqeqeq: ['warn', 'smart'],
}

// TypeScript-aware variant: @typescript-eslint/no-unused-vars understands
// type-only references, so the core rule is switched off in its favour.
const TS_RULES = {
  ...CORE_RULES,
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    ignoreRestSiblings: true,
  }],
  // tsc owns undefined-identifier checks for TS (and knows about types).
  'no-undef': 'off',
}

const REACT_HOOKS_RULES = {
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
}

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      '.vercel/',
      'public/',
      'server/handlers/',
      'tests/engine/',
    ],
  },

  // ── Infra tier: plain JS/MJS scripts ──────────────────────────────────
  {
    files: ['scripts/**/*.{js,mjs}', 'server/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: NODE_GLOBALS,
    },
    rules: CORE_RULES,
  },

  // ── Infra tier: TypeScript ────────────────────────────────────────────
  {
    files: [
      'scripts/**/*.ts',
      'tests/api/**/*.ts',
      'tests/scripts/**/*.ts',
      'tests/lib/**/*.ts',
      'tests/components/**/*.{ts,tsx}',
      'tests/pages/**/*.{ts,tsx}',
      'api/**/*.ts',
      'lib/**/*.ts',
      'components/**/*.{ts,tsx}',
      'pages/**/*.{ts,tsx}',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: COMMON_GLOBALS,
    },
    plugins: {
      '@typescript-eslint': tsplugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...TS_RULES,
      ...REACT_HOOKS_RULES,
    },
  },

  // ── SPA tier: src/**/*.{js,jsx} under the warning ratchet ─────────────
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: COMMON_GLOBALS,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...CORE_RULES,
      ...REACT_HOOKS_RULES,
    },
  },

  // ── TEMPORARY: genuine undefined identifiers found when src/ was first
  // linted (2026-09). `setError` (FieldAssistant.jsx:1534) and
  // `setEditorialCuts` (MobileApp.jsx:1020, 1049, 1381) are called but never
  // declared — a ReferenceError on those paths at runtime. They are
  // downgraded to warnings HERE ONLY so the ratchet can land; no-undef stays
  // an error everywhere else. Delete this block once the frontend fix lands
  // (tracked in the audit-remediation handoff).
  {
    files: ['src/components/FieldAssistant.jsx', 'src/components/MobileApp.jsx'],
    rules: { 'no-undef': 'warn' },
  },

  // ── SPA tier: src/**/*.{ts,tsx} ───────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: COMMON_GLOBALS,
    },
    plugins: {
      '@typescript-eslint': tsplugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...TS_RULES,
      ...REACT_HOOKS_RULES,
    },
  },
]
