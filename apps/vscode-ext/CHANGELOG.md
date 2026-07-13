# Changelog

All notable changes to the "OMX Viewer" VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Extension icon had an opaque dark background baked in, which looked out of place
  against VS Code's light theme and light-themed Marketplace pages. Regenerated with
  a transparent background so it adapts to any surrounding theme.

## [0.1.1] - 2026-07-13

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
  h5wasm/HDF5 library and the Codicons icon font.

## [0.1.0] - 2026-07-13

### Added

- Initial release.
- Native custom editor for `.omx`, `.h5`, and `.hdf5` files.
- Virtualized matrix grid with chunked/lazy loading (matrices up to 10,000 × 10,000).
- Matrix picker for files containing multiple matrices.
- Aggregation summary (SUM / MIN / MAX / MEAN / MEDIAN / STD DEV / COUNT NON-ZERO),
  by row or by column, across the active matrix or all matrices.
- CSV export via the toolbar button or the **OMX: Export Summary as CSV** command.
- Element-wise matrix arithmetic (add / subtract / multiply / divide) between two
  matrices in the file.
- Cross-matrix cell inspector.
- Native VS Code theming — colors, spacing, and icons follow the active theme.

[Unreleased]: https://github.com/ar-puuk/omx-viewer/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/ar-puuk/omx-viewer/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ar-puuk/omx-viewer/releases/tag/v0.1.0
