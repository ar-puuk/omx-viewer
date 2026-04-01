# CLAUDE.md — OMX Matrix Viewer: Full Project Blueprint

> You are a Senior Principal Frontend and WebAssembly Architect.
> Your task is to generate the complete, production-ready source code for this project
> exactly as specified. Do not abbreviate, skip files, or defer implementation.
> Every file listed in the File Structure section must be fully implemented.
> Read this entire document before writing a single line of code.

---

## 1. Project Identity

| Field | Value |
|---|---|
| **Repository Name** | `omx-viewer` |
| **Tagline** | Browser-native OMX / HDF5 matrix explorer — no server, no upload, no limits |
| **Hosting** | GitHub Pages (static, serverless) |
| **Deployment Branch** | `gh-pages` via Vite build output |
| **License** | MIT |

---

## 2. What This Application Does

A fully client-side, static web application that allows transportation planners, data scientists, and engineers to upload and interactively explore **OMX (Open Matrix Format) files** — which are HDF5-based binary files containing one or more named float/int matrices, plus optional lookup tables.

Files can range from **300 MB to 700 MB**. All processing happens entirely in the browser using WebAssembly. No data ever leaves the user's machine. No backend. No server.

### Core Features (must be fully implemented)

1. **File Import** — Drag-and-drop or click-to-browse for a single `.omx` or `.h5` file.
2. **OMX Structure Parsing** — Read the HDF5 structure: discover all datasets under `/matrices/`, read shape metadata (rows × cols), and read zone lookup tables from `/lookup/`.
3. **Matrix Tab Navigation** — Each matrix inside the OMX file appears as a separate clickable tab. The active tab renders that matrix.
4. **Virtualized Matrix Grid** — Display matrix data in a high-performance virtualized grid. Only visible rows and columns are rendered in the DOM at any time. Support matrices up to 10,000 × 10,000 without crashing the browser.
5. **Chunked / Lazy Loading** — Never load an entire matrix at once. Slice only the rows visible in the viewport using h5wasm's `slice()` API. Load additional rows on scroll.
6. **Aggregation Summary Table** — A dedicated panel (not appended to the matrix grid) that generates a 1D summary table on demand. The user configures three options before generating:
   - **Dimension:** "By Row" (aggregate across columns → one value per row/zone) or "By Column" (aggregate across rows → one value per column/zone)
   - **Function:** `SUM`, `MIN`, `MAX`, `MEAN`, `MEDIAN`, `STD DEV`, `COUNT NON-ZERO` — all executed via DuckDB-Wasm SQL so no hand-rolled aggregation math is needed
   - **Matrix Scope:** "Active matrix only" (produces a 2-column table: index + value) or "All matrices" (produces a multi-column comparison table: index + one column per matrix, e.g. TAZ_AUTO | TAZ_TRANSIT | TAZ_WALK). The multi-matrix output is the primary use case — it lets users compare e.g. total outbound trips by zone across all modes in one view.

   The result is displayed in a scrollable table below or beside the matrix grid. It is lightweight (N rows × a few columns) and can be regenerated at any time with different settings. A **Download CSV** button exports the current summary table. The summary panel has its own header showing the configuration used to generate it (e.g. "SUM by Row · All Matrices").
7. **Matrix Arithmetic** — A modal or panel where the user can select two matrices from the same file and apply add / subtract / multiply / divide element-wise. Result is displayed as a new temporary tab labeled e.g. `TAZ_AUTO - TAZ_TRANSIT`.
8. **Value Formatting** — Numbers displayed with locale-aware formatting, configurable decimal places (0, 2, 4, 6). Large numbers use compact notation option.
9. **Cell Click Inspection** — Clicking a cell shows a small tooltip/popover with: row index, column index, row label (if lookup exists), column label (if lookup exists), and raw value.
10. **Cell Navigator** — A compact input widget in the toolbar with two number fields: "Row" and "Col". When the user submits (Enter key or a Go button), the grid programmatically scrolls to center that cell in the viewport and highlights it with a distinct ring/outline. The row and column header for that position are also highlighted. Input is validated against the matrix bounds; out-of-range values show an inline error.
11. **Cross-Matrix Cell Inspector** — The collapsible sidebar panel contains a dedicated section titled "Cell Values Across Matrices". When any cell is pinned (via click or the Cell Navigator), this section reads the value at that exact `[row, col]` position from **every matrix** in the OMX file and displays them in a compact list: `[matrix name] → [formatted value]`. Since all matrices in an OMX file share the same zone dimensions, a single `[row, col]` coordinate is meaningful across all matrices simultaneously. Each row in the list is clickable to switch to that matrix tab while preserving the pinned cell position.

### Optional / Stretch Features (implement if clean to do so)

- Export current matrix view (visible slice) to CSV — distinct from summary table CSV export which is a core feature.
- Dark / Light theme toggle.
- Persist last-used summary configuration (dimension + function + scope) in `sessionStorage` so it survives tab switches.

---

## 3. Finalized Technology Stack

Every technology choice below is final. Do not substitute alternatives.

| Layer | Technology | Version / Notes |
|---|---|---|
| **Build Tool** | Vite | Latest stable. Configure for GitHub Pages base path. |
| **UI Framework** | Svelte 5 | Use runes (`$state`, `$derived`, `$effect`) not legacy stores |
| **HDF5 / OMX Parsing** | h5wasm | `npm install h5wasm`. Load via `h5wasm/esm`. |
| **Virtualized Grid** | TanStack Virtual (`@tanstack/svelte-virtual`) | Row + column virtualization (2D) |
| **Analytics / Math** | DuckDB-Wasm (`@duckdb/duckdb-wasm`) | Used for aggregations and arithmetic — initialized in a Web Worker |
| **Styling** | Pure CSS with CSS custom properties | No Tailwind. No CSS-in-JS. A single `src/styles/` directory. |
| **Type Safety** | TypeScript | Strict mode. All files `.ts` or `.svelte` with `<script lang="ts">` |
| **Linting** | ESLint + `eslint-plugin-svelte` | Standard config |
| **Deployment** | `vite build` → `gh-pages` npm package | `npm run deploy` script |

