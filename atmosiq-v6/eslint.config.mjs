/**
 * Minimal ESLint flat config.
 *
 * Lints only the new infrastructure paths (scripts/, tests/api,
 * api/*.ts, lib/*.ts, top-level components/ and pages/). The existing
 * JSX/JS codebase under src/ is not in scope. We rely on tsc --noEmit
 * for type-correctness; ESLint here is a parse-and-syntax gate with
 * no opinionated rules, so green = "files parse cleanly."
 */

import tsparser from '@typescript-eslint/parser'

const COMMON_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  // DOM globals for the SPA pages/components.
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLButtonElement: 'readonly',
}

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      '.vercel/',
      'public/',
      'src/',
      'tests/engine/',
    ],
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: COMMON_GLOBALS,
    },
  },
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
  },
]
