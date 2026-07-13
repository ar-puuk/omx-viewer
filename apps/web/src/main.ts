/**
 * main.ts — Vite entry point.
 * Mounts the Svelte 5 root App component into #app.
 */

import { mount } from 'svelte'
import App from './App.svelte'
import '@omx-viewer/engine/styles/fonts.css'
import '@omx-viewer/engine/styles/global.css'
import '@omx-viewer/engine/styles/theme.css'
import '@omx-viewer/engine/styles/grid.css'
import '@omx-viewer/engine/styles/animations.css'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
