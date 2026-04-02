# OMX Viewer — Full Specification

> Source of truth for all feature requirements. Implementation details are in subdirectory CLAUDE.md files.

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

## 2. Core Features

1. **File Import** — Drag-and-drop or click-to-browse for `.omx` / `.h5` files.
2. **OMX Structure Parsing** — Discover matrices, read shape, read zone lookup tables.
3. **Matrix Tab Navigation** — Each matrix = separate clickable tab.
4. **Virtualized Matrix Grid** — TanStack Virtual 2D. Support 10,000×10,000.
5. **Chunked / Lazy Loading** — `dataset.slice([[rowStart, rowEnd], [0, ncols]])` only.
6. **Aggregation Summary Table** — DuckDB-Wasm SQL. Dimension × Function × Scope.
   - Dimension: By Row / By Column
   - Function: SUM, MIN, MAX, MEAN, MEDIAN, STD DEV, COUNT NON-ZERO
   - Scope: Active Matrix Only / All Matrices (multi-column JOIN)
   - Download CSV button
7. **Matrix Arithmetic** — Element-wise add/subtract/multiply/divide via math.worker. New ephemeral tab.
8. **Value Formatting** — Locale-aware, configurable decimals (0/2/4/6), compact notation.
9. **Cell Click Inspection** — Tooltip: row index, col index, zone labels, raw value.
10. **Cell Navigator** — Row/Col inputs → scroll to center + highlight. Bounds validated.
11. **Cross-Matrix Cell Inspector** — Sidebar shows value at `[row, col]` across ALL matrices. Clickable rows switch tabs.

### Stretch Features
- Export visible matrix slice to CSV
- Dark/light theme toggle (dark default)
- Persist summary config in sessionStorage

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Build | Vite (latest) — base path `/omx-viewer/` |
| UI | Svelte 5 runes |
| HDF5 | h5wasm |
| Grid | @tanstack/svelte-virtual |
| Aggregation | @duckdb/duckdb-wasm |
| Styling | Pure CSS, CSS custom properties |
| Types | TypeScript strict |
| Deploy | gh-pages npm package |

---

## 4. Architecture

### Thread Model
```
Main Thread
├── Svelte 5 UI
├── h5wasm (synchronous after init — stays on main thread)
└── Web Workers:
    ├── duckdb.worker.ts  — aggregations only
    └── math.worker.ts   — element-wise arithmetic only
```

### OMX File Schema (actual real-world structure)
```
file.omx
├── /data/          (group name is 'data', not 'matrices')
│   ├── TAZ_AUTO    (float32/float64, shape [N,N])
│   └── ...
├── /lookup/
└── root attrs: SHAPE (int[2]), OMX_VERSION (string)
```

### State Shape
```typescript
class AppState {
  file: MatrixFile | null           // parsed OMX metadata
  tabs: MatrixTab[]                 // one per matrix + ephemeral results
  activeTabId: string | null
  isLoading: boolean
  loadingMessage: string
  decimalPlaces: 0 | 2 | 4 | 6
  compactNotation: boolean
  summaryConfig: SummaryConfig
  summaryResult: SummaryResult | null
  summaryPanelOpen: boolean
  sidebarOpen: boolean
  theme: 'dark' | 'light'
  pinnedCell: PinnedCell | null
  navigatorRow: string
  navigatorCol: string
  duckdbReady: boolean
  errors: AppError[]
}
```

---

## 5. UI Design

### Color Tokens (dark theme default)
```css
--color-bg-base:        #0a0b0d
--color-bg-surface:     #111318
--color-bg-elevated:    #1a1d24
--color-accent:         #4f8ef7
--color-text-primary:   #e8eaf0
--color-text-secondary: #8b919e
--color-positive:       #3dd68c
--color-negative:       #f56565
--color-zero:           #555c6e
```

### Typography
- Matrix cell values: `IBM Plex Mono` (monospace, tabular-nums)
- UI chrome: `IBM Plex Sans`

### Layout
```
┌─ Header: logo | filename | shape | theme toggle ──────────┐
├─ Tab Bar: [TAZ_AUTO ×] [TAZ_TRANSIT ×] ───────────────────┤
├─ Toolbar: decimals | compact | [Row][Col][Go] | actions ───┤
├─ Grid (virtualized) ───────────────────────┬─ Sidebar ────┤
│                                            │ File info    │
│                                            │ Matrix stats │
│                                            │ Pinned cell  │
│                                            │ Cross-matrix │
├─ Summary Panel (collapsible drawer) ───────┴──────────────┤
│ [Dimension▾] [Function▾] [Scope▾] [Generate] [↓ CSV]      │
│ ┌─ result table ─────────────────────────────────────────┐ │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Performance Constraints (hard requirements)

- Max 30 rows in DOM at any time
- Max 20 columns in DOM at any time
- LRU cache: max 20 chunks per tab, 200 rows/chunk
- h5wasm and DuckDB loaded lazily (only after file select)
- 50ms trailing debounce on scroll before slice requests
- Cell dimensions set once via CSS variables only

---

## 9. Error Handling

| Scenario | Behavior |
|---|---|
| Non-HDF5 file | ErrorBanner: "This file does not appear to be a valid HDF5/OMX file." |
| No matrices group | ErrorBanner: "No matrices found. This may not be an OMX file." |
| Matrix slice fails | Inline error in grid; other tabs unaffected |
| DuckDB fails | Warning banner; grid still works |
| File too large | Proactive warning via `performance.memory` |
| Dimension mismatch in arithmetic | Disable compute button + inline message |

---

## 10. Code Quality Standards

- TypeScript strict: zero errors
- No `any` without `// eslint-disable-next-line` + justification
- JSDoc on all public functions
- `// Component: Name — description` at top of every Svelte script block
- Magic numbers → `constants.ts`
- No `console.log` → use `logger.ts` (no-op in prod)
