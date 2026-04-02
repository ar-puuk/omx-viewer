# Pre-Submit Checklist (§15)

Mark items as they are confirmed working.

## Build & Deployment
- [x] Vite base path set to `/omx-viewer/` for GitHub Pages
- [x] COOP/COEP headers in `vite.config.ts` marked DEV SERVER ONLY
- [x] `coi-serviceworker.js` copied to `public/` via postinstall
- [x] `coi-serviceworker.js` is the FIRST script tag in `index.html`
- [x] `npm run deploy` script works end-to-end

## h5wasm / File Loading
- [x] h5wasm loaded lazily (only after file selection)
- [x] h5wasm uses `await ready` + named exports, not a factory function
- [ ] HDF5 native chunk shape read on open; ROW_CHUNK_SIZE aligned dynamically
- [ ] No entire matrix ever loaded into memory at once (always use slice)

## DuckDB Worker
- [x] DuckDB-Wasm initialized in a Web Worker only
- [x] Used for aggregations only (SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO)
- [ ] Summary SQL dynamically constructed from SummaryConfig — not hardcoded
- [ ] "All matrices" scope produces multi-column JOIN query

## Math Worker
- [x] `math.worker.ts` handles all element-wise arithmetic
- [x] Uses Transferable Float64Arrays (zero-copy)
- [x] ArithmeticModal sends data to math.worker, NOT DuckDB

## Summary Panel
- [ ] Dimension/fn/scope dropdowns + Generate button (not toggles)
- [ ] Result rendered as standalone scrollable table, NOT appended to grid
- [ ] "Download CSV" generates Blob URL — no server

## Virtual Grid
- [ ] TanStack Virtual configured for both row AND column virtualization
- [ ] Max 30 rows in DOM simultaneously
- [ ] Max 20 columns in DOM simultaneously
- [ ] LRU cache max 20 chunks per matrix tab
- [ ] 50ms trailing debounce on scroll events
- [ ] No layout thrash — cell dimensions via CSS variables only

## Cell Navigation
- [ ] CellNavigator validates row/col against matrix bounds
- [ ] `scrollToIndex` called with `{ align: 'center' }` on BOTH virtualizers
- [ ] Pinned cell has visible highlight ring (distinguishable from hover)
- [ ] Row header and column header for pinned cell also highlighted

## Cross-Matrix Inspector
- [ ] Cross-matrix cell reads use single-element slice `[[row, row+1], [col, col+1]]`
- [ ] MetadataPanel "Cell Values Across Matrices" shows spinner while loading
- [ ] Each matrix row clickable → switches active tab
- [ ] Pinned cell coordinate preserved when switching tabs

## Svelte 5
- [x] Runes used throughout (`$state`, `$derived`, `$effect`)
- [x] No legacy `writable()` stores
- [x] No `export let x = $state()` with external reassignment

## UI
- [ ] IBM Plex Mono used for all matrix cell values
- [x] Dark theme is default
- [ ] Light theme toggle works

## Error Handling (§10)
- [x] Non-HDF5 file → ErrorBanner shown
- [x] No matrices group → ErrorBanner shown
- [ ] Matrix slice read fails → inline error in grid area
- [ ] DuckDB Worker fails → warning banner, grid still works
- [ ] File too large → proactive warning
- [ ] Matrix dimensions mismatch in arithmetic → disable compute button
