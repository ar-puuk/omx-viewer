/**
 * scripts/copy-wasm.js — postinstall for apps/web.
 *
 * h5wasm embeds its WASM binary inline inside dist/esm/hdf5_util.js via a
 * base64-encoded binaryDecode() call — there is no separate .wasm file to
 * copy, the module self-initialises via its exported `ready` promise.
 *
 * coi-serviceworker DOES need copying into public/ so it's served as a
 * static asset. Resolved via require.resolve() rather than a relative
 * node_modules path, since npm workspace hoisting may place it in the
 * workspace root's node_modules rather than apps/web's own.
 */

import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

console.log('[copy-wasm] h5wasm WASM is embedded inline — no copy needed.')

const src = require.resolve('coi-serviceworker/coi-serviceworker.js')
const publicDir = join(__dirname, '..', 'public')
mkdirSync(publicDir, { recursive: true })
copyFileSync(src, join(publicDir, 'coi-serviceworker.js'))
console.log('[copy-wasm] copied coi-serviceworker.js to public/')
