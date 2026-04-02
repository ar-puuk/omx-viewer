/**
 * constants.ts — All named constants for the omx-viewer application.
 * No magic numbers anywhere else in the codebase — import from here.
 */

// ---------------------------------------------------------------------------
// Grid / Virtualization
// ---------------------------------------------------------------------------

/** Height of each data row in the virtual grid (px). Must match --grid-row-height in grid.css. */
export const ROW_HEIGHT = 32

/** Default width of each data column (px). Must match --grid-col-width in grid.css. */
export const COL_WIDTH = 88

/** Height of the sticky column-header row (px). Must match --grid-header-height in grid.css. */
export const HEADER_HEIGHT = 32

/** Width of the sticky row-index column (px). Must match --grid-row-header-width in grid.css. */
export const ROW_HEADER_WIDTH = 72

/** Number of extra rows rendered outside the visible viewport by TanStack Virtual. */
export const GRID_ROW_OVERSCAN = 5

/** Number of extra columns rendered outside the visible viewport by TanStack Virtual. */
export const GRID_COL_OVERSCAN = 3

/** Maximum rows rendered in the DOM simultaneously. TanStack Virtual enforces this. */
export const MAX_DOM_ROWS = 30

/** Maximum columns rendered in the DOM simultaneously. TanStack Virtual enforces this. */
export const MAX_DOM_COLS = 20

// ---------------------------------------------------------------------------
// Chunked Loading / LRU Cache
// ---------------------------------------------------------------------------

/**
 * Default number of rows to fetch per h5wasm slice call.
 * Dynamically overridden per-matrix to align with the HDF5 native chunk shape.
 * See h5wasmService.getAlignedChunkSize().
 */
export const DEFAULT_ROW_CHUNK_SIZE = 200

/**
 * Maximum number of row-chunks held in the per-matrix LRU cache.
 * When exceeded, the least-recently-used chunk is evicted.
 * 20 chunks × 200 rows × 10,000 cols × 8 bytes ≈ 320 MB — a safe upper bound.
 */
export const MAX_CACHED_CHUNKS = 20

/** Debounce delay (ms) applied to scroll events before triggering new slice requests. */
export const SCROLL_DEBOUNCE_MS = 50

// ---------------------------------------------------------------------------
// Number Formatting
// ---------------------------------------------------------------------------

/** Available decimal place options for cell value display. */
export const DECIMAL_OPTIONS = [0, 2, 4, 6] as const
export type DecimalOption = (typeof DECIMAL_OPTIONS)[number]

/** Default decimal places shown in the matrix grid. */
export const DEFAULT_DECIMAL_PLACES: DecimalOption = 2

/** Threshold above which compact notation (1.2M, 3.4B) is offered as an option. */
export const COMPACT_NOTATION_THRESHOLD = 1_000_000

// ---------------------------------------------------------------------------
// DuckDB / Aggregation
// ---------------------------------------------------------------------------

/**
 * Maximum rows sent to DuckDB in a single Arrow IPC batch during
 * chunked matrix registration. Keeps individual postMessage payloads small.
 */
export const DUCKDB_BATCH_ROWS = 500

/** Timeout (ms) to wait for a DuckDB worker response before rejecting. */
export const DUCKDB_TIMEOUT_MS = 120_000

// ---------------------------------------------------------------------------
// Math Worker
// ---------------------------------------------------------------------------

/** Timeout (ms) to wait for a math worker arithmetic result before rejecting. */
export const MATH_WORKER_TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// Application Layout
// ---------------------------------------------------------------------------

/** Height of the top header bar (px). Must match --header-height in global.css. */
export const HEADER_HEIGHT_PX = 48

/** Height of the matrix tab bar (px). Must match --tabbar-height in global.css. */
export const TABBAR_HEIGHT_PX = 40

/** Height of the grid toolbar (px). Must match --toolbar-height in global.css. */
export const TOOLBAR_HEIGHT_PX = 48

/** Width of the collapsible metadata sidebar when open (px). */
export const SIDEBAR_WIDTH_PX = 260

/** Height of the collapsible summary panel drawer when open (px). */
export const SUMMARY_PANEL_HEIGHT_PX = 320

// ---------------------------------------------------------------------------
// OMX / HDF5 Schema
// ---------------------------------------------------------------------------

/** HDF5 group path where matrix datasets live. */
export const MATRICES_GROUP = 'matrices'

/** HDF5 group path where lookup tables live. */
export const LOOKUP_GROUP = 'lookup'

/** Root-level HDF5 attribute containing the OMX version string. */
export const OMX_VERSION_ATTR = 'omx_version'

/** Root-level HDF5 attribute containing the matrix shape as an int array. */
export const OMX_SHAPE_ATTR = 'shape'

// ---------------------------------------------------------------------------
// File Validation
// ---------------------------------------------------------------------------

