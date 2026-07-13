# Viewer Components — Implementation Reference

Files: `VirtualGrid.svelte`, `GridToolbar.svelte`, `CellNavigator.svelte`, `CellInspector.svelte`, `MatrixTab.svelte`, `MatrixTabBar.svelte`, `ViewerLayout.svelte`

---

## VirtualGrid.svelte — Core Performance Component

### TanStack Virtual setup (BOTH row AND column)
```ts
import { createVirtualizer } from '@tanstack/svelte-virtual'

// Two virtualizers — one for rows, one for columns
const rowVirtualizer = createVirtualizer({
  count: store.nrows,
  getScrollElement: () => scrollContainer,
  estimateSize: () => ROW_HEIGHT,   // 32px — matches --grid-row-height CSS var
  overscan: GRID_ROW_OVERSCAN,      // 5
})

const colVirtualizer = createVirtualizer({
  count: store.ncols,
  getScrollElement: () => scrollContainer,
  estimateSize: () => COL_WIDTH,    // 88px — matches --grid-col-width CSS var
  overscan: GRID_COL_OVERSCAN,      // 3
  horizontal: true,
})
```

### DOM structure
```
.grid-scroll-container           ← single scrollable element (both axes)
├── .grid-header-row             ← position: sticky; top: 0
│   ├── .grid-corner-cell        ← position: sticky; left: 0; z-index: sticky+1
│   └── .grid-col-header ×N     ← position: absolute; left: ROW_HEADER_WIDTH + vcol.start
└── .grid-data-area              ← height = totalHeight; width = totalWidth + ROW_HEADER_WIDTH
    └── .grid-row ×30max         ← position: absolute; transform: translateY({vrow.start}px)
        ├── .grid-row-header     ← position: sticky; left: 0
        └── .grid-cell ×20max   ← position: absolute; left: ROW_HEADER_WIDTH + vcol.start
```

**CRITICAL:** Cells and column headers MUST use `position: absolute; left: ROW_HEADER_WIDTH + vcol.start`,
NOT `transform: translateX(vcol.start)`.

With `transform`, each item's visual position = (natural flex position) + translateX. In a flex row,
the natural positions accumulate: item[i] is at `ROW_HEADER_WIDTH + i * COL_WIDTH` in the flow.
Adding `translateX(col * COL_WIDTH)` gives `ROW_HEADER_WIDTH + i*COL_WIDTH + col*COL_WIDTH` — spacing
doubles to 2×COL_WIDTH for i > 0. With `position: absolute`, items escape the flex flow and land
directly at `ROW_HEADER_WIDTH + vcol.start = ROW_HEADER_WIDTH + col * COL_WIDTH`. Correct.

### 50ms scroll debounce
Wrap the slice-fetch trigger in a debounce — do NOT fetch on every virtual item change:
```ts
let debounceTimer: ReturnType<typeof setTimeout>

$effect(() => {
  const items = rowVirtualizer?.getVirtualItems() ?? []
  if (items.length === 0) return

  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    fetchVisibleRows(items)
  }, 50)
})
```

### Cell dimensions — CSS variables only
```css
/* Set ONCE in grid.css — never compute in JS */
--grid-row-height: 32px;
--grid-col-width:  88px;
--grid-header-height: 32px;
--grid-row-header-width: 72px;
```
`estimateSize: () => ROW_HEIGHT` reads from the JS constant (which matches the CSS var).
Never call `getBoundingClientRect()` or measure DOM elements.

### Pinned cell highlight
```svelte
<!-- Cell is pinned: show ring distinguishable from hover -->
<div
  class="grid-cell {valueClass}"
  class:is-pinned={store.pinnedCell?.row === vrow.index && store.pinnedCell?.col === vcol.index}
  class:is-pinned-col={!isPinnedCell && store.pinnedCell?.col === vcol.index}
>
```
CSS in `grid.css`:
```css
.grid-cell.is-pinned {
  background: var(--color-cell-selected);
  outline: 2px solid var(--color-cell-pinned-ring);
  outline-offset: -2px;
}
```

### scrollToCell — Cell Navigator integration
```ts
// Exposed via $bindable prop so GridToolbar can call it
scrollToCell = (row: number, col: number) => {
  rowVirtualizer?.scrollToIndex(row, { align: 'center' })
  colVirtualizer?.scrollToIndex(col, { align: 'center' })
}
```

### Cross-matrix cell read on click
```ts
function handleCellClick(row: number, col: number) {
  store.pinCell(row, col)              // sets isLoading: true
  const values = sliceCellAllMatrices( // synchronous loop
    store.file.matrixNames, row, col
  )
  store.setPinnedCellValues(values)    // sets isLoading: false
}
```

---

## GridToolbar.svelte

Contains: decimal pills (0/2/4/6), compact toggle, CellNavigator, Arithmetic button, Summary button, CSV export button.

### CellNavigator integration
```svelte
<CellNavigator onnavigate={(row, col) => scrollToCell?.(row, col)} />
```

---

## CellNavigator.svelte

### Validation before scroll
```ts
function validate() {
  const r = parseInt(store.navigatorRow, 10)
  const c = parseInt(store.navigatorCol, 10)
  if (isNaN(r) || r < 0 || r >= store.nrows) { rowError = `0 – ${store.nrows - 1}`; return null }
  if (isNaN(c) || c < 0 || c >= store.ncols) { colError = `0 – ${store.ncols - 1}`; return null }
  return { row: r, col: c }
}
```

### Input binding (Svelte 5 — cannot bind to store property)
```svelte
<input
  value={store.navigatorRow}
  oninput={(e) => { store.navigatorRow = (e.currentTarget as HTMLInputElement).value }}
/>
```

---

## Performance Budget

| Metric | Target |
|---|---|
| DOM rows | ≤ 30 |
| DOM cols | ≤ 20 |
| Scroll debounce | 50ms trailing |
| Scroll fps | ≥ 30fps |
| Chunk cache | ≤ 20 chunks per tab |
| Chunk size | 200 rows (aligned to HDF5 native) |