---

## 4. Architecture Deep-Dive

### 4.1 Thread Model

```
Main Thread (UI)
│
├── Svelte 5 Reactive UI
│   ├── FileDropZone component
│   ├── MatrixTabBar component
│   ├── VirtualGrid component (TanStack Virtual)
│   └── ArithmeticModal component
│
├── h5wasm (runs on main thread — h5wasm is synchronous after init)
│   ├── Parses HDF5 structure
│   ├── Reads matrix shape / dtype / chunks
│   └── Slices row chunks on demand (lazy loading)
│
└── Web Worker: duckdb.worker.ts
    ├── Hosts DuckDB-Wasm instance
    ├── Receives Arrow IPC buffers from main thread
    ├── Registers them as DuckDB tables
    └── Executes SQL: SUM, arithmetic, min/max/mean
        Returns results as Arrow IPC back to main thread
```

**Why this split?** h5wasm's slice reads are fast and synchronous after init — keeping them on the main thread avoids postMessage serialization overhead for every scroll event. DuckDB's initialization is heavy (~3MB Wasm) and its computations are potentially slow, so it lives in a Worker and never blocks the UI.

### 4.2 OMX File Schema

OMX is a convention layered on HDF5. The structure is:

```
file.omx (HDF5)
├── /matrices/
│   ├── TAZ_AUTO        (float32 or float64, shape: [N, N])
│   ├── TAZ_TRANSIT     (float32 or float64, shape: [N, N])
│   └── TAZ_WALK        (...)
├── /lookup/
│   ├── zone_labels     (string array, length N)
│   └── ...             (other lookup tables)
└── Attributes on root:
    └── omx_version     (string, e.g. "0.2")
        shape           (int array, e.g. [1000, 1000])
```

Your parser must:

- Open the file with h5wasm
- Read root attribute `shape` to get matrix dimensions
- Enumerate all datasets under `/matrices/` to get matrix names
- Read `/lookup/` contents if present (use for row/col labels)
- Never read an entire matrix dataset — always use `.slice([[rowStart, rowEnd], [0, ncols]])` for lazy loading

### 4.3 Data Flow: Rendering a Matrix View

```
User clicks matrix tab "TAZ_AUTO"
    │
    ▼
MatrixStore.setActiveMatrix("TAZ_AUTO")
    │
    ▼
VirtualGrid calculates visible row range [startRow, endRow]
    │
    ▼
h5wasmService.sliceRows("TAZ_AUTO", startRow, endRow)
    → calls h5file.get("matrices/TAZ_AUTO").slice([[startRow, endRow], [0, ncols]])
    → returns Float32Array or Float64Array
    │
    ▼
VirtualGrid renders only those rows
    (TanStack Virtual manages DOM recycling)
    │
    ▼
On scroll → repeat slice for new visible range
```

### 4.4 Data Flow: Aggregation Summary Table

The summary table is generated entirely in DuckDB-Wasm. It never appends data to the matrix grid — it produces an independent result displayed in the SummaryPanel component.

```
User opens SummaryPanel, configures:
    Dimension = "By Row", Function = "MEAN", Scope = "All Matrices"
    Clicks "Generate"
    │
    ▼
summaryResult.isLoading = true  →  SummaryPanel shows spinner
    │
    ▼
For each matrix in scope (or just active matrix):
    h5wasm slices the full matrix in ROW_CHUNK_SIZE batches
    Each batch converted to Arrow IPC → postMessage to duckdb.worker.ts
    Worker appends to a DuckDB table named after the matrix
    (chunked registration avoids loading 700MB at once)
    │
    ▼
Worker executes the aggregation SQL.
Examples (DuckDB syntax — all are built-in functions):

  "By Row" / SUM (active matrix only):
  SELECT _row AS idx, SUM(c0 + c1 + ... + cN) AS value
  FROM TAZ_AUTO GROUP BY _row ORDER BY _row

  "By Row" / MEAN (all matrices — multi-column output):
  SELECT a._row AS idx,
         AVG(a.c0 + ... + a.cN) / {ncols} AS TAZ_AUTO,
         AVG(b.c0 + ... + b.cN) / {ncols} AS TAZ_TRANSIT,
         AVG(c.c0 + ... + c.cN) / {ncols} AS TAZ_WALK
  FROM TAZ_AUTO a JOIN TAZ_TRANSIT b ON a._row = b._row
                  JOIN TAZ_WALK c    ON a._row = c._row
  ORDER BY idx

  MEDIAN uses DuckDB's built-in MEDIAN() aggregate.
  STDDEV uses STDDEV_POP().
  COUNT NON-ZERO uses COUNT(*) FILTER (WHERE val != 0) pattern.

    │
    ▼
Worker posts result as Arrow IPC back to main thread
    │
    ▼
Main thread parses Arrow IPC → summaryResult.rows + summaryResult.columnNames
summaryResult.isLoading = false
    │
    ▼
SummaryPanel renders result as a lightweight scrollable table
(N rows is manageable — no virtualizer needed, max ~10k rows)
    │
    ▼
User clicks "Download CSV" → generates CSV from summaryResult.rows client-side,
triggers browser download via Blob URL — no server involved
```

