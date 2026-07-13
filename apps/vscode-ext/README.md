# OMX Viewer

Browser-native OMX / HDF5 matrix explorer, now inside VS Code. Open `.omx`, `.h5`, or `.hdf5` files directly in the editor — no server, no upload, no external viewer. Everything runs locally via WebAssembly inside the extension's webview.

> Also available as a standalone web app: [omx-viewer on GitHub Pages](https://github.com/ar-puuk/omx-viewer).

## Features

- **Native custom editor** — right-click any `.omx`/`.h5`/`.hdf5` file and choose **Open With → OMX Viewer**, or just open it directly; it's the default editor for these extensions
- **Virtualized matrix grid** — smooth scrolling on matrices up to 10,000 × 10,000, using chunked/lazy loading so the full matrix is never held in memory at once
- **Matrix picker** — every matrix in the file is available from a dropdown, top-right of the editor
- **Aggregation summary** — SUM / MIN / MAX / MEAN / MEDIAN / STD DEV / COUNT NON-ZERO, by row or by column, across the active matrix or all matrices at once
- **CSV export** — export a summary table via the toolbar button or the **OMX: Export Summary as CSV** command (`Ctrl+Shift+P` / `Cmd+Shift+P`), which saves through VS Code's native save dialog
- **Matrix arithmetic** — element-wise add/subtract/multiply/divide between two matrices in the file, opened as a temporary result tab
- **Cell inspector** — click a cell to pin it; see its value across every matrix in the file at the same `[row, col]` coordinate
- **Native theming** — colors, spacing, and icons follow your active VS Code theme automatically; no separate light/dark toggle to manage

## Requirements

None — no external binaries, no Python, no network access. The HDF5 reader (h5wasm) is bundled as WebAssembly inside the extension.

## Known Limitations

- Read-only: this is a viewer, not an editor for OMX file contents
- Recommended up to ~700 MB per file; very large files may be limited by available memory
- Element-wise arithmetic loads both operand matrices into memory at once (~2× matrix size)

## About OMX

OMX (Open Matrix Format) is an HDF5-based convention for storing one or more named matrices plus optional zone lookup tables, widely used in transportation demand modeling.

## License

MIT — see [LICENSE](LICENSE). Bundled third-party components (h5wasm/HDF5,
codicons, fonts) carry their own licenses — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
