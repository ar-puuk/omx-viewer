/**
 * matrixStore.svelte.ts — Global application state using Svelte 5 runes.
 *
 * All state is declared with $state(). Derived values use $derived().
 * No legacy writable() stores anywhere in this file.
 *
 * This is the single source of truth for the entire application.
 * Import individual state slices or the action functions as needed.
 */

import {
  DEFAULT_DECIMAL_PLACES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  SUMMARY_CONFIG_STORAGE_KEY,
  type DecimalOption,
  type Theme,
  type AggregationFunction,
  type AggregationDimension,
  type AggregationScope,
} from '../utils/constants.js'

// ---------------------------------------------------------------------------
// Type Definitions (as specified in CLAUDE.md §4.6)
// ---------------------------------------------------------------------------

export interface MatrixFile {
  /** Original filename from the File object. */
  filename: string
  /** Matrix dimensions: [nrows, ncols]. All matrices share the same shape. */
  shape: [number, number]
  /** OMX version string read from the root 'omx_version' attribute. */
  omxVersion: string
  /** Names of all datasets under /matrices/. */
  matrixNames: string[]
  /** Lookup tables: name → array of zone label strings. */
  lookups: Record<string, string[]>
}

export interface MatrixTab {
  /** Unique identifier — matrix name for file matrices, "A op B" for ephemeral. */
  id: string
  /** Display label shown in the tab bar. */
  label: string
  /** True if this tab is the result of arithmetic — not stored in the file. */
  isEphemeral: boolean
  /** Data type of the underlying dataset. */
  dtype: 'float32' | 'float64' | 'int32'
  /**
   * LRU chunk cache: maps chunk start row → flat Float64Array of that chunk.
   * A "chunk" covers [startRow, startRow + chunkSize) × [0, ncols).
   * Eviction happens in addChunkToCache() when size > MAX_CACHED_CHUNKS.
   */
  cachedRows: Map<number, Float64Array>
  /**
   * Access-order tracking for LRU eviction.
   * Newest access is at the end of the array.
   */
  cacheAccessOrder: number[]
  /**
   * For ephemeral (arithmetic result) tabs, the full flat data array.
   * null for file-backed matrices (data is always sliced on demand).
   */
  ephemeralData: Float64Array | null
}

export interface SummaryConfig {
  dimension: AggregationDimension
  fn: AggregationFunction
  scope: AggregationScope
}

export interface SummaryResult {
  /** The configuration that produced this result — shown in the panel header. */
  config: SummaryConfig
  /** Column names: 'index' (+ optional 'label') + one value column per matrix. */
  columnNames: string[]
  /** rows[i] is one row of the output table — values align with columnNames. */
  rows: Array<Array<number | string>>
  /** True while DuckDB is computing the result. */
  isLoading: boolean
  /** Non-null if the aggregation failed. */
  error: string | null
}

export interface PinnedCell {
  /** 0-based row index. */
  row: number
  /** 0-based column index. */
  col: number
  /** matrixName → scalar value at [row, col]. Populated after cross-matrix reads. */
  valuesPerMatrix: Record<string, number>
  /** True while the cross-matrix slice reads are in flight. */
  isLoading: boolean
}

export interface AppError {
  id: string
  message: string
  type: 'error' | 'warning'
  dismissible: boolean
}

// ---------------------------------------------------------------------------
// Reactive State (Svelte 5 $state runes)
// ---------------------------------------------------------------------------

/** Parsed OMX file metadata. null until a file has been successfully opened. */
export let file = $state<MatrixFile | null>(null)

/** All matrix tabs — file-backed + ephemeral arithmetic results. */
export let tabs = $state<MatrixTab[]>([])

/** ID of the currently visible tab. null if no file is loaded. */
export let activeTabId = $state<string | null>(null)

/** True while the app is performing a heavy async operation (file open, DuckDB init). */
export let isLoading = $state(false)

/** Human-readable message shown in the LoadingOverlay while isLoading is true. */
export let loadingMessage = $state('')

/** Number of decimal places used for all cell value formatting. */
export let decimalPlaces = $state<DecimalOption>(DEFAULT_DECIMAL_PLACES)

/** Whether compact notation (1.2M) is active. */
export let compactNotation = $state(false)

/** Current summary panel configuration — persisted to sessionStorage. */
export let summaryConfig = $state<SummaryConfig>(loadSummaryConfig())

/** Result of the most recent aggregation query. null = not yet generated. */
export let summaryResult = $state<SummaryResult | null>(null)