**SQL generation note:** The worker's `duckdb.worker.ts` must accept a structured message describing the aggregation (dimension, fn, scope, matrix names, ncols) and dynamically construct the appropriate SQL string. Do not hardcode query strings — build them programmatically from the config object so any combination of dimension × function × scope works correctly.

### 4.5 Matrix Arithmetic Flow

Element-wise arithmetic is handled by `math.worker.ts` (plain Web Worker with TypedArrays), NOT DuckDB. DuckDB is only used for aggregations. See Section 7.6 for the rationale.

```
User opens ArithmeticModal
    Selects: Matrix A = "TAZ_AUTO", Op = "subtract", Matrix B = "TAZ_TRANSIT"
    Clicks "Compute"
    │
    ▼
Main thread slices both full matrices from h5wasm
(chunked in sequence to avoid OOM — process in ROW_CHUNK_SIZE batches if needed)
    │
    ▼
postMessage({ a: Float64Array, b: Float64Array, op: 'subtract' }, [a.buffer, b.buffer])
→ math.worker.ts   (Transferable buffers — zero-copy)
    │
    ▼
Worker: tight loop result[i] = a[i] - b[i]
postMessage({ result: Float64Array }, [result.buffer])   (Transferable back)
    │
    ▼
Result stored in MatrixStore as ephemeral matrix "TAZ_AUTO - TAZ_TRANSIT"
New tab appears and is auto-selected
```

### 4.6 Data Flow: Cell Navigator + Cross-Matrix Inspector

These two features share a single "pinned cell" concept in state. A cell becomes pinned either by direct click on the grid or by submitting the navigator inputs.

```
[Path A] User clicks a grid cell at [row=42, col=7]
[Path B] User types row=42, col=7 in CellNavigator and presses Go
    │
    ▼ (both paths converge here)
MatrixStore.pinCell(row=42, col=7)
    │
    ├─► VirtualGrid.scrollToCell(42, 7)
    │       Uses rowVirtualizer.scrollToIndex(42, { align: 'center' })
    │       Uses colVirtualizer.scrollToIndex(7,  { align: 'center' })
    │       Applies CSS highlight class to the target cell
    │       Highlights row header index 42 and column header index 7
    │
    └─► Cross-matrix read (runs for all non-ephemeral matrices):
            For each matrixName in file.matrixNames:
                h5wasmService.sliceCell(matrixName, row=42, col=7)
                → dataset.slice([[42, 43], [7, 8]])[0]   ← single scalar
            Collected into pinnedCell.valuesPerMatrix
            Sets pinnedCell.isLoading = false when complete
    │
    ▼
MetadataPanel re-renders "Cell Values Across Matrices" section:
    TAZ_AUTO     →  1,432.50
    TAZ_TRANSIT  →    287.10
    TAZ_WALK     →     12.40
    (each row clickable → switches active tab, cell stays pinned)
```

**Key implementation note:** `sliceCell` is a single-element slice — `dataset.slice([[row, row+1], [col, col+1]])` — and returns a TypedArray of length 1. This is extremely fast (reading one HDF5 chunk) and all N matrix reads can be issued sequentially in a loop without blocking the UI because h5wasm reads are synchronous and very cheap for a single cell. Set `pinnedCell.isLoading = true` before the loop and `false` after so the sidebar shows a spinner during the read.

Use a single global state module at `src/lib/state/matrixStore.svelte.ts`.

```typescript
// Shape of global state — implement this exactly
interface MatrixFile {
  filename: string;
  shape: [number, number];         // [nrows, ncols]
  omxVersion: string;
  matrixNames: string[];           // names of all matrices
  lookups: Record<string, string[]>; // lookup table name → string array
}

interface MatrixTab {
  id: string;                      // unique: matrix name or "A op B"
  label: string;                   // display name
  isEphemeral: boolean;            // true = result of arithmetic, not in file
  dtype: 'float32' | 'float64' | 'int32';
  cachedRows: Map<number, Float32Array | Float64Array>; // row index → row data
}

type AggregationFunction = 'sum' | 'min' | 'max' | 'mean' | 'median' | 'stddev' | 'count_nonzero'
type AggregationDimension = 'by_row' | 'by_col'
type AggregationScope = 'active' | 'all_matrices'

interface SummaryConfig {
  dimension: AggregationDimension
  fn: AggregationFunction
  scope: AggregationScope
}

interface SummaryResult {
  config: SummaryConfig           // config that produced this result
  // Column names: 'index' (+ optional label) + one value col per matrix in scope
  columnNames: string[]
  // rows[i] is one row of the output table, values align with columnNames
  rows: Array<Array<number | string>>
  isLoading: boolean
  error: string | null
}

interface PinnedCell {
  row: number;                     // 0-based row index
  col: number;                     // 0-based column index
  valuesPerMatrix: Record<string, number>; // matrixName → scalar value at [row, col]
  isLoading: boolean;              // true while cross-matrix reads are in flight
}

interface AppState {
  file: MatrixFile | null;
  tabs: MatrixTab[];
  activeTabId: string | null;
  isLoading: boolean;
  loadingMessage: string;
  decimalPlaces: number;           // 0 | 2 | 4 | 6
  summaryConfig: SummaryConfig;    // current user-selected summary configuration
  summaryResult: SummaryResult | null; // null = not yet generated
  summaryPanelOpen: boolean;       // whether the summary panel is visible
  theme: 'dark' | 'light';
  pinnedCell: PinnedCell | null;   // null = no cell currently pinned
  navigatorRow: string;            // raw string value of the row input field
  navigatorCol: string;            // raw string value of the col input field
}
```

All state must be declared with Svelte 5 `$state()` rune. Derived values (e.g., `activeTab`) must use `$derived()`. Side effects (e.g., triggering DuckDB when `showRowSums` changes) must use `$effect()`.

