/**
 * scripts/copy-codicons.js — prebuild step for apps/vscode-ext.
 *
 * Copies codicon.css + codicon.ttf into public/ as raw, unprocessed static
 * assets (Vite's publicDir mechanism copies these verbatim to dist-webview/,
 * no transform, no minification).
 *
 * Why not `import '@vscode/codicons/dist/codicon.css'` in main.ts like the
 * other stylesheets: confirmed empirically that Vite's build pipeline (CSS
 * minification) corrupts this specific file — codicon.css uses CSS hex
 * escapes for its glyph codepoints (`content: "\ea76"`), and the minified
 * output silently turned every one of them into `content: ""`, so no icons
 * rendered, no build error either. Copying the file unprocessed sidesteps
 * the minifier entirely.
 */

import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const cssSrc = require.resolve('@vscode/codicons/dist/codicon.css')
const ttfSrc = join(dirname(cssSrc), 'codicon.ttf')

const publicDir = join(__dirname, '..', 'public')
mkdirSync(publicDir, { recursive: true })
copyFileSync(cssSrc, join(publicDir, 'codicon.css'))
copyFileSync(ttfSrc, join(publicDir, 'codicon.ttf'))

console.log('[copy-codicons] copied codicon.css + codicon.ttf to public/ (unprocessed)')
