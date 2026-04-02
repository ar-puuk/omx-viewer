/**
 * main.ts — Vite entry point.
 * Mounts the Svelte 5 root App component into #app.
 */

import { mount } from 'svelte'
import App from './App.svelte'
import './styles/global.css'
import './styles/theme.css'
import './styles/grid.css'
import './styles/animations.css'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
