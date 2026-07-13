/**
 * scripts/copy-changelog.js — prebuild step for apps/vscode-ext.
 *
 * Copies the repo-root CHANGELOG.md into apps/vscode-ext/CHANGELOG.md so the
 * Marketplace renders it as the extension's "Changelog" tab. The root file is
 * the single source of truth (covers the web app, extension, and shared
 * engine together, since they now version in lockstep) — this copy is a
 * gitignored build artifact, same pattern as public/codicon.css.
 */

import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const src = join(__dirname, '..', '..', '..', 'CHANGELOG.md')
const dest = join(__dirname, '..', 'CHANGELOG.md')

copyFileSync(src, dest)

console.log('[copy-changelog] copied root CHANGELOG.md to apps/vscode-ext/CHANGELOG.md')
