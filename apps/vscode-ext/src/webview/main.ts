/**
 * main.ts — Webview entry point. Mounts the Svelte 5 root component.
 *
 * No worker-construction setup needed here — packages/engine's
 * duckdbService.ts uses Vite's `?worker&inline` to embed the math worker as
 * a data: URL at build time, which works identically in both hosts. See the
 * comment above getMathWorker() in duckdbService.ts for why (two other
 * approaches were tried and failed in a webview specifically).
 */

import { mount } from 'svelte'
import VscodeApp from './VscodeApp.svelte'
import '@omx-viewer/engine/styles/fonts.css'
import '@omx-viewer/engine/styles/global.css'
import '@omx-viewer/engine/styles/theme.css'
import '@omx-viewer/engine/styles/grid.css'
import '@omx-viewer/engine/styles/animations.css'

mount(VscodeApp, {
  target: document.getElementById('app')!,
})
