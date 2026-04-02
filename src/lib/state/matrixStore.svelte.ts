/**
 * matrixStore.svelte.ts — Global application state using Svelte 5 runes.
 *
 * State is encapsulated in a $state class instance — the correct pattern
 * for module-level reactive state in Svelte 5. This avoids the
 * "Cannot export state that is reassigned" compiler error.
 *
 * Import: import { store } from '$lib/state/matrixStore.svelte.js'
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
// Type Definitions
// ---------------------------------------------------------------------------

export interface MatrixFile {
  filename: string
  shape: [number, number]
  omxVersion: string
  matrixNames: string[]
  lookups: Record<string, string[]>
}

export interface MatrixTab {
  id: string
  label: string
  isEphemeral: boolean
  dtype: 'float32' | 'float64' | 'int32'
  cachedRows: Map<number, Float64Array>
  cacheAccessOrder: number[]
  ephemeralData: Float64Array | null
}

export interface SummaryConfig {
  dimension: AggregationDimension
  fn: AggregationFunction
  scope: AggregationScope
}

export interface SummaryResult {
  config: SummaryConfig
  columnNames: string[]
  rows: Array<Array<number | string>>
  isLoading: boolean
  error: string | null
}

export interface PinnedCell {
  row: number
  col: number
  valuesPerMatrix: Record<string, number>
  isLoading: boolean
}

export interface AppError {
  id: string
  message: string
  type: 'error' | 'warning'
  dismissible: boolean
}

// ---------------------------------------------------------------------------
// Session Storage Helpers (called at class init time)
// ---------------------------------------------------------------------------

function loadTheme(): Theme {
  try {
    const s = sessionStorage.getItem(THEME_STORAGE_KEY)
    if (s === 'dark' || s === 'light') return s
  } catch { /* ignore */ }
  return DEFAULT_THEME
}

function loadSummaryConfig(): SummaryConfig {
  try {
    const s = sessionStorage.getItem(SUMMARY_CONFIG_STORAGE_KEY)
    if (s) {
      const p = JSON.parse(s) as Partial<SummaryConfig>
      if (p.dimension && p.fn && p.scope) return p as SummaryConfig
    }
  } catch { /* ignore */ }
  return { dimension: 'by_row', fn: 'sum', scope: 'all_matrices' }
}

// ---------------------------------------------------------------------------
// Reactive State Class
// ---------------------------------------------------------------------------

class AppState {
  file = $state<MatrixFile | null>(null)
  tabs = $state<MatrixTab[]>([])
  activeTabId = $state<string | null>(null)
  isLoading = $state(false)
  loadingMessage = $state('')
  decimalPlaces = $state<DecimalOption>(DEFAULT_DECIMAL_PLACES)
  compactNotation = $state(false)
  summaryConfig = $state<SummaryConfig>(loadSummaryConfig())
  summaryResult = $state<SummaryResult | null>(null)
  summaryPanelOpen = $state(false)
  sidebarOpen = $state(true)
  theme = $state<Theme>(loadTheme())
  pinnedCell = $state<PinnedCell | null>(null)
  navigatorRow = $state('')
  navigatorCol = $state('')
  duckdbReady = $state(false)
  errors = $state<AppError[]>([])

  // Derived
  get activeTab() { return this.tabs.find((t) => t.id === this.activeTabId) ?? null }
  get primaryLookup() { return this.file ? (Object.values(this.file.lookups)[0] ?? null) : null }
  get nrows() { return this.file?.shape[0] ?? 0 }
  get ncols() { return this.file?.shape[1] ?? 0 }
  get hasFile() { return this.file !== null }
  get hasMatrices() { return this.tabs.some((t) => !t.isEphemeral) }
  get fileMatrixIds() { return this.tabs.filter((t) => !t.isEphemeral).map((t) => t.id) }

  // File lifecycle
  openFile(parsedFile: MatrixFile) {
    this.file = parsedFile
    this.tabs = parsedFile.matrixNames.map((name) => this.createTab(name, false, 'float32'))
    this.activeTabId = this.tabs[0]?.id ?? null
    this.summaryResult = null
    this.pinnedCell = null
    this.navigatorRow = ''
    this.navigatorCol = ''
    this.errors = []
  }

  createTab(id: string, isEphemeral: boolean, dtype: MatrixTab['dtype'], label?: string): MatrixTab {
    return { id, label: label ?? id, isEphemeral, dtype, cachedRows: new Map(), cacheAccessOrder: [], ephemeralData: null }
  }

  setActiveTab(tabId: string) {
    if (this.tabs.some((t) => t.id === tabId)) this.activeTabId = tabId
  }

