import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],

  // REQUIRED for GitHub Pages — repository name as base path
  base: '/omx-viewer/',

  worker: {
    format: 'es'
  },

  // h5wasm ships its own WASM bundle — optimizing it breaks internal loading logic.
  optimizeDeps: {
    exclude: ['h5wasm']
  },

  build: {
    target: 'esnext',
    rollupOptions: {
      // Treat the coi-serviceworker as external — it's a pre-built script served statically
      external: [/coi-serviceworker/]
    }
  },

  server: {
    headers: {
      // DEV SERVER ONLY — GitHub Pages cannot serve custom HTTP headers.
      // For production, coi-serviceworker (copied to public/ via postinstall)
      // injects these client-side via a Service Worker so SharedArrayBuffer
      // and other cross-origin isolation features work on gh-pages without
      // any server configuration.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