/** Whether the summary panel drawer is open. */
export let summaryPanelOpen = $state(false)

/** Whether the metadata sidebar is open. */
export let sidebarOpen = $state(true)

/** Current UI theme. */
export let theme = $state<Theme>(loadTheme())

/** The currently pinned cell (from click or Cell Navigator). null = no pin. */
export let pinnedCell = $state<PinnedCell | null>(null)

/** Raw string value of the Cell Navigator row input field. */
export let navigatorRow = $state('')

/** Raw string value of the Cell Navigator col input field. */
export let navigatorCol = $state('')

/** Whether DuckDB worker initialised successfully. */
export let duckdbReady = $state(false)

/** Non-fatal warnings and errors displayed in ErrorBanner components. */
export let errors = $state<AppError[]>([])

// ---------------------------------------------------------------------------
// Derived Values ($derived)
// ---------------------------------------------------------------------------

/** The MatrixTab object for the currently active tab. */
export const activeTab = $derived(
  tabs.find((t) => t.id === activeTabId) ?? null
)

/** The first lookup table found in the file, used for row/col labels. */
export const primaryLookup = $derived(
  file
    ? (Object.values(file.lookups)[0] ?? null)
    : null
)

/** Number of rows in the active matrix. */
export const nrows = $derived(file?.shape[0] ?? 0)

/** Number of columns in the active matrix. */
export const ncols = $derived(file?.shape[1] ?? 0)

/** True if any file is currently loaded. */
export const hasFile = $derived(file !== null)

/** True if there is at least one non-ephemeral matrix tab. */
export const hasMatrices = $derived(tabs.some((t) => !t.isEphemeral))

/** Tab IDs of all non-ephemeral (file-backed) matrices. */
export const fileMatrixIds = $derived(
  tabs.filter((t) => !t.isEphemeral).map((t) => t.id)
)

// ---------------------------------------------------------------------------
// Actions — State Mutations
// ---------------------------------------------------------------------------

/**
 * Called when a valid OMX file has been parsed.
 * Replaces any existing state and creates one tab per matrix.
 *
 * @param parsedFile - The parsed MatrixFile metadata.
 */
export function openFile(parsedFile: MatrixFile): void {
  file = parsedFile
  tabs = parsedFile.matrixNames.map((name) => createTab(name, false, 'float32'))
  activeTabId = tabs[0]?.id ?? null
  summaryResult = null
  pinnedCell = null
  navigatorRow = ''
  navigatorCol = ''
  errors = []
}

/**
 * Creates a new MatrixTab object. Does not add it to the tabs array.
 *
 * @param id          - Unique tab identifier (matrix name or arithmetic label).
 * @param isEphemeral - True for arithmetic result tabs.
 * @param dtype       - Data type of the underlying dataset.
 * @param label       - Optional display label (defaults to id).
 */
export function createTab(
  id: string,
  isEphemeral: boolean,
  dtype: MatrixTab['dtype'],
  label?: string
): MatrixTab {
  return {
    id,
    label: label ?? id,
    isEphemeral,
    dtype,
    cachedRows: new Map(),
    cacheAccessOrder: [],
    ephemeralData: null,
  }
}

/**
 * Switches the active tab to the given ID.
 * No-op if the ID does not exist in tabs.
 *
 * @param tabId - ID of the tab to activate.
 */
export function setActiveTab(tabId: string): void {
  if (tabs.some((t) => t.id === tabId)) {
    activeTabId = tabId
  }
}

/**
 * Closes a tab and removes it from the tabs array.
 * If the closed tab was active, activates the nearest remaining tab.
 *
 * @param tabId - ID of the tab to close.
 */
export function closeTab(tabId: string): void {
  const idx = tabs.findIndex((t) => t.id === tabId)
  if (idx === -1) return

  tabs = tabs.filter((t) => t.id !== tabId)

  if (activeTabId === tabId) {
    // Activate the tab to the left, or the first remaining tab
    activeTabId = tabs[Math.max(0, idx - 1)]?.id ?? null
  }
}

/**
 * Adds an ephemeral (arithmetic result) tab.
 * If a tab with the same ID already exists, replaces it.
 *
 * @param id   - Label like "TAZ_AUTO − TAZ_TRANSIT".
 * @param data - Flat Float64Array of the result matrix (nrows × ncols).
 */
