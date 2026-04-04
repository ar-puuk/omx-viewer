# OMX Viewer

> Browser-native OMX / HDF5 matrix explorer — no server, no upload, no limits.

A fully client-side, static web application for transportation planners, data scientists, and engineers to upload and interactively explore **OMX (Open Matrix Format)** files — HDF5-based binary files containing one or more named float/int matrices and optional zone lookup tables. Files from 300 MB to 700 MB are supported. All processing happens entirely in the browser using WebAssembly. No data ever leaves your machine. No backend. No server.

---

## Features

- **Drag-and-drop file import** — drop any `.omx`, `.h5`, or `.hdf5` file directly onto the page
- **OMX structure parsing** — discovers all matrices under `/data/` (case-insensitive, falls back to `/matrices/`), reads shape metadata (rows × cols), and loads zone lookup tables from `/lookup/`
- **Matrix tab navigation** — each matrix in the file appears as a separate clickable tab
- **Virtualized matrix grid** — high-performance 2D virtual rendering via TanStack Virtual; only visible rows and columns exist in the DOM at any time; supports matrices up to 10,000 × 10,000
- **Chunked / lazy loading** — never loads an entire matrix into memory; slices only the rows visible in the viewport using h5wasm's `slice()` API with an LRU chunk cache
- **Aggregation summary table** — configurable 1D summary panel:
  - **Dimension:** By Row or By Column
  - **Function:** SUM, MIN, MAX, MEAN, MEDIAN, STD DEV, COUNT NON-ZERO
  - **Scope:** Active Matrix Only or All Matrices (multi-column comparison table)
  - Powered by streaming h5wasm aggregation (bypasses DuckDB to avoid 512 MB OOM limits)
  - Download result as CSV
- **Matrix arithmetic** — element-wise add / subtract / multiply / divide between any two matrices; result appears as a temporary tab
- **Value formatting** — locale-aware, configurable decimal places (0, 2, 4, 6), optional compact notation (1.2M, 3.4B)
- **Cell click inspection** — click any cell to pin it; shows row index, column index, zone labels (if available), and raw value
- **Cell navigator** — type a row and column number to scroll and center that cell; validates against matrix bounds
- **Cross-matrix cell inspector** — sidebar shows the value at the pinned `[row, col]` coordinate across every matrix in the file simultaneously; each row is clickable to switch matrix tabs
- **Dark / light theme toggle** — dark by default; preference persisted across sessions
- **Export to CSV** — export the current visible matrix slice or the full summary table

---

## Local Development

```bash
# 1. Install dependencies (also copies coi-serviceworker to public/)
npm install

# 2. Start the Vite dev server with required COOP/COEP headers
npm run dev
```

