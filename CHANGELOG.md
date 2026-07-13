# Changelog

All notable changes to OMX Viewer — the web app (GitHub Pages) and the VS Code
extension, which share a common engine (`packages/engine`) and are versioned
together — are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.2] - 2026-07-13

### Added

- Adopted lockstep versioning: the web app, VS Code extension, and shared engine
  now bump together on every release, instead of drifting independently.
- This changelog. The VS Code extension's own `CHANGELOG.md` (rendered by the
  Marketplace as the extension's "Changelog" tab) is now generated from this file
  at build time — see `apps/vscode-ext/scripts/copy-changelog.js` — so there is a
  single source of truth.

### Fixed

- VS Code extension: the icon had an opaque dark background baked in, which looked
  out of place against VS Code's light theme and light-themed Marketplace pages.
  Regenerated with a transparent background so it adapts to any surrounding theme.

## [0.1.1] - 2026-07-13

> Released for the VS Code extension only. The web app received the same
> underlying fixes via continuous deployment to GitHub Pages, but its own
> `package.json` version didn't bump until 0.1.2, when lockstep versioning was
> adopted.

### Fixed

- Cell navigator (Row/Col + Go) now resolves input against the zone labels shown in
  the grid headers instead of only the raw 0-based row/column index — entering the
  zone ID visible in the header now lands on the correct cell instead of landing one
  row/column off.
- Accessibility: the matrix grid, cross-matrix cell inspector list, and the
  arithmetic operation picker now use correct ARIA roles/labels and real focusable
  controls instead of non-interactive elements with manual click/keyboard handlers.

### Security

- Fixed a CSV/formula injection vulnerability (CWE-1236) in both the grid "Export to
  CSV" and Summary panel "Download CSV" actions — zone labels and matrix names read
  from the opened OMX file are now sanitized before being written to exported CSV
  files, preventing a crafted file from injecting a spreadsheet formula into the
  export.

### Added

- Third-party license notices (`THIRD-PARTY-NOTICES.md`) covering the bundled
  h5wasm/HDF5 library, the Codicons icon font, and bundled fonts.

## [0.1.0] - 2026-07-13

Initial release, following the restructure into a shared-engine monorepo
(`packages/engine` consumed by both `apps/web` and `apps/vscode-ext`).

### Added

- Native custom editor for `.omx`, `.h5`, and `.hdf5` files (VS Code extension) /
  drag-and-drop file loading (web app) — no server, no upload, all processing local
  via WebAssembly.
- Virtualized matrix grid with chunked/lazy loading (matrices up to 10,000 × 10,000).
- Matrix picker for files containing multiple matrices.
- Aggregation summary (SUM / MIN / MAX / MEAN / MEDIAN / STD DEV / COUNT NON-ZERO),
  by row or by column, across the active matrix or all matrices.
- CSV export via the toolbar button, the Summary panel, or (VS Code) the
  **OMX: Export Summary as CSV** command.
- Element-wise matrix arithmetic (add / subtract / multiply / divide) between two
  matrices in the file.
- Cross-matrix cell inspector.
- Dark/light theme toggle (web app) / native VS Code theming (extension).

[Unreleased]: https://github.com/ar-puuk/omx-viewer/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/ar-puuk/omx-viewer/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ar-puuk/omx-viewer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ar-puuk/omx-viewer/releases/tag/v0.1.0
