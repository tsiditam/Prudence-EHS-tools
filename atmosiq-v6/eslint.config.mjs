/**
 * Minimal ESLint flat config.
 *
 * Lints only the new infrastructure paths (scripts/, tests/api/, api/*.ts,
 * lib/*.ts). The existing JSX/JS codebase is not in scope. We rely on
 * tsc --noEmit for type-correctness; ESLint here is a parse-and-syntax
 * gate with no opinionated rules, so green = "files parse cleanly."
 */

import tsparser from '@typescript-eslint/parser'

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
      globals: {
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
      },
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/api/**/*.ts', 'tests/scripts/**/*.ts', 'api/**/*.ts', 'lib/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
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
      },
    },
  },
]