---

## 6. File Structure

Implement every file listed below. No exceptions.

```
omx-viewer/
├── .github/
│   └── workflows/
│       └── deploy.yml               # GitHub Actions: build and deploy to gh-pages
├── public/
│   └── favicon.svg                  # Simple matrix/grid SVG icon
├── src/
│   ├── app.html                     # Vite HTML entry — set lang, viewport, title
│   ├── App.svelte                   # Root component: routes between landing and viewer
│   │
│   ├── lib/
│   │   ├── state/
│   │   │   └── matrixStore.svelte.ts  # Global $state — all app state lives here
│   │   │
│   │   ├── services/
│   │   │   ├── h5wasmService.ts     # All h5wasm interactions: open, parse, slice
│   │   │   ├── duckdbService.ts     # Main-thread side: postMessage API to worker
│   │   │   └── omxParser.ts         # OMX-specific logic: schema validation, lookup parsing
│   │   │
│   │   ├── workers/
│   │   │   ├── duckdb.worker.ts     # DuckDB-Wasm instance: aggregations only (SUM, min, max, mean)
│   │   │   └── math.worker.ts       # Plain Web Worker: element-wise arithmetic on TypedArrays (zero-copy Transferable)
│   │   │
│   │   ├── components/
│   │   │   ├── landing/
│   │   │   │   ├── LandingPage.svelte      # Hero + file drop zone shown before file load
│   │   │   │   └── FileDropZone.svelte     # Drag-and-drop + click-to-browse file input
│   │   │   │
│   │   │   ├── viewer/
│   │   │   │   ├── ViewerLayout.svelte     # Main layout after file loaded
│   │   │   │   ├── MatrixTabBar.svelte     # Horizontal scrollable tab bar
│   │   │   │   ├── MatrixTab.svelte        # Individual tab button component
│   │   │   │   ├── VirtualGrid.svelte      # Core: TanStack Virtual 2D grid renderer
│   │   │   │   ├── GridCell.svelte         # Individual cell with click handler
│   │   │   │   ├── CellInspector.svelte    # Popover shown on cell click
│   │   │   │   ├── CellNavigator.svelte    # Row + Col number inputs + Go button; scrolls grid to center that cell
│   │   │   │   └── GridToolbar.svelte      # Decimal toggle, CellNavigator, Arithmetic button, Summary button, export button
│   │   │   │
│   │   │   ├── modals/
│   │   │   │   ├── ArithmeticModal.svelte  # Matrix A op B UI
│   │   │   │   ├── MetadataPanel.svelte    # Collapsible sidebar: shape/dtype/stats + "Cell Values Across Matrices" showing pinnedCell value in every matrix
│   │   │   │   └── SummaryPanel.svelte     # Collapsible bottom drawer: dimension/fn/scope config form, Generate button, result table display, Download CSV
│   │   │   │
│   │   │   └── shared/
│   │   │       ├── LoadingOverlay.svelte   # Full-screen loading spinner with message
│   │   │       ├── ErrorBanner.svelte      # Dismissible error display
│   │   │       └── ThemeToggle.svelte      # Dark/light toggle button
│   │   │
│   │   └── utils/
│   │       ├── formatNumber.ts       # Locale-aware number formatting, decimal config
│   │       ├── arrowUtils.ts         # TypedArray ↔ Arrow IPC buffer conversion helpers
│   │       └── constants.ts          # ROW_CHUNK_SIZE, MAX_CACHED_CHUNKS, etc.
│   │
│   └── styles/
│       ├── global.css               # CSS reset, :root custom properties, base typography
│       ├── theme.css                # --color-* tokens for dark and light themes
│       ├── grid.css                 # VirtualGrid layout, cell sizing, header styles
│       └── animations.css           # Loading states, tab transitions, modal entrance
│
├── .eslintrc.cjs
├── .gitignore
├── index.html                       # Vite root HTML entry point
├── package.json                     # All deps + scripts: dev, build, preview, deploy
├── svelte.config.js
├── tsconfig.json                    # Strict TypeScript config
├── vite.config.ts                   # Base path for gh-pages, worker config, h5wasm WASM copy
└── README.md                        # Setup, usage, architecture overview
```

---

## 7. Key Implementation Details

### 7.1 Vite Configuration (Critical)

```typescript
// vite.config.ts — implement exactly this
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  base: '/omx-viewer/',              // REQUIRED for GitHub Pages
  worker: {
    format: 'es'                     // ES module workers for DuckDB-Wasm
  },
  optimizeDeps: {
    exclude: ['h5wasm', '@duckdb/duckdb-wasm']  // These ship their own WASM
  },
  server: {
    headers: {
      // DEV SERVER ONLY — GitHub Pages cannot serve custom HTTP headers.
      // For production, coi-serviceworker (see Section 7.8) injects these
      // client-side via a Service Worker so Wasm features work on gh-pages.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
```

### 7.2 h5wasm Initialization

h5wasm must be initialized once on app start. The WASM file must be resolvable. Use dynamic import:

```typescript
// src/lib/services/h5wasmService.ts
import h5wasm from 'h5wasm/esm'

let h5module: Awaited<ReturnType<typeof h5wasm>> | null = null

export async function initH5Wasm() {
  if (h5module) return h5module
  h5module = await h5wasm({ locateFile: (f) => `/omx-viewer/h5wasm/${f}` })
  return h5module
}
```

The h5wasm WASM binary must be copied to `public/h5wasm/`. Add a `vite.config.ts` plugin or a `package.json` `postinstall` script to copy `node_modules/h5wasm/dist/*.wasm` to `public/h5wasm/`.

### 7.3 DuckDB-Wasm Worker Initialization

