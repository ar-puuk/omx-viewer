// Public entry point for @omx-viewer/engine — the host-agnostic surface
// consumed by apps/web and (from Task 6) apps/vscode-ext. Everything else
// under src/ is internal to the engine and should not be imported directly
// from outside this package.

export { default as ViewerLayout } from './components/viewer/ViewerLayout.svelte'
export { default as LoadingOverlay } from './components/shared/LoadingOverlay.svelte'
export { default as ErrorBanner } from './components/shared/ErrorBanner.svelte'

export { store } from './state/matrixStore.svelte.js'
export type { MatrixFile, MatrixTab, SummaryConfig, SummaryResult, PinnedCell, AppError } from './state/matrixStore.svelte.js'

export { openOMXFile, closeCurrentFile, isFileOpen } from './services/h5wasmService.js'
export { OMXValidationError, validateHDF5MagicBytes } from './services/omxParser.js'
export { computeArithmetic, terminateWorkers } from './services/duckdbService.js'

export { FILE_SIZE_WARN_BYTES, ACCEPTED_FILE_EXTENSIONS } from './utils/constants.js'
export { formatFileSize, setFileSaveHandler } from './utils/formatNumber.js'
export type { FileSaveHandler } from './utils/formatNumber.js'
export { logger } from './utils/logger.js'
