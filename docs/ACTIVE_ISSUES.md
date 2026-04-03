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
- [x] Scroll loads new chunks (vertical scrolling fetches new row chunks on demand)
- [x] Summary panel aggregation (SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO, by row/col, active/all)
- [x] MetadataPanel stats (min/max/mean)

---

## Fixed: Grid Performance (1-2 min delay → instant)

**Symptom:** Grid skeleton appeared immediately but cell values took 1-2 minutes to display for a 3,629×3,629 float32 matrix (23 matrices, ~1.2 GB file).

**Root causes found (2 bugs, 1 improvement):**

| # | Bug | Fix | File |
|---|---|---|---|
| 12 | `scheduleRowFetch()` called inline in template — every Svelte re-render reset the 50ms debounce timer, preventing the fetch from ever firing promptly | Replaced with `onscroll` handler on the scroll container + direct `scrollTop / ROW_HEIGHT` calculation. No Svelte store subscription chain needed. | `VirtualGrid.svelte` |
| 13 | `Map.set()` on `tab.cachedRows` not tracked by Svelte 5 — after data fetched, `getCellValue` returned cached data but Svelte never re-rendered cells | Added `cacheVersion` counter to `AppState`; incremented on every `addChunkToCache`. `getCellValue` reads `store.cacheVersion` to create reactive dependency. | `matrixStore.svelte.ts`, `VirtualGrid.svelte` |
| 14 | Only one chunk fetched per scroll — if visible range spanned two chunks (e.g. rows 180-210 spanning chunks 0 and 200), the second chunk was never requested | Fetch loop now iterates from `firstChunk` to `lastChunk`, loading all chunks needed by the visible range | `VirtualGrid.svelte` |
| 18 | Scrolling didn't load new chunks — `$state` mutations from store subscription callbacks didn't reliably trigger dependent `$effect` re-runs in Svelte 5 | Replaced `rowVirt.subscribe()` → `$state` → `$effect` chain with direct `onscroll` DOM handler. Fetch now triggered by: scroll events, initial load, tab changes, and CellNavigator. | `VirtualGrid.svelte` |

**Investigated but not the primary bottleneck:**
- `file.arrayBuffer()` — loads the full file into memory, but this runs during the loading overlay (before grid shows). It's slow for very large files (~1.2 GB) but not the cause of the post-load delay. `FS.createLazyFile()` is only for HTTP-backed resources, and `WORKERFS` only works in Web Workers (h5wasm must stay on main thread per architecture rules). No fix available; this is inherent to h5wasm's Emscripten FS.
- Float64Array conversion — doubles memory for float32 data (~5.8 MB/chunk) but doesn't cause the rendering delay. Can be optimised separately if memory pressure becomes an issue.
- Chunk alignment — `getAlignedChunkSize()` works correctly; native chunks are respected.

---

## Fixed: DuckDB OOM on Summary Generation

**Symptom:** Clicking Generate in Summary panel with any scope produced: `Failed to insert into table 'DA': could not allocate block of size 256.0 KiB (488.1 MiB/488.2 MiB used)`.

**Root cause:** The aggregation path loaded entire matrices as wide DuckDB tables (3,629 Float64 columns per table). One matrix = ~105 MB in DuckDB. For "All Matrices" scope (23 matrices), that's ~2.4 GB — far beyond DuckDB-Wasm's 512 MB limit. Even a single matrix barely fit after Arrow IPC conversion overhead (~300 MB through the pipeline).

| # | Bug | Fix | File |
|---|---|---|---|
| 15 | `runAggregation` loaded full matrices into DuckDB via Arrow IPC — O(entire_matrix × num_matrices) memory | Replaced with streaming JS aggregation: reads h5wasm row chunks (200×3,629×4 = 2.9 MB each), computes per-row/per-col aggregates in a tight loop. Peak memory: one chunk. Processes one matrix at a time with event-loop yields for UI responsiveness. | `duckdbService.ts` |
| 16 | `computeMatrixStats` registered full matrix in DuckDB just for MIN/MAX/MEAN | Delegates to `h5wasmService.computeBasicStats()` which already streams chunks. No DuckDB needed. | `duckdbService.ts` |
| 17 | DuckDB worker used non-existent `read_ipc_file()` function | Replaced with `conn.insertArrowFromIPCStream()` — the correct DuckDB-Wasm API. (Fixed in prior session, retained for reference.) | `duckdb.worker.ts` |

**New `sliceRawChunk` in h5wasmService.ts:** Bare h5wasm slice — no Float64 conversion, no cache interaction. Returns native TypedArray (Float32Array for float32 data). Used by streaming aggregation.

**Memory comparison (23 matrices, 3,629×3,629 float32):**
| Approach | Peak Memory |
|---|---|
| Old (DuckDB) | ~2.4 GB (all matrices loaded as wide Float64 tables) |
| New (streaming) | ~3 MB per chunk + ~29 KB result per matrix (one at a time) |
| New (MEDIAN by_col, worst case) | ~105 MB (one matrix's columns sorted in-place) |

**DuckDB worker retained** for potential future use. Not invoked by aggregation or stats paths.

---

## Currently Broken / Not Yet Tested

- [ ] **Cell Navigator** — scroll-to-center on both row and column virtualizers.
- [ ] **Pinned cell highlight** — ring distinguishable from hover; row/col headers highlighted.
- [ ] **Cross-matrix cell inspector** — reads `[row, col]` from every matrix, shows in sidebar.
- [ ] **Math worker arithmetic** — ArithmeticModal compute. Transferable Float64Array flow.
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

1. Verify summary panel works for all 7 functions × 2 dimensions × 2 scopes
2. Test Cell Navigator scroll-to-center
3. Test ArithmeticModal with math.worker
4. Test cross-matrix cell inspector
5. Test CSV export