export function addEphemeralTab(id: string, data: Float64Array): void {
  const tab = createTab(id, true, 'float64', id)
  tab.ephemeralData = data

  const existing = tabs.findIndex((t) => t.id === id)
  if (existing !== -1) {
    tabs[existing] = tab
  } else {
    tabs = [...tabs, tab]
  }
  activeTabId = id
}

/**
 * Updates the dtype of a tab after the HDF5 dataset has been inspected.
 * Called by h5wasmService after parsing the dataset's type attribute.
 *
 * @param tabId - Tab to update.
 * @param dtype - Detected data type.
 */
export function setTabDtype(tabId: string, dtype: MatrixTab['dtype']): void {
  const idx = tabs.findIndex((t) => t.id === tabId)
  if (idx !== -1) {
    tabs[idx] = { ...tabs[idx], dtype }
  }
}

// ---------------------------------------------------------------------------
// Chunk Cache — LRU Management
// ---------------------------------------------------------------------------

/**
 * Adds a fetched row chunk to a tab's LRU cache.
 * Evicts the least-recently-used chunk if the cache exceeds MAX_CACHED_CHUNKS.
 *
 * @param tabId      - Target tab ID.
 * @param chunkStart - The first row index of this chunk.
 * @param data       - Flat Float64Array for [chunkStart, chunkStart+size) rows.
 * @param maxChunks  - LRU eviction threshold (default: MAX_CACHED_CHUNKS).
 */
export function addChunkToCache(
  tabId: string,
  chunkStart: number,
  data: Float64Array,
  maxChunks: number
): void {
  const tab = tabs.find((t) => t.id === tabId)
  if (!tab) return

  // Record access
  tab.cacheAccessOrder = tab.cacheAccessOrder.filter((k) => k !== chunkStart)
  tab.cacheAccessOrder.push(chunkStart)
  tab.cachedRows.set(chunkStart, data)

  // Evict LRU chunks while over limit
  while (tab.cacheAccessOrder.length > maxChunks) {
    const lru = tab.cacheAccessOrder.shift()!
    tab.cachedRows.delete(lru)
  }
}

/**
 * Records a cache hit for LRU tracking (moves key to most-recently-used).
 *
 * @param tabId      - Target tab ID.
 * @param chunkStart - The chunk key that was accessed.
 */
export function touchCacheEntry(tabId: string, chunkStart: number): void {
  const tab = tabs.find((t) => t.id === tabId)
  if (!tab) return
  tab.cacheAccessOrder = tab.cacheAccessOrder.filter((k) => k !== chunkStart)
  tab.cacheAccessOrder.push(chunkStart)
}

// ---------------------------------------------------------------------------
// Cell Pinning
// ---------------------------------------------------------------------------

/**
 * Pins a cell at [row, col]. The cross-matrix read loop in h5wasmService
 * will subsequently populate pinnedCell.valuesPerMatrix.
 *
 * @param row - 0-based row index.
 * @param col - 0-based column index.
 */
export function pinCell(row: number, col: number): void {
  pinnedCell = {
    row,
    col,
    valuesPerMatrix: {},
    isLoading: true,
  }
  // Sync the navigator inputs to reflect the new pinned position
  navigatorRow = String(row)
  navigatorCol = String(col)
}

/**
 * Sets the cross-matrix values for the currently pinned cell.
 * Called by h5wasmService after completing all single-element slices.
 *
 * @param values - Record of matrixName → scalar value.
 */
export function setPinnedCellValues(values: Record<string, number>): void {
  if (pinnedCell) {
    pinnedCell = { ...pinnedCell, valuesPerMatrix: values, isLoading: false }
  }
}

/**
 * Clears the pinned cell state.
 */
export function clearPinnedCell(): void {
  pinnedCell = null
  navigatorRow = ''
  navigatorCol = ''
}

// ---------------------------------------------------------------------------
// Summary Panel
// ---------------------------------------------------------------------------

/**
 * Updates the summary configuration and persists it to sessionStorage.
 *
 * @param config - New summary configuration.
 */
