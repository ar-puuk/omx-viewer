# OMX Viewer — Shared Engine: Web App + VS Code Extension

Last updated: 2026-07-12

## Context

- Current repo: browser-native OMX/HDF5 matrix explorer. Svelte 5 (runes) + TypeScript (strict) + Vite, deployed as a static site to GitHub Pages. `h5wasm` parses HDF5 synchronously on the main thread (its WASM binary is embedded inline — confirmed via `node_modules/h5wasm/dist/esm/hdf5_util.js`, no separate fetch). `math.worker.ts` does zero-copy element-wise matrix arithmetic via transferable `Float64Array`s. `duckdb.worker.ts` exists but is **unused and should be deleted** — an earlier attempt to register whole matrices as wide Arrow IPC tables in DuckDB-Wasm OOM'd (documented in `ACTIVE_ISSUES.md` #15-17); aggregation was rewritten as a streaming h5wasm loop instead, which has strictly better memory behavior (O(one chunk), ~3MB, cannot OOM regardless of file size) and is already correct and tested for SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO.
- Project is early-stage (27 commits, single maintainer). Several existing features are still marked "Not Yet Tested" in `ACTIVE_ISSUES.md`: CSV export, arithmetic-worker end-to-end, cross-matrix cell inspector, theme toggle. Stage 1 below should not be started until those are verified working, since Stage 1 is a structural reorganization of code whose correctness Stage 1 itself can't validate.
- Reference for the geospatial feature: SimWrapper's matrix viewer (joins an OMX matrix to zonal geometry via a zone ID, choropleths a row/col slice, flowmap of desire lines between centroids).

## Goal

One shared engine, two real shipping targets: the existing GitHub Pages web app, and a VS Code extension (published to both the Microsoft Marketplace and Open VSX), built from the same repository. The VS Code extension must work **fully offline after install** — not just "no CDN calls in the bundle," but the full lifecycle: install today while online, go offline tomorrow, cold-launch VS Code, open a file, and have it render correctly with zero network reachable.

---

## Why a workspace split, and why now

Earlier drafts of this plan deferred a monorepo split as premature abstraction. That changes once there are two real, committed build targets, because of a concrete technical conflict: a VS Code extension's `package.json` needs fields (`publisher`, `contributes.customEditors`, `engines.vscode`, `activationEvents`) that structurally conflict with a Vite/Svelte web app's `package.json` (`"type": "module"`, browser build scripts, GH Pages deploy config). They can't cleanly share one manifest. A light two-package npm workspace split is the minimal correct fix for that conflict — not over-tooling.

What is genuinely host-agnostic and belongs in the shared engine: h5wasm slicing, OMX parsing, streaming aggregation, `math.worker.ts`, the Svelte runes store, and the viewer UI itself (grid, cells, modals) — Svelte and Web Workers run unmodified inside a VS Code webview, since a webview is just Chromium rendering a page. What's genuinely host-specific, and stays out of the engine: file acquisition, theme token resolution, and worker-script URL resolution (Vite's `new URL(..., import.meta.url)` worker pattern doesn't resolve to a valid URI inside a webview without going through `asWebviewUri()`).

### Repo structure

```
omx-viewer/
├── package.json                 # root: "workspaces": ["packages/*", "apps/*"]
├── packages/
│   └── engine/                  # host-agnostic, unpublished, npm workspace-linked only
│       └── src/
│           ├── services/        # h5wasmService, omxParser, duckdbService (streaming agg)
│           ├── workers/         # math.worker.ts only — duckdb.worker.ts deleted
│           ├── state/           # matrixStore.svelte.ts
│           ├── utils/           # constants, formatNumber, logger, arrowUtils
│           └── components/      # ViewerLayout, VirtualGrid, GridCell, modals, shared/*
│                                # NOT FileDropZone/LandingPage — browser-only UI
├── apps/
│   ├── web/                     # current GH Pages app, thinned
│   │   ├── vite.config.ts       # base: '/omx-viewer/'
│   │   ├── index.html           # fonts vendored locally — no Google Fonts CDN link
│   │   └── src/
│   │       ├── main.ts          # boots the engine
│   │       └── landing/         # FileDropZone, LandingPage — File→bytes conversion happens here
│   └── vscode-ext/
│       ├── package.json         # publisher, contributes.customEditors, engines.vscode
│       ├── .vscodeignore
│       └── src/
│           ├── extension.ts     # CustomEditorProvider, fs.readFile → postMessage bridge
│           └── webview/
│               └── main.ts      # boots the engine, receives bytes via postMessage
└── .github/workflows/
    ├── deploy-pages.yml         # triggers on packages/engine/** or apps/web/**
    └── publish-extension.yml    # triggers on packages/engine/** or apps/vscode-ext/**
                                  # builds one .vsix, publishes to both vsce and ovsx
```

