/**
 * main.ts — Webview entry point. Mounts the Svelte 5 root component.
 *
 * No worker-construction setup needed here — packages/engine's
 * duckdbService.ts uses Vite's `?worker&inline` to embed the math worker as
 * a data: URL at build time, which works identically in both hosts. See the
 * comment above getMathWorker() in duckdbService.ts for why (two other
 * approaches were tried and failed in a webview specifically).
 *
 * No fonts.css import, unlike apps/web — the vscode theme (theme.css)
 * maps --font-sans/--font-mono to var(--vscode-font-family)/
 * var(--vscode-editor-font-family), so this follows the user's actual
 * configured VS Code font instead of forcing a vendored one.
 *
 * No codicon.css import here either — it's linked directly in extension.ts's
 * HTML template instead, as a raw static asset copied by
 * scripts/copy-codicons.js. See that script's header comment for why: Vite's
 * CSS minifier corrupts codicon.css's glyph escapes if it's allowed to
 * process the file via a JS import.
 */

import { mount } from 'svelte'
import VscodeApp from './VscodeApp.svelte'
import '@omx-viewer/engine/styles/global.css'
import '@omx-viewer/engine/styles/theme.css'
import '@omx-viewer/engine/styles/grid.css'
import '@omx-viewer/engine/styles/animations.css'

mount(VscodeApp, {
  target: document.getElementById('app')!,
})
