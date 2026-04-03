# Performance Investigation — Grid Loading & Scrolling

## Resolved Issues

### Issue 1: Grid takes 1-2 minutes to display values after file load
**File:** skm_w8_0k.omx — 3,629 × 3,629 matrix, 23 matrices, float32.

**Root causes found and fixed:**

| # | Hypothesis | Result | Fix |
|---|---|---|---|
| 1 | `file.arrayBuffer()` loads entire file before h5wasm can slice | Secondary — runs during loading overlay, not the post-load delay. `FS.createLazyFile()` is HTTP-only; `WORKERFS` requires a worker. No fix available. | N/A |
| 2 | `scheduleRowFetch()` called inline in template resets debounce every render | **Confirmed root cause.** Every Svelte re-render reset the 50ms timer, preventing the fetch from ever firing promptly. | Replaced with `onscroll` handler on the scroll container. |
| 3 | Float64Array conversion on every chunk | Secondary — doubles memory per chunk but doesn't cause delay. | Not yet addressed (low priority). |
| 4 | Wrong chunk alignment reading too much data | Not confirmed — `getAlignedChunkSize()` works correctly. | N/A |
| 5 | Map mutations not reactive in Svelte 5 | **Confirmed root cause.** `tab.cachedRows.set()` is invisible to Svelte 5's proxy. Grid never re-rendered after data was fetched. | Added `cacheVersion` counter to AppState, incremented on every `addChunkToCache`. `getCellValue` reads it. |
| 6 | scheduleRowFetch called with wrong row index | Not confirmed — was secondary to hypothesis 2. | N/A |

### Issue 2: Scrolling doesn't load new chunks
**Symptom:** Initial chunk loads fine, but vertical/horizontal scrolling leaves cells empty.

**Root cause:** The Svelte 5 `$effect` subscription chain (`rowVirt.subscribe()` → set `$state` → trigger fetch `$effect`) was unreliable. Setting `$state` variables from within a Svelte store subscription callback (which runs outside Svelte's reactive tracking context) did not reliably trigger dependent `$effect` re-runs.

**Fix:** Replaced the subscription chain with a direct `onscroll` DOM event handler on the scroll container. The handler debounces (50ms), then computes the visible row range directly from `scrollTop / ROW_HEIGHT` — no dependency on TanStack Virtual or Svelte store subscriptions for the fetch path. Data fetching is now triggered by:
1. **Scroll events** — `onscroll` handler with 50ms debounce
2. **Initial load** — called from the virtualizer creation `$effect`
3. **Tab changes** — `$effect` watching `store.activeTabId`
4. **CellNavigator** — called after `scrollToIndex` completes

**Horizontal scrolling** was never a fetch issue — row chunks already contain all columns (`[0, ncols]`). The display problem was the same Svelte 5 reactivity issue (Map mutations + `cacheVersion`) that affected vertical scrolling.

### Issue 3: DuckDB OOM on summary generation
**Symptom:** `could not allocate block of size 256.0 KiB (488.1 MiB/488.2 MiB used)`

**Root cause:** DuckDB-Wasm has a 512 MB limit. Loading a 3,629-column matrix as a wide DuckDB table consumed ~105 MB per matrix. 23 matrices = ~2.4 GB → OOM.

**Fix:** Replaced DuckDB-based aggregation with streaming JS computation. Reads h5wasm row chunks (200 × 3,629 × 4 bytes ≈ 2.9 MB) and computes per-row/per-col aggregates in tight loops. Peak memory: one chunk. Also fixed `computeMatrixStats` to use h5wasm streaming directly.