```typescript
// src/lib/workers/duckdb.worker.ts
import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'

// Use the MVP (single-threaded) bundle — avoids SharedArrayBuffer requirement
const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker }
}
```

### 7.4 Chunked Row Loading — The Core Performance Algorithm

This is the most critical piece of the application. Implement it carefully.

**Important:** HDF5 datasets have their own internal physical chunk layout (e.g., a dataset may be stored as 100×100 blocks). Reading across chunk boundaries forces h5wasm to decompress multiple blocks. To minimise wasted decompression work, read the dataset's native chunk shape on first open and align `ROW_CHUNK_SIZE` to it dynamically.

```typescript
// src/lib/services/h5wasmService.ts

const DEFAULT_ROW_CHUNK_SIZE = 200
const MAX_CACHED_CHUNKS = 20 // LRU evict oldest when cache exceeds this

/**
 * Read the HDF5 dataset's native chunk shape and return an aligned row chunk size.
 * Falls back to DEFAULT_ROW_CHUNK_SIZE if the dataset is not chunked (contiguous layout).
 */
export function getAlignedChunkSize(matrixName: string): number {
  const dataset = h5file!.get(`matrices/${matrixName}`) as Dataset
  const chunks = dataset.chunks  // e.g. [100, 100] or null if contiguous
  if (chunks && chunks.length >= 1 && chunks[0] > 0) {
    // Round up to nearest multiple of the native row chunk size
    return Math.max(chunks[0], DEFAULT_ROW_CHUNK_SIZE)
  }
  return DEFAULT_ROW_CHUNK_SIZE
}

// Slice a range of rows from a named matrix
// Returns a 2D-structured Float64Array of shape [rowCount, ncols]
export async function sliceMatrixRows(
  matrixName: string,
  rowStart: number,
  rowEnd: number,      // exclusive
  ncols: number
): Promise<Float64Array> {
  const dataset = h5file!.get(`matrices/${matrixName}`) as Dataset
  const raw = dataset.slice([[rowStart, rowEnd], [0, ncols]])
  // h5wasm returns typed array matching dtype — normalize to Float64Array
  return raw instanceof Float64Array ? raw : new Float64Array(raw)
}
```

The `VirtualGrid.svelte` component must call this function with the row range reported by TanStack Virtual's `getVirtualItems()`, cache results in `MatrixTab.cachedRows`, and never re-request cached chunks.

### 7.5 TanStack Virtual 2D Setup

TanStack Virtual must virtualize BOTH rows and columns. Use `useVirtualizer` twice:

```typescript
// Inside VirtualGrid.svelte
import { createVirtualizer } from '@tanstack/svelte-virtual'

// Row virtualizer
const rowVirtualizer = createVirtualizer({
  count: nrows,
  getScrollElement: () => scrollContainer,
  estimateSize: () => ROW_HEIGHT,   // 32px default
  overscan: 5
})

// Column virtualizer
const colVirtualizer = createVirtualizer({
  count: ncols,
  getScrollElement: () => scrollContainer,
  estimateSize: () => COL_WIDTH,    // 80px default
  overscan: 3,
  horizontal: true
})
```

The grid must render a fixed header row (column indices or lookup labels) and a fixed left column (row indices or lookup labels) that do not scroll with the data cells.

### 7.6 Math Responsibility Split — DuckDB vs. TypedArray Worker

**This is a critical architectural boundary.** Do NOT use DuckDB for element-wise matrix arithmetic. The Arrow IPC serialization round-trip for a 700 MB matrix negates DuckDB's query performance advantage for simple operations. Instead, use the right tool for each job:

| Operation | Implementation | Location | Rationale |
|---|---|---|---|
| **Element-wise arithmetic** (add/sub/mul/div) | `Float64Array` loop | `math.worker.ts` (plain Web Worker) | No serialization, JIT-optimized tight loop |
| **Summary table aggregations** (SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO) | DuckDB SQL | `duckdb.worker.ts` | All functions are native DuckDB aggregates; multi-matrix JOIN is trivial in SQL |
| **Min / max / mean** (metadata panel stats) | DuckDB SQL | `duckdb.worker.ts` | Single query, trivial |
| **Cross-matrix cell read** | h5wasm direct slice | Main thread, synchronous | Single scalar — no Worker needed |

This means there are **two separate Web Workers:**

```
src/lib/workers/
├── duckdb.worker.ts   ← DuckDB-Wasm: aggregations only (SUM, min, max, mean)
└── math.worker.ts     ← Plain Worker: element-wise arithmetic on TypedArrays
```

The `math.worker.ts` implementation is simple — receive two `Float64Array` buffers and an operator string via `postMessage`, apply the operation in a loop using `Transferable` buffers to avoid copying, and post the result back:

```typescript
// src/lib/workers/math.worker.ts
self.onmessage = (e: MessageEvent) => {
  const { a, b, op, id } = e.data as {
    a: Float64Array; b: Float64Array;
    op: 'add' | 'subtract' | 'multiply' | 'divide'; id: string
  }
  const result = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) {
    if (op === 'add')      result[i] = a[i] + b[i]
    else if (op === 'subtract') result[i] = a[i] - b[i]
    else if (op === 'multiply') result[i] = a[i] * b[i]
    else if (op === 'divide')   result[i] = b[i] !== 0 ? a[i] / b[i] : NaN
  }
  self.postMessage({ result, id }, [result.buffer])  // Transferable — zero-copy
}
```

Arrow IPC conversion (`arrowUtils.ts`) is still required, but **only** for sending data to DuckDB for aggregation queries — not for arithmetic.

### 7.7 Arrow Buffer Conversion

When sending data to DuckDB-Wasm for **aggregation queries only**, convert TypedArrays to Arrow IPC format:

