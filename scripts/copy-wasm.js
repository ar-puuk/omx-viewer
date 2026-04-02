/**
 * scripts/copy-wasm.js
 *
 * Postinstall script. Copies the h5wasm WebAssembly binary from
 * node_modules/h5wasm/dist/ to public/h5wasm/ so Vite can serve it
 * as a static asset at the /omx-viewer/h5wasm/ path used in
 * h5wasmService.ts's locateFile callback.
 *
 * Run automatically via `postinstall` in package.json.
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const srcDir = join(rootDir, 'node_modules', 'h5wasm', 'dist')
const destDir = join(rootDir, 'public', 'h5wasm')

// Bail gracefully if h5wasm isn't installed yet (e.g., first `npm install` run
// before the package tree is fully resolved). npm will re-run postinstall.
if (!existsSync(srcDir)) {
  console.warn('[copy-wasm] h5wasm/dist not found — skipping WASM copy.')
  process.exit(0)
}

// Ensure destination directory exists
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true })
  console.log(`[copy-wasm] Created directory: public/h5wasm/`)
}

// Copy all .wasm and .js files from h5wasm/dist to public/h5wasm/
const files = readdirSync(srcDir)
let copied = 0

for (const file of files) {
  if (file.endsWith('.wasm') || file.endsWith('.worker.js')) {
    const src = join(srcDir, file)
    const dest = join(destDir, file)
    copyFileSync(src, dest)
    console.log(`[copy-wasm] Copied: ${file} → public/h5wasm/${file}`)
    copied++
  }
}

if (copied === 0) {
  console.warn('[copy-wasm] Warning: no .wasm files found in h5wasm/dist. Check h5wasm package version.')
} else {
  console.log(`[copy-wasm] Done — ${copied} file(s) copied to public/h5wasm/`)
}
