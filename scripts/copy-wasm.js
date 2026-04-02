/**
 * scripts/copy-wasm.js
 *
 * NOTE: This script is intentionally a no-op.
 *
 * The h5wasm package (current version) embeds its WASM binary inline inside
 * dist/esm/hdf5_util.js via a base64-encoded binaryDecode() call. There is
 * no separate .wasm file to copy — the module self-initialises via its
 * exported `ready` promise with no locateFile configuration needed.
 *
 * If a future version of h5wasm ships a separate .wasm file, this script
 * can be updated to copy it to public/h5wasm/.
 */

console.log('[copy-wasm] h5wasm WASM is embedded inline — no copy needed.')
