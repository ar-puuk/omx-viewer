# Active Issues & Development Status

Last updated: 2026-04-02

---

## Status: File Loading Works ✓

The following bugs have been fixed:

| # | Bug | Fix Applied | File |
|---|---|---|---|
| 1 | `manualChunks` must be a function in Vite 8/Rolldown | Changed to `(id) => {...}` | `vite.config.ts` |
| 2 | `coi-serviceworker` bundling error | Added `external: [/coi-serviceworker/]` | `vite.config.ts` |
| 3 | `Cannot export state that is reassigned` | Refactored to `class AppState` singleton | `matrixStore.svelte.ts` |
| 4 | `$state()` invalid inside `$derived` | Removed wrapping, call TanStack methods directly | `VirtualGrid.svelte` |
| 5 | `Cannot bind to import` | Changed to `value=` + `oninput=` handler | `CellNavigator.svelte` |
| 6 | `Cannot assign to import 'duckdbReady'` | Changed `import * as store` to `import { store }` | `duckdbService.ts` |
| 7 | `<button> cannot have role='listitem'` | Changed to `<div role="listitem" tabindex="0">` | `MetadataPanel.svelte` |
| 8 | `state_referenced_locally` in ArithmeticModal | Initialise via `$effect` instead of inline `$state()` | `ArithmeticModal.svelte` |
| 9 | `"./esm" not exported under browser conditions` | Changed to `import('h5wasm')` + `await h5wasm.ready` | `h5wasmService.ts` |
| 10 | `is not a function` at file open | h5wasm has no factory — uses `ready` promise + named exports | `h5wasmService.ts` |
| 11 | `No matrices found` error | OMX files use `data` group (not `matrices`) and uppercase attrs `SHAPE`, `OMX_VERSION` | `constants.ts`, `omxParser.ts` |

---

## Currently Working

- [x] App builds and deploys to GitHub Pages
- [x] Landing page renders
- [x] File drag-and-drop validates magic bytes
- [x] h5wasm initialises correctly
- [x] OMX file structure parsed (group name `data`, attrs `SHAPE`/`OMX_VERSION`)
- [x] Matrix tabs created per dataset
- [x] VirtualGrid renders matrix data after file parse
- [x] LRU chunk cache works correctly with scroll

---

## Fixed: Grid Performance (1-2 min delay → instant)

**Symptom:** Grid skeleton appeared immediately but cell values took 1-2 minutes to display for a 3,629×3,629 float32 matrix (23 matrices, ~1.2 GB file).

**Root causes found (2 bugs, 1 improvement):**

| # | Bug | Fix | File |
|---|---|---|---|
| 12 | `scheduleRowFetch()` called inline in template — every Svelte re-render reset the 50ms debounce timer, preventing the fetch from ever firing promptly | Replaced with `$effect`-based subscription to rowVirt store + `$effect` cleanup for debounce. Fetch trigger is now decoupled from render cycle. | `VirtualGrid.svelte` |
| 13 | `Map.set()` on `tab.cachedRows` not tracked by Svelte 5 — after data fetched, `getCellValue` returned cached data but Svelte never re-rendered cells | Added `cacheVersion` counter to `AppState`; incremented on every `addChunkToCache`. `getCellValue` reads `store.cacheVersion` to create reactive dependency. | `matrixStore.svelte.ts`, `VirtualGrid.svelte` |
| 14 | Only one chunk fetched per scroll — if visible range spanned two chunks (e.g. rows 180-210 spanning chunks 0 and 200), the second chunk was never requested | Fetch loop now iterates from `firstChunk` to `lastChunk`, loading all chunks needed by the visible range | `VirtualGrid.svelte` |

**Investigated but not the primary bottleneck:**
- `file.arrayBuffer()` — loads the full file into memory, but this runs during the loading overlay (before grid shows). It's slow for very large files (~1.2 GB) but not the cause of the post-load delay. `FS.createLazyFile()` is only for HTTP-backed resources, and `WORKERFS` only works in Web Workers (h5wasm must stay on main thread per architecture rules). No fix available; this is inherent to h5wasm's Emscripten FS.
- Float64Array conversion — doubles memory for float32 data (~5.8 MB/chunk) but doesn't cause the rendering delay. Can be optimised separately if memory pressure becomes an issue.
- Chunk alignment — `getAlignedChunkSize()` works correctly; native chunks are respected.

---

## Currently Broken / Not Yet Tested

- [ ] **Cell Navigator** — scroll-to-center on both row and column virtualizers.
- [ ] **Pinned cell highlight** — ring distinguishable from hover; row/col headers highlighted.
- [ ] **Cross-matrix cell inspector** — reads `[row, col]` from every matrix, shows in sidebar.
- [ ] **DuckDB aggregation** — Summary panel Generate button. SQL generation for all 28 combinations.
- [ ] **Math worker arithmetic** — ArithmeticModal compute. Transferable Float64Array flow.
- [ ] **MetadataPanel stats** — min/max/mean via DuckDB with h5wasm fallback.
- [ ] **CSV export** — both summary table and grid slice exports.
- [ ] **Theme toggle** — dark/light switch persisted to sessionStorage.

---

## Known Architectural Decisions

### h5wasm API (critical — differs from npm README)
```ts
// CORRECT:
import { ready, File as H5File, FS } from 'h5wasm'
await ready
const h5file = new H5File('/work/file.omx', 'r')

// WRONG (h5wasm has no factory function):
const mod = await h5wasm({ locateFile: ... })
```

### OMX File Group Names (real-world files differ from spec)
The original spec says `/matrices/` but real OMX files use `/data/`. The parser now:
1. Searches case-insensitively: `data`, `matrices`, or any variant
2. Falls back to inferring shape from first dataset if root `SHAPE` attr is missing

### Store Pattern
```ts
// matrixStore.svelte.ts exports:
export const store = new AppState()  // class with $state fields

// Components use:
import { store } from '$lib/state/matrixStore.svelte.js'
store.file       // read reactive state
store.openFile() // call methods
```

---

## Next Steps (priority order)

1. Verify grid performance fix — values should appear within ~100ms of file load completing
2. Test scroll performance (30fps target, 50ms debounce is now properly implemented)
3. Test Cell Navigator scroll-to-center
4. Test DuckDB Summary panel end-to-end
5. Test ArithmeticModal with math.worker
6. Test cross-matrix cell inspector