- **Tooling**: npm workspaces (repo already uses npm; no justification yet for pnpm/Nx/Turborepo — two leaf packages don't need a task orchestrator).
- **Versioning**: `engine` is consumed via npm workspace linking (plain `"*"` version range in each app's `package.json`, matched by name to `packages/engine` — npm's workspace protocol is auto-detected, unlike Yarn/pnpm which need an explicit `workspace:*` specifier), never published to npm — a change lands in both apps in the same commit.
- **Distribution note**: since install happens while online in the target scenario, normal Marketplace/Open VSX install is fine — there's no need to force VSIX sideloading. The requirement is that everything needed is already inside the installed package, not fetched later.

---

## Stage 1 — Shared engine, web + VS Code parity, offline-hardened

Goal: the VS Code extension does exactly what the web app does today (view, scroll, arithmetic between matrices in one file, aggregation, CSV export, cell inspection) — nothing new, no geospatial. This scope has **no two-file requirement**: today's arithmetic feature already operates only on matrices within a single open file (`ArithmeticModal.svelte` draws both operands from `store.fileMatrixIds`, i.e. tabs of the one `store.file`), which maps directly onto VS Code's one-URI-per-webview `CustomEditorProvider` model with no state-model changes needed.

### 1.0 — De-risking spike (do first, gates everything else)
- [ ] Bare-bones webview loading h5wasm's WASM: does desktop VS Code actually require `crossOriginIsolated`/`SharedArrayBuffer` for anything in this stack, or was `coi-serviceworker` only needed for GitHub Pages' inability to set custom headers? The README claims the app "requires `crossOriginIsolated = true`" even though DuckDB already avoided SharedArrayBuffer via `MANUAL_BUNDLES` — confirm what specifically needs it (if anything) before designing the webview HTML around an assumption.
- [ ] Confirm CSP requirements for WASM instantiation (`'wasm-unsafe-eval'`) and nested Web Workers (`worker-src`) in a webview with a minimal repro.

### 1.1 — Workspace extraction
- [ ] Set up `packages/engine`, `apps/web`, `apps/vscode-ext` per the structure above.
- [ ] Move current `src/lib` into `packages/engine` (mechanical — imports and paths only).
- [ ] Thin `apps/web` down to entry point, landing/drop-zone UI, build config.
- [ ] Verify GH Pages deploy still works unchanged end-to-end from the new layout.
- [ ] **Delete `duckdb.worker.ts`** — unused, and carrying it forward adds no value; if DuckDB earns a role in Stage 2 (see below), reintroduce it deliberately with a bounded, tested memory pattern, not as leftover dead code.

### 1.2 — Host-neutral engine boundary (revised — no `HostAdapter` object)

An earlier draft of this plan sketched a formal `HostAdapter` interface (`getFileBytes()`, `resolveWorkerUrl()`) injected into the engine. Implementing Task 5 surfaced two concrete reasons that shape doesn't actually fit, so the design below replaces it:

1. **File acquisition is inherently asymmetric between hosts** — browser drag-drop is a UI event the user triggers; VS Code's flow is the extension host already knowing which URI it's bound to and pushing bytes in. Forcing both behind one polled interface method (`getFileBytes()`) doesn't fit either flow naturally.
2. **Worker construction can't be abstracted behind an injected function without breaking Vite.** Vite bundles `new Worker(...)` correctly only by statically recognizing the literal `new URL('...', import.meta.url)` expression at its exact call site in `duckdbService.ts`. Moving that behind a runtime-injected `resolveWorkerUrl()` call would make Vite unable to find and chunk the worker file at all, for either app.

**What's actually done instead:** the engine's public functions take host-neutral primitives (`Uint8Array`, `string`) instead of browser-specific types. `openOMXFile(file: File)` became `openOMXFile(name: string, bytes: Uint8Array)`; `validateHDF5Magic(file: File)` became the synchronous `validateHDF5MagicBytes(bytes: Uint8Array)`. Each host's own entry-point code is responsible for producing those primitives however is natural for that host:
- `apps/web`: `FileDropZone.svelte` still receives a browser `File` (unavoidable — that's what drag-drop and `<input type=file>` hand you) and does its own lazy 8-byte slice for the cheap magic-byte pre-check; `App.svelte` does the full `file.arrayBuffer()` read right before calling `openOMXFile()`.
- `apps/vscode-ext` (Task 6): the webview's `main.ts` will do the equivalent — receive a `Uint8Array` via `postMessage` from the extension host, call the same `openOMXFile(name, bytes)` unchanged.

- [x] `openOMXFile` and `validateHDF5MagicBytes` take host-neutral primitives — no `File` type in `packages/engine`'s public surface.
- [x] `apps/web` (`FileDropZone.svelte`, `App.svelte`) does its own File→bytes conversion at the boundary, confirmed working end-to-end (open, scroll, arithmetic, aggregation — including on arithmetic-result tabs — and CSV export all manually verified).
- [x] **Worker construction — resolved empirically in Task 6 after two failed approaches, hypothesis was wrong.** The earlier guess ("this may already work once the webview loads via `asWebviewUri()`") was incorrect. Two things were tried and both failed for real, reproducible reasons (not hypothetical):
  1. Direct `new Worker(new URL('../workers/math.worker.ts', import.meta.url), {type:'module'})` — throws `Failed to construct 'Worker'`. A webview's document origin (`vscode-webview://<uuid>`) doesn't match the origin scripts are served from (`vscode-resource.vscode-cdn.net`), and browsers require same-origin for direct Worker construction. (Loading the *main* script via `<script src>` still works fine — that's a different, CSP-governed check, not a same-origin one.)
  2. Falling back to `fetch()` that same URL as text, then constructing from a `blob:` URL — failed too, with `Failed to fetch`. Likely the same cross-origin restriction applies to programmatic `fetch()` even though element-based loading is more permissive.
  - **Actual fix**: Vite's `?worker&inline` import suffix (`import MathWorkerConstructor from '../workers/math.worker.ts?worker&inline'` in `duckdbService.ts`) compiles the worker and embeds it as a `data:text/javascript` URL directly in the bundle at build time — no separate network resource to fetch, no cross-origin boundary to cross. Works identically in both apps (worker is ~1KB, inlining cost is negligible), no host-specific setup needed in either. Webview CSP needs `data:` (and `blob:`, harmless to keep) in `worker-src`.
  - **Sharp edge found while debugging approach #1, worth flagging for any future worker changes even though the final fix doesn't use this pattern anymore**: when using a raw `new URL(..., import.meta.url)` + `new Worker(...)` pair, the `new URL(...)` must be *inlined directly* as the Worker constructor's argument — assigning it to a `const url = ...` first and passing the variable, even one line above, silently breaks Vite's static worker-bundling detection with no build error, and the worker 404s at runtime.

### 1.3 — VS Code extension shell
- [x] Register `CustomEditorProvider` for `.omx`, `.h5`, `.hdf5` (`contributes.customEditors`) — implemented as `CustomReadonlyEditorProvider` (no save/revert needed, matches the viewer being read-only).
- [x] Skip the landing page in the webview entirely — file arrives via an `init` postMessage from the extension host; the webview boots straight into `ViewerLayout`. Confirmed end-to-end: open, scroll, arithmetic, aggregation, CSV export all manually verified in the actual Extension Development Host, not just build/typecheck.
- [ ] Theme integration: VS Code's `--vscode-editor-background` etc. CSS variables in place of the custom dark/light toggle. Shipped with the fixed dark theme for Task 6's functional-parity verification — **now being addressed in 1.7 below.**
- [x] Right-click "Open With" registration works (that's how the file was opened for testing).
- [ ] Command palette action ("OMX: Export Summary as CSV") — **now being addressed in 1.7 below.**

**Two more empirically-discovered fixes beyond the worker issue above, same "verify, don't assume" pattern:**
- **File transfer must be base64, not a raw `Uint8Array`.** Assumed VS Code's webview `postMessage()` preserves typed arrays via structured clone — wrong. It JSON-serializes them, and since `vscode.workspace.fs.readFile()` returns a Node `Buffer`, that means `Buffer.toJSON()`'s `{type:'Buffer', data:[...]}` wrapper arrives on the receiving end instead. Fixed by explicitly encoding to base64 on the extension host (`Buffer.from(bytes...).toString('base64')`) and decoding via `atob()` in the webview — reliable regardless of postMessage's actual serialization mechanism, and more compact than the number-array shape that was happening by accident anyway.
- **CSV export needs a host-installed save handler.** The existing `downloadTextFile()` (Blob URL + programmatic `<a download>` click) is browser-only — confirmed it silently no-ops inside a VS Code webview's sandboxed iframe (no error, just does nothing). Unlike the worker case there's no synchronously-catchable failure to self-heal from, so this needed an explicit seam: `setFileSaveHandler()` in `formatNumber.ts`, defaulting to the existing browser behavior, with `apps/vscode-ext` installing a handler that posts content to the extension host, which uses `vscode.window.showSaveDialog()` + `vscode.workspace.fs.writeFile()`.
- Also found and fixed along the way (real bugs, not host-specific): a message-listener race (registering `onDidReceiveMessage` *after* setting `.html` could lose the webview's initial `'ready'` message if the webview loaded fast enough — now registered first) and a Node `"type":"module"` pitfall (esbuild's CJS-syntax output must be named `.cjs`, not `.js`, or the extension host fails to activate with "module is not defined").

### 1.4 — Offline hardening (required, not optional)
- [x] **Vendor Inter + JetBrains Mono locally.** Fixed via `@fontsource/inter` + `@fontsource/jetbrains-mono` as `packages/engine` dependencies, imported through a new `packages/engine/src/styles/fonts.css` (all 4 weights used, `400/500/600/700`, full default subset coverage for correctness over bundle-size optimization) — both apps import it via `@omx-viewer/engine/styles/fonts.css`, same pattern as the other shared stylesheets. Removed the `fonts.googleapis.com`/`fonts.gstatic.com` `<link>` tags from `apps/web/index.html`. Confirmed zero remaining external font references in built output (`grep`'d `dist/index.html` and the built CSS — 0 matches) and confirmed the actual `.woff/.woff2` files land in both apps' build output as local assets.
- [x] **Strict webview CSP** — already effectively done as a side effect of Task 6's implementation (`default-src 'none'` baseline, `'wasm-unsafe-eval'` not the broader `'unsafe-eval'`, no `connect-src` since nothing needs fetch, every directive scoped to `${csp}`/local schemes only, no external host ever listed). `font-src` now correctly needs no external host either, now that fonts are vendored.
- [x] Confirm `h5wasm`'s WASM assets are link-time bundled, not fetched — reconfirmed unchanged (base64-inlined in JS). `duckdb-wasm` is moot — deleted in Task 3.
- [x] **Verify the built `.vsix` actually contains the bundled JS/font/WASM assets** — packaged with `vsce package --no-dependencies` and inspected the real file tree (not assumed): `dist-webview/main.js`, `main.css` (fonts inlined), `assets/` (92 font files), `chunks/hdf5_hl.js` (h5wasm, 4.57MB), and `out/extension.cjs` are all present. Also fixed two `vsce` packaging warnings found along the way (missing `repository` field, missing `LICENSE` — `vsce` checks for a license file within the extension's own directory, not the repo root, so it's copied into `apps/vscode-ext/LICENSE`). Final `vsce package` run: zero warnings.

### 1.5 — Offline test gate (release-blocking) — **DEFERRED at user's request, not dropped**
Skipped for now to keep moving through the remaining Stage 1 tasks. This is still the real proof of the "install today, use tomorrow with no internet" scenario the whole plan was designed around (per the earlier conversation about exactly that use case) — resume this before considering the extension actually release-ready. Nothing about Task 8 being skipped changes the offline-hardening work already done in 1.4; it just means that work hasn't been end-to-end *proven* yet, only built correctly to the best of static verification.
- [ ] Install the extension while connected (Marketplace or manual VSIX — either is fine, since install happens online in the target scenario).
- [ ] **Fully quit VS Code**, disable networking at the OS level, cold-relaunch VS Code (this specifically tests first-activation-while-offline, not just mid-session disconnect).
- [ ] Open an `.omx` file via "Open With," confirm: grid renders with correct fonts, scrolling loads new chunks, arithmetic runs, aggregation runs, CSV export works — all with zero network reachable.

### 1.6 — CI / publishing
- [x] Two path-filtered workflows, both YAML-validated (not just assumed correct):
  - `deploy-pages.yml` — triggers on `packages/engine/**` or `apps/web/**`, builds via `npm run build --workspace=apps/web`, deploys `apps/web/dist` (path updated from the pre-monorepo `./dist`).
  - `publish-extension.yml` — triggers on `packages/engine/**` or `apps/vscode-ext/**`. **Deliberately safety-gated**: every relevant push builds the extension, packages one `.vsix`, and uploads it as a downloadable workflow artifact (safe, non-destructive, also useful on its own for manual sideload testing/distribution) — but the actual `vsce publish` / `ovsx publish` steps only run on an explicit manual `workflow_dispatch` with a `publish: true` input, never automatically on push. Publishing to the Marketplace and Open VSX is a real, public, hard-to-reverse action and this repo has no publisher account or `VSCE_PAT`/`OVSX_PAT` secrets configured yet — auto-publishing on every merge before that exists would be actively wrong, not just premature.

### 1.7 — VS Code native theming + command palette action
Picks up the two items explicitly deferred in 1.3. Decided after checking how Positron's Data Explorer and Microsoft's Data Wrangler actually achieve their native look (neither documents a custom palette — both are ordinary VS Code webviews using the standard `--vscode-*` token system, which any webview gets automatically). So "look like Positron's data viewer" is best achieved by drawing from the *same token source*, not by hand-matching colors from a screenshot — this also means it automatically matches Positron's own chrome specifically (Positron is a VS Code fork and injects the same tokens), and adapts correctly to any theme, including ones never tested against.

**Decision (confirmed with user): fully native, not hybrid.** `apps/web` (the browser app) keeps its navy/amber brand palette completely unchanged — only `apps/vscode-ext` changes. No amber anywhere in the extension; every color comes from a `--vscode-*` token, including the accent (`--color-accent` → `var(--vscode-focusBorder)`).

- [ ] Add a third `[data-theme="vscode"]` block to `packages/engine/src/styles/theme.css` mapping all ~40 existing tokens (no component CSS needs to change — everything already goes through these custom properties). Notable mappings: `--color-positive/-negative/-warning` → `var(--vscode-charts-green/red/yellow)` (real tokens that exist specifically for data-viz semantic coloring); `--color-tab-active-bg/-hover-bg` → `var(--vscode-tab-activeBackground/-hoverBackground)` (literal direct tokens); `--font-sans/--font-mono` → `var(--vscode-font-family)/var(--vscode-editor-font-family)`.
- [ ] Only **one** vscode-theme block is needed, not separate light/dark variants — `var(--vscode-*)` tokens already resolve to the right value for whatever the user's actual active theme is, dark/light/high-contrast alike, and VS Code live-updates them on theme change with no JS needed on our side. This directly satisfies "theme should switch with VS Code's theme switch, no separate switcher needed."
- [ ] Since fonts now come from `var(--vscode-font-family)`/`var(--vscode-editor-font-family)`, remove the `@omx-viewer/engine/styles/fonts.css` import from `apps/vscode-ext/src/webview/main.ts` — smaller bundle, and correctly follows the user's actual configured VS Code font instead of forcing Inter/JetBrains Mono regardless.
- [ ] `extension.ts`: `data-theme="dark"` → `data-theme="vscode"` in the HTML template.
- [ ] `VscodeApp.svelte`: remove the `store.applyThemeToDom(store.theme)` effect — that's browser-toggle-specific and would fight the hardcoded `vscode` value.
- [ ] `ThemeToggle.svelte` (shared, used inside `ViewerLayout.svelte`): self-hide when `document.documentElement.dataset.theme === 'vscode'` — a self-contained check inside the component, no prop drilling through `ViewerLayout`, `apps/web` unaffected.
- [ ] Command palette action `omxViewer.exportSummaryCsv` ("OMX: Export Summary as CSV") — extension host tracks the active OMX `WebviewPanel` (`.active` is a real queryable property) and posts a `triggerExportSummary` message on invocation; webview reuses the exact CSV export path already built in Task 6 (`store.summaryResult` → `downloadTextFile` → installed `saveFile` handler), no new export logic. Friendly `showInformationMessage` if no summary has been generated yet, instead of silently no-op'ing.
- [ ] Optional/cheap once the command exists: also add it to `contributes.menus` → `editor/title` as an icon button.

---

## Stage 2 — Geospatial enhancements

Do not start until Stage 1 ships and passes its offline gate. Everything here is additive on top of the shared engine and touches neither app's core viewer.

### 2.1 — GIS companion file loading
A zone geometry file is a **lightweight reference dataset joined to the already-open matrix by zone ID** — structurally the same role as the OMX file's own internal `/lookup/` zone-label tables, just external because HDF5 has nowhere to store geometry. It is not a second matrix session and doesn't need the heavier machinery a second `.omx` file would.
- [ ] Add a host-specific "pick an auxiliary file" entry point on each app, both producing the same `{ name, bytes }` shape for the engine's join logic to consume (same pattern as the main file-open path in 1.2 — no shared interface object needed, just a consistent output shape):
  - Browser: file input / drop target with an accept filter, converts to bytes the same way `App.svelte` already does for the primary file.
  - VS Code: webview → extension host message → `vscode.window.showOpenDialog()` → `vscode.workspace.fs.readFile()` → `postMessage` back into the *same* already-open webview. No chunking concerns — zone files are typically KB-to-low-MB, not hundreds of MB.
- [ ] Join logic (zone ID → row/col index, centroid computation) lives entirely in `packages/engine`, host-agnostic.
- [ ] VS Code native affordance (do this — it's a genuine platform advantage, not a stretch): remember the `.omx` → GIS-file pairing via `context.workspaceState`, auto-loading it on next open of the same file. The browser has no clean equivalent (File System Access handle persistence is fragile/Chromium-only), so this is a real "better on this platform" win, not a vague one.

### 2.2 — Vector format support: narrower than "all GDAL formats," and decoupled from DuckDB
- [ ] **Scope formats to what this domain actually uses**: GeoJSON (native, no conversion needed), Shapefile, GeoPackage, and KML if there's real demand. Not "every GDAL driver" — that's 100+ formats, most of which no transportation planner will ever hand this tool, and each one adds bundle size and offline-verification surface for no real user.
- [ ] **Use a dedicated GDAL-compiled-to-WASM library (e.g. `gdal3.js`) purely as a format→GeoJSON conversion step**, not DuckDB's spatial extension. Reasons, established by spiking the alternative first:
  - DuckDB's extension mechanism (`INSTALL`/`LOAD`) is fetch-based by default; whether it can be reliably pointed at a local/offline extension repository for the WASM build specifically is unverified and needs its own spike — a self-contained npm package bundled the same way h5wasm/duckdb-wasm already are (`?url` import, no runtime extension-fetch) sidesteps this entirely.
  - It's unverified whether duckdb-wasm's spatial extension WASM build carries the same GDAL driver breadth as the native build (WASM ports of GDAL commonly trim drivers with awkward native dependencies) — don't assume format coverage without confirming it.
  - This also keeps DuckDB out of the geospatial-file-reading path entirely, avoiding any temptation to route it through the OD-matrix-shaped risk discussed below.
- [ ] **Spike before committing** (same discipline as the 1.0 spike): load a Shapefile and a GeoPackage through the candidate library fully offline, confirm the resulting asset bundles locally into both `apps/web`'s `dist/` and `apps/vscode-ext`'s `.vsix`, and record the actual bundle-size cost.

### 2.3 — View modes (reuse what already exists — most of this needs no new data layer)
- [ ] **Choropleth** (single row/col slice) — already `sliceMatrixRows()`. No new engine work.
- [ ] **Aggregated choropleth** (row/col sums) — already `runAggregation()` in `duckdbService.ts` (streaming, no DuckDB). No new engine work.
- [ ] **Diff mode** (elementwise between two matrices) — already `math.worker.ts` for the arithmetic itself. New part: loading a *second file* for comparison (see 2.4).
- [ ] **Flow map / desire lines** (top-N OD pairs by magnitude) — the one genuinely new primitive. Default approach: a bounded streaming top-K reducer over the same chunked reads already used everywhere else (no full-matrix materialization, no DuckDB required). If SQL expressiveness is specifically wanted here, DuckDB can do this too — see 2.5 for the bounded pattern that keeps it safe.
- [ ] Rendering: MapLibre GL for the online/full mode; flat polygon fill with no basemap tiles as an explicit offline mode default for VS Code, since online basemap tiles are themselves a live network call that would break the offline guarantee established in Stage 1.

### 2.4 — Cross-file loading pattern (only needed if/when true multi-OMX-file diff is wanted)
Today's arithmetic is single-file, multi-matrix (Stage 1 scope, no change needed). If cross-file diff (e.g., baseline run vs. build-alternative run, each its own `.omx`) becomes a real requirement:
- [ ] Load the second file into the **same** running webview via the extension host (`showOpenDialog` → `readFile` → `postMessage`), generalizing `AppState.file` to `file` + optional `compareFile`. This is what makes one overlaid diff/comparison view possible.
- [ ] Do **not** implement this as two independent `CustomEditorProvider` tabs cross-talking through the extension host — worse UX (two separate grids, not one comparison view) and more moving parts (a registry of open OMX webviews + a relay protocol).
- [ ] Consider whether this deserves its own entry point (a command-palette "OMX: Compare Two Files" opening a dedicated `vscode.window.createWebviewPanel()`, not bound to a single document) rather than overloading the single-file editor with a mode it wasn't designed for. Decide at kickoff, not before.

### 2.5 — DuckDB's actual role in Stage 2 (narrower and more deliberate than earlier drafts)
The original framing of "DuckDB as the query layer" for Stage 2 was too broad. Its correct, deliberate roles here:
- **GIS zone attribute table.** Thousands of zone polygons with attributes is exactly DuckDB's shape (moderate rows, moderate columns) — real value from `WHERE`/`JOIN`/attribute filtering for the map UI. Good fit, low risk.
- **Bounded per-matrix flow-map top-N, only if SQL expressiveness is specifically wanted over a hand-rolled heap.** If used, it must follow a register → query → drop discipline *per matrix* (never hold more than one matrix's data in DuckDB at a time) — this is what the original 2023 implementation got wrong (it held all matrices simultaneously for "all matrices" scope, which is what actually caused the OOM, not an inherent DuckDB memory ceiling). Verify actual memory headroom against the app's stated ceiling (10,000×10,000) before relying on this, not just against the one test file already in the docs.
- **An ad-hoc SQL console**, only if there's a real desire for users to write arbitrary queries against their matrix/zone data. This is the scenario where DuckDB's flexibility is worth its overhead, since it's a capability fixed JS loops fundamentally can't provide. Not committed yet — flag as a decision to make explicitly, not assume.
- **Not** a wholesale replacement for the existing streaming aggregation (`SUM`/`MIN`/`MAX`/etc. by row/col) — that's already correct, already O(one chunk), and cannot OOM regardless of file size. DuckDB doesn't improve on that for a fixed, known set of functions; it would only add Arrow-serialization and worker-lifecycle overhead for the same numbers.
- **Never** raise `memory_limit` as a substitute for the register→query→drop discipline above — a bigger ceiling delays a crash, it doesn't remove the failure mode, and it competes for memory with h5wasm's own footprint on exactly the memory-constrained offline machines this project targets.

### 2.6 — Offline verification for Stage 2 additions
- [ ] Extend the Stage 1 offline test gate (1.5) to cover: GIS file loading, format conversion (Shapefile/GeoPackage), and map rendering in flat/no-basemap mode — all with zero network reachable.
- [ ] If DuckDB's spatial extension or the GDAL-WASM library is used, confirm their binaries are actually inside the packaged `.vsix` (same unzip-and-check discipline as 1.4) and record the bundle-size delta.

---

## Explicitly deferred / ruled out

- **Full monorepo tooling (Nx/Turborepo, pnpm)** — two leaf packages don't need it; revisit only if build orchestration pain actually shows up.
- **"All GDAL formats"** — narrowed to GeoJSON/Shapefile/GeoPackage(/KML) based on actual domain usage; extend later only on a real request.
- **DuckDB as the default engine for OD-matrix data** — stays out of the core aggregation path; only earns a role under the bounded, deliberate conditions in 2.5.
- **`memory_limit` increases as a fix** — addresses a symptom, not the register→query→drop root cause, and doesn't hold at the app's own stated 10,000×10,000 ceiling.
- **"Git-diff of matrices"** — mentioned once in early drafts with no design; cut until it's actually scoped as its own effort.
- **Forcing VSIX-only sideload distribution** — unnecessary; normal Marketplace/Open VSX install is fine since install happens while online in the target scenario. What matters is that the installed package is self-contained afterward.

---

## Sequencing & rough effort

1. **Stage 1.0 (spike)** — ~1 day, gates everything else.
2. **Stage 1.1–1.2 (workspace split + adapter seam)** — ~2-3 days, mechanical given the codebase is already reasonably modular.
3. **Stage 1.3–1.4 (extension shell + offline hardening)** — ~3-5 days once the spike de-risks CSP/COI.
4. **Stage 1.5–1.6 (offline gate + CI/publishing)** — ~1-2 days.
5. **Stage 2.1 (GIS file loading)** — small, ~1-2 days, reuses the adapter pattern directly.
6. **Stage 2.2 (format spike + conversion library)** — ~2-3 days for the spike, more for full integration depending on what it finds.
7. **Stage 2.3–2.4 (view modes + cross-file pattern)** — the largest remaining chunk; mostly rendering work since the data layer for 3 of 4 view modes already exists.
8. **Stage 2.5 (DuckDB roles)** — only as much as 2.3/2.4 actually require; don't build ahead of a concrete need.

## Open questions

- [ ] Does `crossOriginIsolated` actually gate anything in a desktop VS Code webview for this stack specifically? (Stage 1.0)
- [ ] Does `duckdb-wasm`'s extension-loading mechanism support a reliable local/offline override for the spatial extension, if it's ever used? (Stage 2.2, only if DuckDB spatial is chosen over GDAL-WASM)
- [ ] Is there real user demand for an ad-hoc SQL console, or is flow-map top-N the only place DuckDB's query flexibility would actually be used? (Stage 2.5)
- [ ] Target desktop VS Code only initially, or also vscode.dev/github.dev? (Affects how much the Stage 1.0 spike's answer actually matters — vscode.dev has stricter isolation requirements than desktop.)
