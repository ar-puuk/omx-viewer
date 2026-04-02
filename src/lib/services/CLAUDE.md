# Services — Implementation Reference

Files: `omxParser.ts`, `h5wasmService.ts`, `duckdbService.ts`

---

## h5wasm API (critical — read before touching h5wasmService.ts)

### Correct initialisation pattern
```ts
import { ready, File as H5File, FS } from 'h5wasm'

// h5wasm self-initialises — WASM is embedded inline in the package.
// No factory function. No locateFile callback. Just await ready.
await ready
// Now H5File and FS are usable.
```

### File open + virtual FS
```ts
// Write browser File bytes into Emscripten virtual FS
FS.mkdirTree('/work')           // may throw if exists — wrap in try/catch
FS.writeFile('/work/file.omx', new Uint8Array(await file.arrayBuffer()))

// Open
const h5file = new H5File('/work/file.omx', 'r')
```

### Keys and attrs
```ts
h5file.keys()          // returns string[] of top-level group/dataset names
h5file.attrs           // object with lazy Attribute getters
h5file.attrs['SHAPE'].value  // reads the attribute value (TypedArray or scalar)
h5file.get('data')     // returns Group | Dataset | null
group.keys()           // names of children
group.get('TAZ_AUTO')  // returns Dataset
```

### Slicing (NEVER load full matrix)
```ts
const dataset = h5file.get('data/TAZ_AUTO')
// slice([[rowStart, rowEnd], [0, ncols]]) — rowEnd is exclusive
const chunk = dataset.slice([[0, 200], [0, ncols]])
// returns Float32Array | Float64Array | Int32Array depending on dtype
```

### Single cell read (for cross-matrix inspector)
```ts
const val = dataset.slice([[row, row + 1], [col, col + 1]])[0]
```

### Dataset properties
```ts
dataset.dtype    // string e.g. 'float32', 'float64'
dataset.shape    // number[] e.g. [1000, 1000]
dataset.chunks   // number[] | null — native HDF5 chunk shape
```

---

## OMX Parsing (omxParser.ts)

### Real-world OMX file structure
```
Root keys:    ['data', 'lookup']       ← NOT 'matrices'
Root attrs:   ['SHAPE', 'OMX_VERSION'] ← uppercase
data keys:    ['TAZ_AUTO', 'TAZ_TRANSIT', ...]
lookup keys:  ['zone_ids', ...]        ← optional zone labels
```

### Group name resolution (case-insensitive)
```ts
const matricesKey = topLevel.find(k =>
  k === MATRICES_GROUP ||          // 'data' (constants.ts)
  k.toLowerCase() === 'matrices' || // fallback
  k.toLowerCase() === 'data'        // fallback
)
```

### Shape inference fallback
If `SHAPE` root attribute is missing, infer from first dataset:
```ts
const ds = h5file.get(`data/${matrixNames[0]}`) as any
shape = [Number(ds.shape[0]), Number(ds.shape[1])]
```

### extractMatrixNames
```ts
// item.type values: 'Dataset' | 'Group' (from OBJECT_TYPE enum)
for (const key of matricesGroup.keys()) {
  const item = matricesGroup.get(key)
  if (item?.type === 'Dataset') names.push(key)
}
```

---

## Chunked Loading (h5wasmService.ts)

### Chunk alignment
```ts
// Read native HDF5 chunk shape on open
const chunks = dataset.chunks  // e.g. [100, 100] or null
const chunkSize = chunks ? Math.max(chunks[0], DEFAULT_ROW_CHUNK_SIZE) : DEFAULT_ROW_CHUNK_SIZE
```

### Fetch + cache pattern
```ts
const chunkStart = Math.floor(rowStart / chunkSize) * chunkSize

if (tab.cachedRows.has(chunkStart)) {
  // cache hit — update LRU order
  store.touchCacheEntry(tabId, chunkStart)
  return extractSubrange(tab.cachedRows.get(chunkStart), ...)
}

// cache miss — fetch
const raw = dataset.slice([[chunkStart, chunkStart + chunkSize], [0, ncols]])
const data = raw instanceof Float64Array ? raw : new Float64Array(raw)
store.addChunkToCache(tabId, chunkStart, data, MAX_CACHED_CHUNKS)
```

### LRU eviction
- `tab.cacheAccessOrder: number[]` — newest at end
- On access: remove key from array, push to end
- On insert: if `length > MAX_CACHED_CHUNKS`, shift() and delete from Map

---

## duckdbService.ts — Main-thread API

### Worker message types
```
Main → Worker:
  { type: 'duckdb:init' }
  { type: 'duckdb:register_batch', id, tableName, ipc, isFirst }
  { type: 'duckdb:drop_table', tableName }
  { type: 'duckdb:query', id, sql?, config? }

Worker → Main:
  { type: 'duckdb:init:ok' }
  { type: 'duckdb:init:error', error }
  { type: 'duckdb:register:ok', id }
  { type: 'duckdb:query:result', id, ipc }
  { type: 'duckdb:query:error', id, error }
```

### Registration flow for aggregation
1. `sliceFullMatrix()` — reads entire matrix in chunks (for DuckDB only)
2. `matrixToArrowIPCBatches()` — splits into 500-row Arrow IPC batches
3. Send each batch as `duckdb:register_batch` (isFirst=true for first, false for rest)
4. Send `duckdb:query` with config object for dynamic SQL
5. Parse Arrow IPC result with `arrowIPCToRows()`
6. Send `duckdb:drop_table` to free DuckDB memory

### Math worker (element-wise arithmetic only)
```ts
// Transferable — zero copy
mathWorker.postMessage(
  { type: 'math:compute', id, a: Float64Array, b: Float64Array, op: 'subtract' },
  [a.buffer, b.buffer]
)
// Result comes back as { type: 'math:result', id, result: Float64Array }
```