```typescript
// src/lib/utils/arrowUtils.ts
// Use apache-arrow (installed as peer dep of DuckDB-Wasm) for conversion
import { tableFromArrays, tableToIPC } from 'apache-arrow'

export function matrixToArrowIPC(
  data: Float64Array,
  nrows: number,
  ncols: number
): Uint8Array {
  // Flatten matrix into column arrays for Arrow columnar format
  const columns: Record<string, Float64Array> = {}
  for (let c = 0; c < ncols; c++) {
    columns[`c${c}`] = new Float64Array(nrows)
    for (let r = 0; r < nrows; r++) {
      columns[`c${c}`][r] = data[r * ncols + c]
    }
  }
  columns['_row'] = new Float64Array(Array.from({ length: nrows }, (_, i) => i))
  const table = tableFromArrays(columns)
  return tableToIPC(table)
}
```

### 7.8 GitHub Pages — COOP/COEP via coi-serviceworker (REQUIRED)

GitHub Pages **cannot** serve custom HTTP headers. The `vite.config.ts` headers only apply during local development. For production, use the `coi-serviceworker` library to inject COOP/COEP headers client-side via a Service Worker.

Add to `package.json` devDependencies: `"coi-serviceworker": "latest"`

Add the script to `index.html` **as the very first script in `<head>`**, before any other scripts:

```html
<!-- index.html — must be first script tag -->
<script src="/omx-viewer/coi-serviceworker.js"></script>
```

Add a `postinstall` step to copy the script to `public/`:

```json
"postinstall": "node scripts/copy-wasm.js && cp node_modules/coi-serviceworker/coi-serviceworker.js public/"
```

This Service Worker intercepts all requests from the page and adds the required headers, enabling Wasm features on GitHub Pages with no server configuration needed.

### 7.9 GitHub Actions Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

---

## 8. UI Design Specification

### 8.1 Aesthetic Direction

**Industrial-Precision Dark Theme** — This tool is used by transportation engineers and data scientists. The design language should feel like a high-end data terminal: dark backgrounds, monospaced data cells, sharp geometric accents, confident typography. Think Bloomberg Terminal meets Linear.app. Professional. Dense. Zero ornamentation that isn't functional.

### 8.2 Color Tokens (implement in `theme.css`)

```css
:root[data-theme="dark"] {
  --color-bg-base:        #0a0b0d;
  --color-bg-surface:     #111318;
  --color-bg-elevated:    #1a1d24;
  --color-bg-overlay:     #22262f;
  --color-border:         #2a2f3a;
  --color-border-strong:  #3d4455;

  --color-text-primary:   #e8eaf0;
  --color-text-secondary: #8b919e;
  --color-text-muted:     #555c6e;
  --color-text-inverse:   #0a0b0d;

  --color-accent:         #4f8ef7;   /* electric blue — primary action */
  --color-accent-hover:   #6ba0f9;
  --color-accent-subtle:  #1a2a4a;

  --color-positive:       #3dd68c;   /* positive values */
  --color-negative:       #f56565;   /* negative values */
  --color-warning:        #f6c343;
  --color-zero:           #555c6e;   /* zero values — muted */

  --color-tab-active-bg:  #1a1d24;
  --color-tab-hover-bg:   #161920;
  --color-header-bg:      #111318;
  --color-cell-hover:     #1e2230;
  --color-cell-selected:  #1a2a4a;
}

:root[data-theme="light"] {
  --color-bg-base:        #f4f5f7;
  --color-bg-surface:     #ffffff;
  --color-bg-elevated:    #ffffff;
  --color-bg-overlay:     #f0f1f4;
  --color-border:         #e1e4ea;
  --color-border-strong:  #c8ccd6;

  --color-text-primary:   #1a1d24;
  --color-text-secondary: #555c6e;
  --color-text-muted:     #8b919e;
  --color-text-inverse:   #ffffff;

  --color-accent:         #2563eb;
  --color-accent-hover:   #1d4ed8;
  --color-accent-subtle:  #eff6ff;

  --color-positive:       #16a34a;
  --color-negative:       #dc2626;
  --color-warning:        #d97706;
  --color-zero:           #9ca3af;

  --color-tab-active-bg:  #ffffff;
  --color-tab-hover-bg:   #f8f9fb;
  --color-header-bg:      #f4f5f7;
  --color-cell-hover:     #f0f4ff;
  --color-cell-selected:  #dbeafe;
}
```

### 8.3 Typography

```css
/* Use these Google Fonts — add to app.html <head> */
/* Display / UI Labels: IBM Plex Mono — reinforces data/terminal aesthetic */
/* Body / Prose: IBM Plex Sans — clean, technical, readable */

--font-mono: 'IBM Plex Mono', 'Fira Code', monospace;  /* matrix cells, indices */
--font-sans: 'IBM Plex Sans', 'Helvetica Neue', sans-serif;  /* UI chrome */

--font-size-xs:   11px;
--font-size-sm:   12px;
--font-size-base: 13px;
--font-size-md:   14px;
--font-size-lg:   16px;
--font-size-xl:   20px;
--font-size-2xl:  28px;

/* All matrix cell values use --font-mono */
/* Tab labels, toolbar, labels use --font-sans */
```

### 8.4 Layout Structure (ViewerLayout)

