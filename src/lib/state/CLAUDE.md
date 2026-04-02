# State — Implementation Reference

File: `matrixStore.svelte.ts`

---

## Store Pattern (Svelte 5)

### Why a class, not exported $state variables
Svelte 5 forbids reassigning `export let x = $state()` from outside the declaring module.
The solution is a class with `$state` field declarations:

```ts
class AppState {
  file = $state<MatrixFile | null>(null)
  tabs = $state<MatrixTab[]>([])
  // ...methods that mutate state
}

export const store = new AppState()
```

### How components use it
```ts
import { store } from '$lib/state/matrixStore.svelte.js'

// Read reactive state (automatically tracked by Svelte)
store.file
store.tabs
store.activeTab   // getter — computed from tabs + activeTabId

// Call methods to mutate
store.openFile(parsedFile)
store.setActiveTab(tabId)
store.pinCell(row, col)
```

### Derived values as getters (not $derived rune)
`$derived()` cannot be used in class bodies. Use plain getters instead:
```ts
get activeTab() {
  return this.tabs.find(t => t.id === this.activeTabId) ?? null
}
get nrows() { return this.file?.shape[0] ?? 0 }
get ncols() { return this.file?.shape[1] ?? 0 }
get hasFile() { return this.file !== null }
get fileMatrixIds() { return this.tabs.filter(t => !t.isEphemeral).map(t => t.id) }
```

---

## Full State Interface

```ts
// Core types
interface MatrixFile {
  filename: string
  shape: [number, number]      // [nrows, ncols]
  omxVersion: string
  matrixNames: string[]        // dataset names under /data/
  lookups: Record<string, string[]>  // lookup name → zone labels
}

interface MatrixTab {
  id: string                   // matrix name, or "A op B" for ephemeral
  label: string
  isEphemeral: boolean         // true = arithmetic result
  dtype: 'float32' | 'float64' | 'int32'
  cachedRows: Map<number, Float64Array>  // chunkStart → flat Float64Array
  cacheAccessOrder: number[]   // LRU tracking — newest at end
  ephemeralData: Float64Array | null     // full data for arithmetic results
}

interface PinnedCell {
  row: number
  col: number
  valuesPerMatrix: Record<string, number>  // matrixName → scalar value
  isLoading: boolean
}

interface SummaryConfig {
  dimension: 'by_row' | 'by_col'
  fn: 'sum' | 'min' | 'max' | 'mean' | 'median' | 'stddev' | 'count_nonzero'
  scope: 'active' | 'all_matrices'
}

interface SummaryResult {
  config: SummaryConfig
  columnNames: string[]
  rows: Array<Array<number | string>>
  isLoading: boolean
  error: string | null
}

interface AppError {
  id: string
  message: string
  type: 'error' | 'warning'
  dismissible: boolean
}
```

---

## LRU Cache Methods

```ts
// Add a fetched chunk — evicts LRU if over limit
store.addChunkToCache(tabId, chunkStart, data, MAX_CACHED_CHUNKS)

// Record a cache hit — moves key to most-recently-used position
store.touchCacheEntry(tabId, chunkStart)
```

Implementation:
```ts
addChunkToCache(tabId, chunkStart, data, maxChunks) {
  const tab = this.tabs.find(t => t.id === tabId)
  tab.cacheAccessOrder = tab.cacheAccessOrder.filter(k => k !== chunkStart)
  tab.cacheAccessOrder.push(chunkStart)  // newest at end
  tab.cachedRows.set(chunkStart, data)
  while (tab.cacheAccessOrder.length > maxChunks) {
    tab.cachedRows.delete(tab.cacheAccessOrder.shift()!)  // evict oldest
  }
}
```

---

## SessionStorage Persistence

- `omx-viewer:theme` — `'dark'` | `'light'`
- `omx-viewer:summary-config` — JSON-serialized `SummaryConfig`

Both are loaded at class construction time (before any component renders).

---

## Error Banner API

```ts
// Add a banner — returns ID for programmatic dismissal
const id = store.addError('Something went wrong', 'error', true)

// Dismiss by ID
store.dismissError(id)
```

Error banners render in `ErrorBanner.svelte` — fixed position, top-center, stacked.