  closeTab(tabId: string) {
    const idx = this.tabs.findIndex((t) => t.id === tabId)
    if (idx === -1) return
    this.tabs = this.tabs.filter((t) => t.id !== tabId)
    if (this.activeTabId === tabId) this.activeTabId = this.tabs[Math.max(0, idx - 1)]?.id ?? null
  }

  addEphemeralTab(id: string, data: Float64Array) {
    const tab = this.createTab(id, true, 'float64', id)
    tab.ephemeralData = data
    const existing = this.tabs.findIndex((t) => t.id === id)
    if (existing !== -1) this.tabs[existing] = tab
    else this.tabs = [...this.tabs, tab]
    this.activeTabId = id
  }

  setTabDtype(tabId: string, dtype: MatrixTab['dtype']) {
    const idx = this.tabs.findIndex((t) => t.id === tabId)
    if (idx !== -1) this.tabs[idx] = { ...this.tabs[idx], dtype }
  }

  // LRU cache
  addChunkToCache(tabId: string, chunkStart: number, data: Float64Array, maxChunks: number) {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return
    tab.cacheAccessOrder = tab.cacheAccessOrder.filter((k) => k !== chunkStart)
    tab.cacheAccessOrder.push(chunkStart)
    tab.cachedRows.set(chunkStart, data)
    while (tab.cacheAccessOrder.length > maxChunks) tab.cachedRows.delete(tab.cacheAccessOrder.shift()!)
  }

  touchCacheEntry(tabId: string, chunkStart: number) {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return
    tab.cacheAccessOrder = tab.cacheAccessOrder.filter((k) => k !== chunkStart)
    tab.cacheAccessOrder.push(chunkStart)
  }

  // Cell pinning
  pinCell(row: number, col: number) {
    this.pinnedCell = { row, col, valuesPerMatrix: {}, isLoading: true }
    this.navigatorRow = String(row)
    this.navigatorCol = String(col)
  }

  setPinnedCellValues(values: Record<string, number>) {
    if (this.pinnedCell) this.pinnedCell = { ...this.pinnedCell, valuesPerMatrix: values, isLoading: false }
  }

  clearPinnedCell() { this.pinnedCell = null; this.navigatorRow = ''; this.navigatorCol = '' }

  // Summary
  setSummaryConfig(config: SummaryConfig) {
    this.summaryConfig = config
    try { sessionStorage.setItem(SUMMARY_CONFIG_STORAGE_KEY, JSON.stringify(config)) } catch { /* ignore */ }
  }

  startSummaryLoad() {
    this.summaryResult = { config: { ...this.summaryConfig }, columnNames: [], rows: [], isLoading: true, error: null }
  }

  setSummaryResult(columnNames: string[], rows: Array<Array<number | string>>) {
    if (this.summaryResult) this.summaryResult = { ...this.summaryResult, columnNames, rows, isLoading: false }
  }

  setSummaryError(message: string) {
    if (this.summaryResult) this.summaryResult = { ...this.summaryResult, isLoading: false, error: message }
  }

  // Loading
  setLoading(loading: boolean, message = '') { this.isLoading = loading; this.loadingMessage = message }

  // Errors
  private _errorId = 0
  addError(message: string, type: AppError['type'] = 'error', dismissible = true): string {
    const id = `err-${++this._errorId}`
    this.errors = [...this.errors, { id, message, type, dismissible }]
    return id
  }
  dismissError(id: string) { this.errors = this.errors.filter((e) => e.id !== id) }
  clearErrors() { this.errors = [] }

  // Theme
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark'
    this.applyThemeToDom(this.theme)
    try { sessionStorage.setItem(THEME_STORAGE_KEY, this.theme) } catch { /* ignore */ }
  }
  applyThemeToDom(t: Theme) { document.documentElement.setAttribute('data-theme', t) }

  // Formatting
  setDecimalPlaces(places: DecimalOption) { this.decimalPlaces = places }
  toggleCompactNotation() { this.compactNotation = !this.compactNotation }

  // Panels
  toggleSidebar() { this.sidebarOpen = !this.sidebarOpen }
  toggleSummaryPanel() { this.summaryPanelOpen = !this.summaryPanelOpen }

  // Reset
  resetState() {
    this.file = null; this.tabs = []; this.activeTabId = null
    this.isLoading = false; this.loadingMessage = ''
    this.summaryResult = null; this.summaryPanelOpen = false
    this.pinnedCell = null; this.navigatorRow = ''; this.navigatorCol = ''
    this.errors = []
  }
}

export const store = new AppState()
