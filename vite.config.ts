import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte()],

  // REQUIRED for GitHub Pages — repository name as base path
  base: '/omx-viewer/',

  // ES module workers required for DuckDB-Wasm
  worker: {
    format: 'es'
  },

  // Exclude packages that ship their own WASM bundles from Vite's dep optimizer.
  // Optimizing these breaks their internal WASM loading logic.
  optimizeDeps: {
    exclude: ['h5wasm', '@duckdb/duckdb-wasm']
  },

  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/lib')
    }
  },

  build: {
    target: 'esnext',
    // Increase chunk size warning limit — DuckDB-Wasm is intentionally large
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      // Treat the coi-serviceworker as external — it's a pre-built script served statically
      external: [/coi-serviceworker/],
      output: {
        // Split DuckDB into its own chunk to keep the main bundle lean
        // manualChunks must be a function in Vite 8 / Rolldown
        manualChunks: (id: string) => {
          if (id.includes('@duckdb/duckdb-wasm')) return 'duckdb'
          if (id.includes('apache-arrow')) return 'arrow'
        }
      }
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