/** Accepted file extensions for the file picker. */
export const ACCEPTED_FILE_EXTENSIONS = ['.omx', '.h5', '.hdf5']

/** Accepted MIME types (browsers vary — h5/omx have no official MIME). */
export const ACCEPTED_MIME_TYPES = [
  'application/x-hdf',
  'application/x-hdf5',
  'application/octet-stream',
  ''   // many browsers report empty string for unknown binary types
]

/**
 * Warn the user if the file exceeds this size (bytes).
 * 750 MB — still operable but approaching memory limits on 32-bit processes.
 */
export const FILE_SIZE_WARN_BYTES = 750 * 1024 * 1024

/**
 * HDF5 magic bytes (first 8 bytes of every valid HDF5 file).
 * Used to validate the file before attempting to parse it.
 */
export const HDF5_MAGIC = new Uint8Array([
  0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a
])

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Available application themes. */
export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

/** Default theme applied on first load. */
export const DEFAULT_THEME: Theme = 'dark'

/** sessionStorage key for persisted theme preference. */
export const THEME_STORAGE_KEY = 'omx-viewer:theme'

// ---------------------------------------------------------------------------
// Session Storage Keys
// ---------------------------------------------------------------------------

/** sessionStorage key for persisting the last-used summary configuration. */
export const SUMMARY_CONFIG_STORAGE_KEY = 'omx-viewer:summary-config'

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** All supported aggregation functions (maps to DuckDB SQL function names). */
export const AGGREGATION_FUNCTIONS = [
  'sum',
  'min',
  'max',
  'mean',
  'median',
  'stddev',
  'count_nonzero'
] as const
export type AggregationFunction = (typeof AGGREGATION_FUNCTIONS)[number]

/** Human-readable labels for each aggregation function. */
export const AGGREGATION_FUNCTION_LABELS: Record<AggregationFunction, string> = {
  sum:           'SUM',
  min:           'MIN',
  max:           'MAX',
  mean:          'MEAN',
  median:        'MEDIAN',
  stddev:        'STD DEV',
  count_nonzero: 'COUNT NON-ZERO'
}

/** All supported aggregation dimensions. */
export const AGGREGATION_DIMENSIONS = ['by_row', 'by_col'] as const
export type AggregationDimension = (typeof AGGREGATION_DIMENSIONS)[number]

/** Human-readable labels for each aggregation dimension. */
export const AGGREGATION_DIMENSION_LABELS: Record<AggregationDimension, string> = {
  by_row: 'By Row',
  by_col: 'By Column'
}

/** All supported aggregation scopes. */
export const AGGREGATION_SCOPES = ['active', 'all_matrices'] as const
export type AggregationScope = (typeof AGGREGATION_SCOPES)[number]

/** Human-readable labels for each aggregation scope. */
export const AGGREGATION_SCOPE_LABELS: Record<AggregationScope, string> = {
  active:      'Active Matrix Only',
  all_matrices: 'All Matrices'
}

// ---------------------------------------------------------------------------
// Matrix Arithmetic
// ---------------------------------------------------------------------------

/** Supported element-wise arithmetic operators. */
export const ARITHMETIC_OPS = ['add', 'subtract', 'multiply', 'divide'] as const
export type ArithmeticOp = (typeof ARITHMETIC_OPS)[number]

/** Human-readable symbols for each arithmetic operator. */
export const ARITHMETIC_OP_SYMBOLS: Record<ArithmeticOp, string> = {
  add:      '+',
  subtract: '−',
  multiply: '×',
  divide:   '÷'
}

/** Human-readable labels for each arithmetic operator. */
export const ARITHMETIC_OP_LABELS: Record<ArithmeticOp, string> = {
  add:      'Add',
  subtract: 'Subtract',
  multiply: 'Multiply',
  divide:   'Divide'
}

// ---------------------------------------------------------------------------
// Worker Message Types
// ---------------------------------------------------------------------------

/** Message type identifiers for DuckDB worker communication. */
export const DUCKDB_MSG = {
  INIT:             'duckdb:init',
  INIT_OK:          'duckdb:init:ok',
  INIT_ERROR:       'duckdb:init:error',
  REGISTER_BATCH:   'duckdb:register_batch',
  REGISTER_OK:      'duckdb:register:ok',
  REGISTER_ERROR:   'duckdb:register:error',
  DROP_TABLE:       'duckdb:drop_table',
  QUERY:            'duckdb:query',
  QUERY_RESULT:     'duckdb:query:result',
  QUERY_ERROR:      'duckdb:query:error',
} as const

/** Message type identifiers for math worker communication. */
export const MATH_MSG = {
  COMPUTE:  'math:compute',
  RESULT:   'math:result',
  ERROR:    'math:error',
} as const