```
┌─────────────────────────────────────────────────────────┐
│  HEADER BAR: [OMX Viewer logo] [filename] [theme toggle]│
├─────────────────────────────────────────────────────────┤
│  TAB BAR: [TAZ_AUTO ×] [TAZ_TRANSIT ×] [+ add matrix]  │
├────────────────────────────────────────┬────────────────┤
│  TOOLBAR:                              │  SIDEBAR       │
│  [Decimals: 0|2|4|6]                   │  (collapsible) │
│  [Arithmetic...] [∑ Summary...] [CSV]  │                │
│  [Row: ____] [Col: ____] [Go →]        │  METADATA      │
├────────────────────────────────────────┤  Shape: NxN    │
│                                        │  dtype: f32    │
│  VIRTUAL GRID                          │  min: ...      │
│  ┌──────┬──────┬──────┬──────┐        │  max: ...      │
│  │      │  0   │ [7]  │  2   │  ← col │  mean: ...     │
│  ├──────┼──────┼──────┼──────┤  highlight              │
│  │  0   │ val  │ val  │ val  │        │  ─────────────  │
│  ├──────┼──────┼──────┼──────┤        │  CELL [42, 7]  │
│  │[42]  │ val  │■val■ │ val  │  ← pin │                 │
│  ├──────┼──────┼──────┼──────┤  ned   │  TAZ_AUTO      │
│  │  43  │ val  │ val  │ val  │  cell  │    1,432.50     │
│  └──────┴──────┴──────┴──────┘        │  TAZ_TRANSIT   │
│  (virtualized — only visible rows)    │    287.10      │
│                                        │  TAZ_WALK      │
├────────────────────────────────────────┤    12.40       │
│  SUMMARY PANEL (collapsible drawer)    │  (click to     │
│  ┌─ Config ──────────────────────────┐ │   switch tab)  │
│  │ Dimension: [By Row ▾]             │ │                │
│  │ Function:  [MEAN   ▾]             │ └────────────────┘
│  │ Scope:     [All Matrices ▾]       │
│  │            [Generate] [↓ CSV]     │
│  └───────────────────────────────────┘
│  ┌─ Result: MEAN by Row · All Matrices ┐
│  │ idx │ TAZ_AUTO │ TAZ_TRANSIT │ ... │
│  │  0  │  1,204.3 │      88.2   │ ... │
│  │  1  │    987.1 │      61.5   │ ... │
│  │ ... │    ...   │      ...    │ ... │
│  └─────────────────────────────────────┘
└─────────────────────────────────────────────────────────┘
```

### 8.5 Landing Page

The landing page (before any file is loaded) must be distinctive and intentional:

- Full-viewport dark background (`--color-bg-base`)
- Centered content: large typographic headline, sub-headline, file drop zone
- Drop zone: large dashed border rectangle with an upload icon. On drag-over, border animates to accent color with a subtle glow pulse.
- Below: a "How it works" section: 3 steps with icons (Upload → Parse → Explore)
- Footer: "All processing happens locally. Your data never leaves your browser."

### 8.6 Cell Value Color Coding

Apply color based on value semantics:

- `value > 0` → `--color-text-primary`
- `value === 0` → `--color-zero` (muted)
- `value < 0` → `--color-negative`
- Very large values (relative to matrix max) → optionally apply a subtle background gradient

---

## 9. Package.json — Required Dependencies

```json
{
  "name": "omx-viewer",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && gh-pages -d dist",
    "lint": "eslint src --ext .ts,.svelte",
    "postinstall": "node scripts/copy-wasm.js"
  },
  "dependencies": {
    "@duckdb/duckdb-wasm": "latest",
    "@tanstack/svelte-virtual": "latest",
    "apache-arrow": "latest",
    "h5wasm": "latest",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "latest",
    "@typescript-eslint/eslint-plugin": "latest",
    "@typescript-eslint/parser": "latest",
    "coi-serviceworker": "latest",
    "eslint": "latest",
    "eslint-plugin-svelte": "latest",
    "gh-pages": "latest",
    "svelte-check": "latest",
    "typescript": "latest",
    "vite": "latest"
  }
}
```

Also create `scripts/copy-wasm.js` — a Node.js script that copies h5wasm's `.wasm` file from `node_modules/h5wasm/dist/` to `public/h5wasm/` after `npm install`.

---

## 10. Error Handling Requirements

Implement graceful error handling for all of the following scenarios. Never let the application show a blank screen or an uncaught exception:

| Scenario | Expected Behavior |
|---|---|
| Non-HDF5 file uploaded | Show `ErrorBanner`: "This file does not appear to be a valid HDF5/OMX file." |
| HDF5 file with no `/matrices/` group | Show `ErrorBanner`: "No matrices found. This may not be an OMX file." |
| Matrix slice read fails | Show error inline in grid area; preserve other tabs |
| DuckDB Worker fails to init | Disable sum/arithmetic features; show warning banner; grid still works |
| File too large for available memory | Detect via `performance.memory` if available; warn user proactively |
| Matrix dimensions mismatch in arithmetic | Disable compute button; show inline validation message |

---

## 11. Performance Constraints

These are hard requirements, not suggestions:

- **DOM row count**: At no time should more than 30 rows be rendered in the DOM simultaneously. TanStack Virtual enforces this.
- **DOM column count**: At no time should more than 20 columns be rendered in the DOM simultaneously.
- **Memory per matrix**: Cache a maximum of `MAX_CACHED_CHUNKS = 20` chunks per matrix tab. When exceeded, evict the LRU chunk. Chunks are `ROW_CHUNK_SIZE = 200` rows.
- **Initial load time**: The application shell (before any file is loaded) must be interactive within 2 seconds on a modern connection. h5wasm and DuckDB-Wasm must be loaded lazily — only after the user selects a file.
- **Scroll performance**: Grid scrolling must not drop below 30fps. All data slicing must be debounced with a 50ms trailing debounce on scroll events.
- **No layout thrash**: Cell dimensions must be set once via CSS variables, not calculated dynamically on every render.

---

## 12. README.md Requirements

The README must include:

