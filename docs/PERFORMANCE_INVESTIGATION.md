# Performance Investigation — Grid Loading Extremely Slow

## Symptom
Matrix grid takes 1-2 minutes to display values after file load. The skeleton
placeholders show immediately but cells never populate until a very long wait.
File: skm_w8_0k.omx — 3,629 × 3,629 matrix, 23 matrices, float32.

## Hypotheses (investigate all of these)

### 1. h5wasm reading entire file into memory before slicing
`openOMXFile()` in `h5wasmService.ts` calls `file.arrayBuffer()` which loads
the ENTIRE file into a Uint8Array and writes it to the Emscripten virtual FS.
For a 300-700MB OMX file this is the biggest likely bottleneck — the browser
must allocate and copy hundreds of MB before any matrix data can be read.

**Investigate:** Is there a way to give h5wasm a File/Blob handle directly
instead of loading all bytes? Check if h5wasm supports lazy file access via
`FS.createLazyFile()` or similar Emscripten FS API.

### 2. VirtualGrid fetching on every render cycle
`scheduleRowFetch()` is called inline in the Svelte template on every render.
If Svelte is re-rendering frequently, this could be firing the debounce
constantly and resetting the 50ms timer repeatedly, meaning the actual fetch
never runs.

**Investigate:** Is the debounce working correctly? Add a `console.log` inside
the setTimeout callback to confirm it fires. Check if the $effect or template
re-renders are thrashing the debounce.

### 3. Float64Array conversion on every chunk
In `h5wasmService.ts`, every sliced chunk is converted:
```ts
const chunk = raw instanceof Float64Array ? raw : new Float64Array(raw)
```
For a 200-row × 3,629-col chunk this allocates 200 × 3,629 × 8 = ~5.8MB and
copies each element. For float32 data this is unnecessary — the grid can render
Float32Array directly.

**Investigate:** Skip the Float64Array conversion. Store chunks as their native
dtype (Float32Array for float32 matrices). Update `getCellValue()` in
VirtualGrid to accept Float32Array | Float64Array.

### 4. Wrong chunk alignment — reading too much data
`sliceMatrixRows()` currently fetches `DEFAULT_ROW_CHUNK_SIZE = 200` rows per
call. But if `getAlignedChunkSize()` is not working, it may be fetching the
full HDF5 chunk which could be much larger.

**Investigate:** Log what `dataset.chunks` returns for this file. Log how many
rows are actually being fetched per slice call.

### 5. VirtualGrid not hitting the cache
If `tab.cachedRows` is a Map inside a Svelte `$state` class, mutations to the
Map may not be reactive — Svelte 5 doesn't track Map mutations automatically.
This could mean the grid re-fetches the same chunk every render instead of
returning the cached value.

**Investigate:** Log cache hits vs misses. If every render is a cache miss,
the cache is not working.

### 6. scheduleRowFetch called with wrong row index
The fetch is triggered with `virtualRows[0].index` — the first visible row.
But if virtualRows includes overscan rows above the viewport, `[0].index`
might be negative or 0 always, meaning the fetch always targets chunk 0.

**Investigate:** Log `virtualRows[0].index` and `virtualRows[virtualRows.length-1].index`
to see the actual visible range on scroll.

---

## Investigation Instructions for Claude Code

Read these files in full before doing anything:
- `src/lib/services/h5wasmService.ts`
- `src/lib/components/viewer/VirtualGrid.svelte`
- `src/lib/state/matrixStore.svelte.ts`
- `src/lib/utils/constants.ts`

Then:

1. Add temporary `console.time` / `console.timeEnd` and `console.log` calls to
   measure: (a) how long the initial file load takes vs the first chunk fetch,
   (b) whether the debounce is firing, (c) cache hit/miss ratio.

2. Check if h5wasm supports `FS.createLazyFile()` for streaming access instead
   of loading the full file. If yes, implement it.

3. Fix the Float64Array conversion — store chunks in native dtype.

4. Fix the debounce if it is being reset on every render cycle.

5. Fix the cache if Map mutations are not reactive in Svelte 5.

6. After identifying the root cause, implement the fix and remove the temporary
   logging.

Do not guess — measure first, then fix the confirmed bottleneck.
