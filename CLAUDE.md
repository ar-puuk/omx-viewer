# CLAUDE.md — OMX Viewer

Browser-native OMX/HDF5 matrix explorer. Static GitHub Pages app. No backend, no server.
Full spec: `docs/SPEC.md` | Active bugs: `docs/ACTIVE_ISSUES.md` | Checklist: `docs/CHECKLIST.md`

---

## Stack

| Layer | Technology |
|---|---|
| Build | Vite 8 (base: `/omx-viewer/`) |
| UI | Svelte 5 runes — `$state`, `$derived`, `$effect` only. No legacy stores. |
| HDF5 | h5wasm — `import { ready, File, FS } from 'h5wasm'`, await `ready` promise. No factory function. WASM is embedded inline in the package. |
| Grid | `@tanstack/svelte-virtual` — `createVirtualizer` twice: rows AND columns |
| Aggregation | DuckDB-Wasm in `duckdb.worker.ts` — aggregations only |
| Arithmetic | `math.worker.ts` — plain Worker, Transferable Float64Arrays, no DuckDB |
| Styling | Pure CSS, `src/styles/`, CSS custom properties, no Tailwind |
| Types | TypeScript strict mode |

---

## Critical Architecture Rules

1. **h5wasm runs on the main thread** — synchronous after `await ready`. Never move to a worker.
2. **DuckDB worker = aggregations only** — SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO. Never arithmetic.
3. **math.worker = arithmetic only** — add/subtract/multiply/divide on Float64Arrays via Transferable buffers.
4. **Never load a full matrix** — always use `dataset.slice([[rowStart, rowEnd], [0, ncols]])`.
5. **LRU chunk cache** — max 20 chunks per tab, 200 rows per chunk, aligned to HDF5 native chunk shape.
6. **Store pattern** — `export const store = new AppState()` in `matrixStore.svelte.ts`. All `$state` fields are class properties. Components import `{ store }` and use `store.x` / `store.method()`.
7. **No exported `$state` reassignment** — Svelte 5 forbids `export let x = $state()` when reassigned outside the module.

---

## Actual OMX File Structure (discovered at runtime — differs from original spec)

```
file.omx (HDF5)
├── /data/          ← group name is 'data', NOT 'matrices'
│   ├── TAZ_AUTO    (float32/float64, shape [N, N])
│   └── ...
├── /lookup/
└── Root attrs: 'SHAPE' (uppercase), 'OMX_VERSION' (uppercase)
```

Constants that reflect this:
- `MATRICES_GROUP = 'data'`
- `OMX_SHAPE_ATTR = 'SHAPE'`
- `OMX_VERSION_ATTR = 'OMX_VERSION'`

Parser is case-insensitive and falls back to inferring shape from first dataset if root attr missing.

---

## File Structure

```
omx-viewer/
├── CLAUDE.md                              ← this file (keep slim)
├── docs/
│   ├── SPEC.md                            ← full original specification
│   ├── CHECKLIST.md                       ← §15 pre-submit checklist
│   └── ACTIVE_ISSUES.md                   ← current bugs / in-progress work
├── scripts/copy-wasm.js                   ← postinstall no-op (WASM is inline)
├── src/
│   ├── App.svelte                         ← root: routes landing ↔ viewer
│   ├── main.ts                            ← Svelte mount + CSS imports
│   ├── styles/
│   │   ├── global.css                     ← reset, tokens, utility classes
│   │   ├── theme.css                      ← dark/light color tokens
│   │   ├── grid.css                       ← VirtualGrid layout + cell styles
│   │   └── animations.css                 ← keyframes, transitions
│   └── lib/
│       ├── state/
│       │   └── matrixStore.svelte.ts      ← class AppState with $state fields
│       ├── utils/
│       │   ├── constants.ts               ← ALL named constants (no magic numbers)
│       │   ├── formatNumber.ts            ← Intl.NumberFormat cache + CSV helpers
│       │   ├── arrowUtils.ts              ← TypedArray ↔ Arrow IPC (DuckDB only)
│       │   └── logger.ts                  ← no-op in prod, console in dev
│       ├── services/
│       │   ├── omxParser.ts               ← OMX schema validation + parsing
│       │   ├── h5wasmService.ts           ← h5wasm init, open, slice, cell read
│       │   └── duckdbService.ts           ← main-thread API to duckdb.worker
│       ├── workers/
│       │   ├── duckdb.worker.ts           ← DuckDB-Wasm aggregations
│       │   └── math.worker.ts             ← element-wise arithmetic
│       └── components/
│           ├── shared/
│           │   ├── LoadingOverlay.svelte
│           │   ├── ErrorBanner.svelte
│           │   └── ThemeToggle.svelte
│           ├── landing/
│           │   ├── LandingPage.svelte
│           │   └── FileDropZone.svelte
│           ├── viewer/
│           │   ├── ViewerLayout.svelte    ← master layout
│           │   ├── MatrixTabBar.svelte
│           │   ├── MatrixTab.svelte
│           │   ├── VirtualGrid.svelte     ← TanStack Virtual 2D
│           │   ├── GridCell.svelte
│           │   ├── GridToolbar.svelte
│           │   ├── CellNavigator.svelte
│           │   └── CellInspector.svelte
│           └── modals/
│               ├── ArithmeticModal.svelte
│               ├── MetadataPanel.svelte
│               └── SummaryPanel.svelte
├── index.html                             ← coi-serviceworker FIRST, then main.ts
├── package.json
├── vite.config.ts
├── svelte.config.js
├── tsconfig.json
└── .github/workflows/deploy.yml
```

---

## Commands

```bash
npm install          # installs deps + runs postinstall (copies coi-serviceworker)
npm run dev          # Vite dev server at http://localhost:5173/omx-viewer/
npm run build        # production build → dist/
npm run deploy       # build + push to gh-pages branch
npm run lint         # ESLint
```

---

## Subdirectory CLAUDE.md Files

For deep implementation details, see:
- `src/lib/services/CLAUDE.md` — h5wasm API, OMX parsing, chunking, slicing
- `src/lib/workers/CLAUDE.md` — DuckDB worker protocol, SQL generation, math worker
- `src/lib/components/viewer/CLAUDE.md` — VirtualGrid, TanStack Virtual, performance
- `src/lib/state/CLAUDE.md` — AppState class, store pattern, all state fields