Open [http://localhost:5173/omx-viewer/](http://localhost:5173/omx-viewer/).

---

## GitHub Pages Deployment

```bash
# Build and push to gh-pages branch
npm run deploy
```

This runs `vite build` then uses the `gh-pages` npm package to push `./dist` to the `gh-pages` branch of your repository.

**Before deploying:**
1. In your GitHub repository settings → Pages, set the source to the `gh-pages` branch.
2. Ensure the `base` in `vite.config.ts` matches your repository name: `/omx-viewer/`.

Alternatively, push to `main` — the GitHub Actions workflow at `.github/workflows/deploy.yml` automatically builds and deploys on every push.

---

## Technical Architecture

### HDF5 / OMX Parsing (h5wasm — main thread)

[h5wasm](https://github.com/usnistgov/h5wasm) compiles the HDF5 C library to WebAssembly and runs synchronously on the main thread after initialisation. Keeping it on the main thread avoids postMessage serialisation overhead on every scroll event — critical for achieving 30fps scrolling on large matrices. The WASM binary is embedded inline in the h5wasm package — no separate copy step is needed. h5wasm is loaded lazily (dynamic import) only after the user selects a file, keeping the initial bundle small. Row data is fetched in aligned chunks (`ROW_CHUNK_SIZE = 200` rows by default, dynamically aligned to the dataset's native HDF5 chunk shape), cached in a per-tab LRU cache (max 20 chunks), and evicted in least-recently-used order.

### Virtualised Grid (TanStack Virtual)

[TanStack Virtual](https://tanstack.com/virtual) virtualises both rows **and** columns independently. At no time are more than ~30 rows and ~20 columns rendered in the DOM simultaneously, regardless of matrix size. Column and row dimensions are fixed via CSS custom properties (`--grid-row-height`, `--grid-col-width`) to prevent layout thrash. Sticky column headers and sticky row-index cells use `position: sticky` independently of the virtualiser.

### Analytics / Aggregation (DuckDB-Wasm — Web Worker)

[DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview.html) runs in a dedicated Web Worker (`duckdb.worker.ts`) and is retained for potential future use. The MVP (single-threaded) bundle is used to avoid SharedArrayBuffer requirements at the network level. However, aggregations are now computed via **streaming h5wasm** on the main thread — reading one 200-row chunk at a time and accumulating results in a tight loop. This bypasses DuckDB entirely, avoiding the 512 MB memory limit that caused OOM errors when registering large matrices as wide Arrow IPC tables. DuckDB is **not currently invoked** by any aggregation or stats path. Element-wise arithmetic is handled by the separate math worker.

### Matrix Arithmetic (math.worker — plain Web Worker)

Element-wise arithmetic (add / subtract / multiply / divide) runs in `math.worker.ts`, a plain Web Worker with zero dependencies. Both input matrices are transferred as `Transferable` `Float64Array` buffers (zero-copy). A tight JavaScript loop applies the operation and transfers the result buffer back. Arrow IPC serialisation round-trips for a 700 MB matrix would negate DuckDB's advantage for this simple operation — hence the separate worker.

### Cross-Origin Isolation (coi-serviceworker)

GitHub Pages cannot serve custom HTTP headers, but WebAssembly features (SharedArrayBuffer) require `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) library installs a Service Worker that intercepts all page requests and injects these headers client-side. The script is copied to `public/` by `postinstall` and must be the **first** `<script>` tag in `index.html`.

---

## OMX File Format

OMX (Open Matrix Format) is a convention layered on the HDF5 binary format, used widely in transportation demand modelling:

```
file.omx (HDF5)
├── /data/                          ← group name is 'data', NOT 'matrices'
│   ├── TAZ_AUTO        (float32 or float64, shape: [N, N])
│   ├── TAZ_TRANSIT     (float32 or float64, shape: [N, N])
│   └── TAZ_WALK        (...)
├── /lookup/
│   ├── zone_labels     (string array, length N)
│   └── ...
└── Attributes on root:
    ├── OMX_VERSION     (string, e.g. "0.2")  ← uppercase
    └── SHAPE           (int array, e.g. [1000, 1000])  ← uppercase
```

> **Note:** The original OMX spec documents `/matrices/` and lowercase attributes, but real-world OMX files use `/data/` and uppercase `SHAPE`/`OMX_VERSION`. The parser handles both conventions via case-insensitive lookup.

All matrices in a single OMX file share the same zone dimensions (`shape`), which is why the cross-matrix cell inspector can meaningfully display `[row, col]` values from every matrix simultaneously.

---

## Known Limitations

- **Maximum recommended file size:** ~700 MB. Larger files may exhaust browser memory on 32-bit processes or devices with limited RAM. A warning is shown for files over 750 MB.
- **Browser requirements:** Chrome 90+, Firefox 90+, Edge 90+. Safari has limited SharedArrayBuffer support; the coi-serviceworker mitigates this but is not guaranteed on all Safari versions.
- **SharedArrayBuffer note:** The application requires `crossOriginIsolated = true`. The `coi-serviceworker.js` script handles this automatically, but if you deploy to a hosting environment that allows custom headers, you can set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` at the server level instead and remove the service worker.
- **Arithmetic on large matrices:** Loading two full matrices into memory simultaneously (for element-wise arithmetic) requires ~2× the matrix size in RAM. For a 700 MB file with two matrices, this may use ~1.4 GB of browser memory.
- **Summary table for large matrices:** Streaming aggregation reads the full matrix in 200-row h5wasm chunks. For 10,000 × 10,000 matrices this involves significant computation — expect 5–30 seconds depending on hardware.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes — ensure `npm run lint` passes
4. Submit a pull request

Please follow the existing code style:
- Svelte 5 runes (`$state`, `$derived`, `$effect`) throughout — no legacy `writable()` stores
- All TypeScript must compile with `strict: true`
- Magic numbers go in `src/lib/utils/constants.ts`
- Use `logger.ts` instead of `console.log` in production code

---

## License

MIT — see [LICENSE](LICENSE) for details.
