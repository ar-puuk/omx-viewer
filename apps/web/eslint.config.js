// eslint.config.js — flat config (ESLint v9+) for TypeScript + Svelte 5.
// Migrated from .eslintrc.cjs, which the installed ESLint version (v9+)
// can no longer load — flat config is the only supported format now.

import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import globals from 'globals'

export default [
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],

  // TypeScript rules — applied to both .ts files and .svelte script blocks,
  // since the base (non-TS-aware) no-unused-vars can't see type-only usage
  // like Props interface destructuring inside <script lang="ts">.
  {
    files: ['**/*.ts', '**/*.svelte'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.browser, ...globals.worker, ...globals.es2022 },
    },
  },

  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.svelte'],
      },
      globals: { ...globals.browser, ...globals.worker, ...globals.es2022 },
    },
  },

  {
    rules: {
      'no-console': 'warn', // Use logger.ts instead
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],

      // Svelte 5 runes — allow $state/$derived/$effect in script blocks
      'svelte/valid-compile': 'warn',
      'svelte/no-unused-svelte-ignore': 'warn',
    },
  },

  {
    ignores: [
      'dist/',
      'node_modules/',
      'public/coi-serviceworker.js',
      'scripts/',
    ],
  },
]