export function setSummaryConfig(config: SummaryConfig): void {
  summaryConfig = config
  try {
    sessionStorage.setItem(SUMMARY_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // sessionStorage may be unavailable in some iframe contexts — ignore
  }
}

/**
 * Marks the summary result as loading.
 * Called before dispatching the aggregation request to the DuckDB worker.
 */
export function startSummaryLoad(): void {
  summaryResult = {
    config: { ...summaryConfig },
    columnNames: [],
    rows: [],
    isLoading: true,
    error: null,
  }
}

/**
 * Stores a completed summary result.
 *
 * @param columnNames - Column names from the Arrow result.
 * @param rows        - Data rows from the Arrow result.
 */
export function setSummaryResult(
  columnNames: string[],
  rows: Array<Array<number | string>>
): void {
  if (summaryResult) {
    summaryResult = { ...summaryResult, columnNames, rows, isLoading: false }
  }
}

/**
 * Records a summary generation error.
 *
 * @param message - Error message to display.
 */
export function setSummaryError(message: string): void {
  if (summaryResult) {
    summaryResult = { ...summaryResult, isLoading: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Loading State
// ---------------------------------------------------------------------------

/**
 * Sets the global loading overlay state.
 *
 * @param loading - Whether the app is loading.
 * @param message - Optional message to display.
 */
export function setLoading(loading: boolean, message = ''): void {
  isLoading = loading
  loadingMessage = message
}

// ---------------------------------------------------------------------------
// Error / Warning Banners
// ---------------------------------------------------------------------------

let _errorIdCounter = 0

/**
 * Adds an error or warning banner to the UI.
 *
 * @param message     - Human-readable error message.
 * @param type        - 'error' | 'warning'
 * @param dismissible - Whether the user can dismiss the banner.
 * @returns           - The generated error ID (for programmatic dismissal).
 */
export function addError(
  message: string,
  type: AppError['type'] = 'error',
  dismissible = true
): string {
  const id = `err-${++_errorIdCounter}`
  errors = [...errors, { id, message, type, dismissible }]
  return id
}

/**
 * Dismisses (removes) a banner by ID.
 *
 * @param id - Error ID returned by addError().
 */
export function dismissError(id: string): void {
  errors = errors.filter((e) => e.id !== id)
}

/**
 * Clears all error banners.
 */
export function clearErrors(): void {
  errors = []
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * Toggles between dark and light themes, persisting to sessionStorage.
 */
export function toggleTheme(): void {
  theme = theme === 'dark' ? 'light' : 'dark'
  applyThemeToDom(theme)
  try {
    sessionStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

/**
 * Applies the theme to the <html> data-theme attribute.
 *
 * @param t - Theme to apply.
 */
export function applyThemeToDom(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t)
}

// ---------------------------------------------------------------------------
// Decimal / Formatting
// ---------------------------------------------------------------------------

/**
 * Sets the number of decimal places for cell value display.
 *
 * @param places - One of the allowed DecimalOption values.
 */
export function setDecimalPlaces(places: DecimalOption): void {
  decimalPlaces = places
}

/**
 * Toggles compact number notation.
 */
export function toggleCompactNotation(): void {
  compactNotation = !compactNotation
}

// ---------------------------------------------------------------------------
// Sidebar / Panel Visibility
// ---------------------------------------------------------------------------

/** Toggles the metadata sidebar open/closed. */
export function toggleSidebar(): void {
  sidebarOpen = !sidebarOpen
}

/** Toggles the summary panel drawer open/closed. */
export function toggleSummaryPanel(): void {
  summaryPanelOpen = !summaryPanelOpen
}

// ---------------------------------------------------------------------------
// Full Reset — called when the user loads a new file
// ---------------------------------------------------------------------------

/**
 * Resets all state to initial values, ready for a new file to be opened.
 */
export function resetState(): void {
  file = null
  tabs = []
  activeTabId = null
  isLoading = false
  loadingMessage = ''
  summaryResult = null
  summaryPanelOpen = false
  pinnedCell = null
  navigatorRow = ''
  navigatorCol = ''
  errors = []
}

// ---------------------------------------------------------------------------
// Session Storage Loaders (called at module init time)
// ---------------------------------------------------------------------------

/** Loads the theme from sessionStorage, falling back to the default. */
function loadTheme(): Theme {
  try {
    const stored = sessionStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // ignore
  }
  return DEFAULT_THEME
}

/** Loads the last-used summary config from sessionStorage, with safe fallback. */
function loadSummaryConfig(): SummaryConfig {
  try {
    const stored = sessionStorage.getItem(SUMMARY_CONFIG_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SummaryConfig>
      if (parsed.dimension && parsed.fn && parsed.scope) {
        return parsed as SummaryConfig
      }
    }
  } catch {
    // ignore malformed storage
  }
  return {
    dimension: 'by_row',
    fn: 'sum',
    scope: 'all_matrices',
  }
}
