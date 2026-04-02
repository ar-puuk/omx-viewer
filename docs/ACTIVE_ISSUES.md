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

---

## Currently Broken / Not Yet Tested

- [ ] **VirtualGrid rendering** — matrix data display after successful file parse. Needs testing with real OMX file.
- [ ] **TanStack Virtual column virtualization** — `createVirtualizer` called twice (rows + cols). Verify both active.
- [ ] **Scroll debounce** — 50ms trailing debounce on slice requests. Not confirmed implemented.
- [ ] **LRU chunk cache** — verify chunks are cached and evicted correctly on scroll.
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

1. Test VirtualGrid with a real OMX file — confirm matrix data renders
2. Verify scroll performance (30fps target, 50ms debounce)
3. Test DuckDB Summary panel end-to-end
4. Test ArithmeticModal with math.worker
5. Test cross-matrix cell inspector
6. Add scroll debounce to VirtualGrid if missing