1. Project description and screenshot placeholder
2. Features list
3. Local development setup: `npm install && npm run dev`
4. GitHub Pages deployment: `npm run deploy`
5. Technical architecture summary (one paragraph per layer)
6. OMX file format brief explanation
7. Known limitations (max recommended file size, browser requirements: Chrome/Firefox/Edge, SharedArrayBuffer note)
8. Contributing section
9. License

---

## 13. Code Quality Standards

- All TypeScript must compile with zero errors under `strict: true`
- No `any` types unless accompanied by a `// eslint-disable-next-line` comment with justification
- All public functions must have JSDoc comments
- All Svelte components must have a `// Component: ComponentName — [one-line description]` comment at the top of the `<script>` block
- Magic numbers must be named constants in `constants.ts`
- No `console.log` in production code — use a `logger.ts` utility that is a no-op in production builds (`import.meta.env.PROD`)

---

## 14. What to Generate — Execution Order

Generate files in this exact order to minimize forward-reference confusion:

1. `package.json`
2. `tsconfig.json`
3. `svelte.config.js`
4. `vite.config.ts`
5. `scripts/copy-wasm.js`
6. `src/styles/global.css`
7. `src/styles/theme.css`
8. `src/styles/grid.css`
9. `src/styles/animations.css`
10. `src/lib/utils/constants.ts`
11. `src/lib/utils/formatNumber.ts`
12. `src/lib/utils/arrowUtils.ts`
13. `src/lib/state/matrixStore.svelte.ts`
14. `src/lib/services/omxParser.ts`
15. `src/lib/services/h5wasmService.ts`
16. `src/lib/workers/duckdb.worker.ts`
17. `src/lib/workers/math.worker.ts`
18. `src/lib/services/duckdbService.ts`
19. `src/lib/components/shared/LoadingOverlay.svelte`
20. `src/lib/components/shared/ErrorBanner.svelte`
21. `src/lib/components/shared/ThemeToggle.svelte`
22. `src/lib/components/landing/FileDropZone.svelte`
23. `src/lib/components/landing/LandingPage.svelte`
24. `src/lib/components/viewer/GridCell.svelte`
25. `src/lib/components/viewer/CellInspector.svelte`
26. `src/lib/components/viewer/CellNavigator.svelte`
27. `src/lib/components/viewer/VirtualGrid.svelte`
28. `src/lib/components/viewer/MatrixTab.svelte`
29. `src/lib/components/viewer/MatrixTabBar.svelte`
30. `src/lib/components/viewer/GridToolbar.svelte`
31. `src/lib/components/viewer/ViewerLayout.svelte`
32. `src/lib/components/modals/ArithmeticModal.svelte`
33. `src/lib/components/modals/MetadataPanel.svelte`
34. `src/lib/components/modals/SummaryPanel.svelte`
35. `src/App.svelte`
36. `index.html`
37. `public/favicon.svg`
38. `.github/workflows/deploy.yml`
39. `.gitignore`
40. `.eslintrc.cjs`
41. `README.md`

Generate each file completely. Do not use placeholder comments like `// TODO: implement`. Do not truncate any file. If a file is long, continue until it is complete.

---

## 15. Final Checklist Before Submitting Code

Before outputting the first file, verify mentally:

- [ ] Vite base path set to `/omx-viewer/` for GitHub Pages
- [ ] COOP/COEP headers in vite.config.ts are marked DEV SERVER ONLY
- [ ] `coi-serviceworker.js` copied to `public/` via postinstall script
- [ ] `coi-serviceworker.js` is the FIRST script tag in `index.html` before all others
- [ ] h5wasm loaded lazily (only after file selection)
- [ ] DuckDB-Wasm initialized in a Web Worker only, used for aggregations only (summary table SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO and metadata stats)
- [ ] `math.worker.ts` (plain Web Worker) handles all element-wise arithmetic using Transferable Float64Arrays
- [ ] ArithmeticModal sends data to math.worker, NOT to DuckDB worker
- [ ] SummaryPanel has dimension/fn/scope dropdowns and a Generate button — not toggles
- [ ] Summary SQL is dynamically constructed from SummaryConfig — not hardcoded strings
- [ ] "All matrices" scope produces a multi-column JOIN query — one value column per matrix
- [ ] Summary result is rendered in SummaryPanel as a standalone scrollable table, NOT appended to the matrix grid
- [ ] "Download CSV" in SummaryPanel generates a Blob URL download from summaryResult.rows — no server
- [ ] TanStack Virtual configured for both row AND column virtualization
- [ ] No entire matrix ever loaded into memory at once (always use slice)
- [ ] HDF5 native chunk shape read on open; ROW_CHUNK_SIZE aligned to it dynamically
- [ ] LRU cache implemented for row chunks
- [ ] Svelte 5 runes used throughout (no legacy `writable()` stores)
- [ ] All error scenarios in Section 10 handled
- [ ] IBM Plex Mono used for all matrix cell values
- [ ] Dark theme is default; light theme toggle works
- [ ] `npm run deploy` script works end-to-end
- [ ] CellNavigator validates row/col against matrix bounds before scrolling
- [ ] `scrollToIndex` called with `{ align: 'center' }` on both row and column virtualizers
- [ ] Pinned cell has visible highlight ring distinguishable from hover state
- [ ] Row header and column header for pinned cell are also highlighted
- [ ] Cross-matrix cell reads use single-element slice (`[[row, row+1], [col, col+1]]`)
- [ ] MetadataPanel "Cell Values Across Matrices" section shows spinner while reads are in flight
- [ ] Each matrix row in the cross-matrix list is clickable and switches the active tab
- [ ] Pinned cell coordinate is preserved when switching tabs via the cross-matrix list
