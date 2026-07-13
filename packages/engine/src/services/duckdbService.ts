/**
 * duckdbService.ts — Aggregation service + math worker.
 *
 * Aggregations (runAggregation, computeMatrixStats) are computed by streaming
 * row chunks directly from h5wasm — no DuckDB or Arrow IPC needed. This avoids
 * the O(full-matrix) memory overhead that caused OOM with wide matrices
 * (3,629 cols × 23 matrices ≈ 2.4 GB exceeded DuckDB-Wasm's 512 MB limit).
 *
 * DuckDB is not used anywhere in this file (or this codebase) — the earlier
 * duckdb.worker.ts was deleted since it was dead code (registered but never
 * invoked by any aggregation or stats path). Element-wise arithmetic uses
 * math.worker.ts (Transferable Float64Arrays).
 */

import { sliceRawChunk, getChunkSize, computeBasicStats } from './h5wasmService.js'
import { logger } from '../utils/logger.js'
import { store } from '../state/matrixStore.svelte.js'
import MathWorkerConstructor from '../workers/math.worker.ts?worker&inline'

let _msgIdCounter = 0
function nextId(): string {
  return `msg-${++_msgIdCounter}`
}

// ---------------------------------------------------------------------------
// Streaming Aggregation
// ---------------------------------------------------------------------------
//
// DuckDB-Wasm has a hard 512 MB memory limit. A 3,629×3,629 matrix stored as
// a wide table (3,629 Float64 columns) consumes ~105 MB in DuckDB. Loading 23
// matrices for "All Matrices" scope requires ~2.4 GB → instant OOM.
//
// The fix: stream row chunks from h5wasm (200 rows × ncols × 4 bytes ≈ 2.9 MB
// per chunk) and compute aggregations in plain JS. Peak memory is bounded to
// one chunk regardless of how many matrices or rows exist.
// ---------------------------------------------------------------------------

type AggFn = 'sum' | 'min' | 'max' | 'mean' | 'median' | 'stddev' | 'count_nonzero'

/**
 * Aggregation configuration for the summary query.
 */
export interface AggregationConfig {
  dimension: 'by_row' | 'by_col'
  fn: AggFn
  scope: 'active' | 'all_matrices'
  activeMatrix: string
  allMatrixNames: string[]
  nrows: number
  ncols: number
}

// ---------------------------------------------------------------------------
// Per-row aggregation: one output value per row
// ---------------------------------------------------------------------------

/**
 * Computes the aggregate of a single row's values (ncols elements starting at
 * offset in a flat TypedArray).
 */
function computeRowAgg(
  data: ArrayLike<number>,
  offset: number,
  ncols: number,
  fn: AggFn
): number {
  switch (fn) {
    case 'sum': {
      let s = 0
      for (let i = 0; i < ncols; i++) s += data[offset + i]
      return s
    }
    case 'min': {
      let m = Infinity
      for (let i = 0; i < ncols; i++) { const v = data[offset + i]; if (v < m) m = v }
      return m === Infinity ? NaN : m
    }
    case 'max': {
      let m = -Infinity
      for (let i = 0; i < ncols; i++) { const v = data[offset + i]; if (v > m) m = v }
      return m === -Infinity ? NaN : m
    }
    case 'mean': {
      let s = 0
      for (let i = 0; i < ncols; i++) s += data[offset + i]
      return s / ncols
    }
    case 'median': {
      const vals = new Float64Array(ncols)
      for (let i = 0; i < ncols; i++) vals[i] = data[offset + i]
      vals.sort()
      return ncols % 2 === 1
        ? vals[(ncols - 1) / 2]
        : (vals[ncols / 2 - 1] + vals[ncols / 2]) / 2
    }
    case 'stddev': {
      let s = 0, s2 = 0
      for (let i = 0; i < ncols; i++) { const v = data[offset + i]; s += v; s2 += v * v }
      const mean = s / ncols
      return Math.sqrt(Math.max(0, s2 / ncols - mean * mean))
    }
    case 'count_nonzero': {
      let c = 0
      for (let i = 0; i < ncols; i++) { if (data[offset + i] !== 0) c++ }
      return c
    }
  }
}

/**
 * Streams all rows of a matrix from h5wasm in chunks and computes a per-row
 * aggregate. Memory: O(chunkSize × ncols) — one chunk at a time.
 */
function streamingRowAgg(
  matrixName: string,
  nrows: number,
  ncols: number,
  fn: AggFn
): Float64Array {
  const result = new Float64Array(nrows)
  const chunkSize = getChunkSize(matrixName)

  for (let row = 0; row < nrows; row += chunkSize) {
    const end = Math.min(row + chunkSize, nrows)
    const raw = sliceRawChunk(matrixName, row, end, ncols)
    const chunkRows = end - row

    for (let r = 0; r < chunkRows; r++) {
      result[row + r] = computeRowAgg(raw, r * ncols, ncols, fn)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Per-column aggregation: one output value per column
// ---------------------------------------------------------------------------

/**
 * Streams all rows of a matrix and computes a per-column aggregate using
 * running accumulators. Memory: O(ncols) for accumulators + O(chunk) for data.
 *
 * For MEDIAN (which requires all values), falls back to collecting full columns
 * one chunk at a time: O(nrows × ncols) temporary storage, but still processes
 * only one matrix at a time.
 */
function streamingColAgg(
  matrixName: string,
  nrows: number,
  ncols: number,
  fn: AggFn
): Float64Array {
  const chunkSize = getChunkSize(matrixName)

  if (fn === 'median') {
    return streamingColMedian(matrixName, nrows, ncols, chunkSize)
  }

  // Running accumulators for all other functions
  const result = new Float64Array(ncols)
  const sumSq = fn === 'stddev' ? new Float64Array(ncols) : null

  // Initialise min/max sentinels
  if (fn === 'min') result.fill(Infinity)
  else if (fn === 'max') result.fill(-Infinity)

  for (let row = 0; row < nrows; row += chunkSize) {
    const end = Math.min(row + chunkSize, nrows)
    const raw = sliceRawChunk(matrixName, row, end, ncols)
    const chunkRows = end - row

    for (let r = 0; r < chunkRows; r++) {
      const off = r * ncols
      for (let c = 0; c < ncols; c++) {
        const v = raw[off + c]
        switch (fn) {
          case 'sum':
          case 'mean':
            result[c] += v
            break
          case 'min':
            if (v < result[c]) result[c] = v
            break
          case 'max':
            if (v > result[c]) result[c] = v
            break
          case 'stddev':
            result[c] += v
            sumSq![c] += v * v
            break
          case 'count_nonzero':
            if (v !== 0) result[c]++
            break
        }
      }
    }
  }

  // Finalise
  if (fn === 'mean') {
    for (let c = 0; c < ncols; c++) result[c] /= nrows
  } else if (fn === 'stddev') {
    for (let c = 0; c < ncols; c++) {
      const mean = result[c] / nrows
      result[c] = Math.sqrt(Math.max(0, sumSq![c] / nrows - mean * mean))
    }
  } else if (fn === 'min') {
    for (let c = 0; c < ncols; c++) { if (result[c] === Infinity) result[c] = NaN }
  } else if (fn === 'max') {
    for (let c = 0; c < ncols; c++) { if (result[c] === -Infinity) result[c] = NaN }
  }

  return result
}

/**
 * Collects all column values into a contiguous buffer, then sorts each column
 * to find the median. Memory: O(nrows × ncols) for one matrix at a time.
 */
function streamingColMedian(
  matrixName: string,
  nrows: number,
  ncols: number,
  chunkSize: number
): Float64Array {
  // allVals layout: column 0 occupies indices [0, nrows), column 1 [nrows, 2*nrows), etc.
  const allVals = new Float64Array(ncols * nrows)

  for (let row = 0; row < nrows; row += chunkSize) {
    const end = Math.min(row + chunkSize, nrows)
    const raw = sliceRawChunk(matrixName, row, end, ncols)
    const chunkRows = end - row

    for (let r = 0; r < chunkRows; r++) {
      const absRow = row + r
      const off = r * ncols
      for (let c = 0; c < ncols; c++) {
        allVals[c * nrows + absRow] = raw[off + c]
      }
    }
  }

  const result = new Float64Array(ncols)
  for (let c = 0; c < ncols; c++) {
    const colSlice = allVals.subarray(c * nrows, (c + 1) * nrows)
    colSlice.sort()
    result[c] = nrows % 2 === 1
      ? colSlice[(nrows - 1) / 2]
      : (colSlice[nrows / 2 - 1] + colSlice[nrows / 2]) / 2
  }

  return result
}

// ---------------------------------------------------------------------------
// In-memory aggregation — for ephemeral (arithmetic-result) tabs
// ---------------------------------------------------------------------------
//
// Ephemeral tabs (matrix arithmetic results, e.g. "TAZ_AUTO - TAZ_TRANSIT")
// have no backing HDF5 dataset — sliceRawChunk() would try to read them from
// the open file and fail. Their data lives entirely in tab.ephemeralData,
// already materialized as a full Float64Array by math.worker.ts, so
// aggregating them needs no chunk-fetch loop — the whole matrix is already
// resident in memory.
// ---------------------------------------------------------------------------

function inMemoryRowAgg(data: Float64Array, nrows: number, ncols: number, fn: AggFn): Float64Array {
  const result = new Float64Array(nrows)
  for (let r = 0; r < nrows; r++) {
    result[r] = computeRowAgg(data, r * ncols, ncols, fn)
  }
  return result
}

function inMemoryColAgg(data: Float64Array, nrows: number, ncols: number, fn: AggFn): Float64Array {
  if (fn === 'median') {
    const result = new Float64Array(ncols)
    for (let c = 0; c < ncols; c++) {
      const col = new Float64Array(nrows)
      for (let r = 0; r < nrows; r++) col[r] = data[r * ncols + c]
      col.sort()
      result[c] = nrows % 2 === 1
        ? col[(nrows - 1) / 2]
        : (col[nrows / 2 - 1] + col[nrows / 2]) / 2
    }
    return result
  }

  const result = new Float64Array(ncols)
  const sumSq = fn === 'stddev' ? new Float64Array(ncols) : null
  if (fn === 'min') result.fill(Infinity)
  else if (fn === 'max') result.fill(-Infinity)

  for (let r = 0; r < nrows; r++) {
    const off = r * ncols
    for (let c = 0; c < ncols; c++) {
      const v = data[off + c]
      switch (fn) {
        case 'sum':
        case 'mean':
          result[c] += v
          break
        case 'min':
          if (v < result[c]) result[c] = v
          break
        case 'max':
          if (v > result[c]) result[c] = v
          break
        case 'stddev':
          result[c] += v
          sumSq![c] += v * v
          break
        case 'count_nonzero':
          if (v !== 0) result[c]++
          break
      }
    }
  }

  if (fn === 'mean') {
    for (let c = 0; c < ncols; c++) result[c] /= nrows
  } else if (fn === 'stddev') {
    for (let c = 0; c < ncols; c++) {
      const mean = result[c] / nrows
      result[c] = Math.sqrt(Math.max(0, sumSq![c] / nrows - mean * mean))
    }
  } else if (fn === 'min') {
    for (let c = 0; c < ncols; c++) { if (result[c] === Infinity) result[c] = NaN }
  } else if (fn === 'max') {
    for (let c = 0; c < ncols; c++) { if (result[c] === -Infinity) result[c] = NaN }
  }

  return result
}

// ---------------------------------------------------------------------------
// Aggregation — SummaryPanel main entry point
// ---------------------------------------------------------------------------

/**
 * Runs a streaming aggregation by reading h5wasm row chunks directly.
 * Processes one matrix at a time — peak memory is one chunk (~2.9 MB for
 * 200 rows × 3,629 cols × 4 bytes) plus the result arrays. Ephemeral
 * (arithmetic-result) tabs are aggregated in-memory instead, since they
 * have no backing HDF5 dataset to stream from.
 *
 * Yields to the event loop between matrices to keep the UI responsive.
 *
 * @param config - Aggregation configuration from SummaryPanel.
 * @returns      - { columnNames, rows } matching the SummaryResult interface.
 */
export async function runAggregation(config: AggregationConfig): Promise<{
  columnNames: string[]
  rows: Array<Array<number | string>>
}> {
  const { dimension, fn, nrows, ncols } = config

  const matrixNames = config.scope === 'active'
    ? [config.activeMatrix]
    : config.allMatrixNames.filter((n) =>
        store.tabs.find((t) => t.id === n && !t.isEphemeral)
      )

  logger.time('runAggregation:streaming')

  const resultLength = dimension === 'by_row' ? nrows : ncols

  // Aggregate each matrix, yielding between matrices for UI responsiveness
  const perMatrix: Record<string, Float64Array> = {}
  for (const name of matrixNames) {
    const tab = store.tabs.find((t) => t.id === name)
    if (tab?.isEphemeral && tab.ephemeralData) {
      perMatrix[name] = dimension === 'by_row'
        ? inMemoryRowAgg(tab.ephemeralData, nrows, ncols, fn)
        : inMemoryColAgg(tab.ephemeralData, nrows, ncols, fn)
    } else {
      const aggFn = dimension === 'by_row' ? streamingRowAgg : streamingColAgg
      perMatrix[name] = aggFn(name, nrows, ncols, fn)
    }
    // Yield to event loop so the loading spinner stays animated
    await new Promise((r) => setTimeout(r, 0))
  }

  // Build result table
  const useValueLabel = matrixNames.length === 1
  const columnNames = ['idx', ...(useValueLabel ? ['value'] : matrixNames)]
  const rows: Array<Array<number | string>> = []
  for (let i = 0; i < resultLength; i++) {
    const row: Array<number | string> = [i]
    for (const name of matrixNames) {
      row.push(perMatrix[name][i])
    }
    rows.push(row)
  }

  logger.timeEnd('runAggregation:streaming')
  return { columnNames, rows }
}

// ---------------------------------------------------------------------------
// Metadata Stats — streaming h5wasm (no DuckDB)
// ---------------------------------------------------------------------------

/**
 * Computes MIN, MAX, and MEAN for a single matrix by streaming from h5wasm.
 * Delegates to h5wasmService.computeBasicStats() which already implements
 * chunked iteration. Returns a resolved promise for API compatibility with
 * the async signature expected by MetadataPanel.
 */
export async function computeMatrixStats(
  matrixName: string,
  nrows: number,
  ncols: number
): Promise<{ min: number; max: number; mean: number }> {
  return computeBasicStats(matrixName, nrows, ncols)
}

// ---------------------------------------------------------------------------
// Math Worker Service (element-wise arithmetic)
// ---------------------------------------------------------------------------
//
// Uses Vite's `?worker&inline` suffix — compiles math.worker.ts and embeds
// it as a base64 data: URL directly in the bundle, no separate chunk file
// and no runtime fetch. This was chosen after two other approaches failed
// in a VS Code webview specifically (documented for anyone tempted to
// "simplify" this back to a plain `new URL(..., import.meta.url)`):
//
//   1. Direct `new Worker(new URL(...), {type:'module'})` throws
//      synchronously: a webview's document origin (vscode-webview://<uuid>)
//      doesn't match the origin scripts are served from
//      (vscode-resource.vscode-cdn.net), and browsers require same-origin
//      for Worker construction.
//   2. Falling back to `fetch()` the same URL as text, then constructing
//      from a blob: URL, ALSO failed ("Failed to fetch") — likely the same
//      cross-origin restriction applies to programmatic fetch() even though
//      element-based loading (<script src>) is more permissive.
//
// `?worker&inline` sidesteps both: there is no separate network resource to
// load at all, so there's no cross-origin boundary to cross. Works
// identically in the browser (negligible cost — the worker is ~1KB) and in
// the webview. Do not split this back into a runtime URL + separate
// construction step "for clarity" without retesting in a webview.
// ---------------------------------------------------------------------------

let mathWorkerInstance: Worker | null = null

/**
 * Lazily spawns the math worker.
 */
function getMathWorker(): Worker {
  if (!mathWorkerInstance) {
    mathWorkerInstance = new MathWorkerConstructor()
  }
  return mathWorkerInstance
}

/**
 * Performs element-wise arithmetic on two full matrix Float64Arrays.
 * Sends both arrays to math.worker.ts as Transferable buffers (zero-copy).
 *
 * @param a   - First matrix, flat Float64Array [nrows × ncols].
 * @param b   - Second matrix, flat Float64Array [nrows × ncols].
 * @param op  - Arithmetic operator.
 * @returns   - Result Float64Array (transferred back from worker).
 */
export function computeArithmetic(
  a: Float64Array,
  b: Float64Array,
  op: 'add' | 'subtract' | 'multiply' | 'divide'
): Promise<Float64Array> {
  const mw = getMathWorker()
  return new Promise((resolve, reject) => {
    const id = nextId()

    const timer = setTimeout(() => {
      reject(new Error('Math worker timed out'))
    }, 60_000)

    const handler = (event: MessageEvent) => {
      if (event.data.id !== id) return
      mw.removeEventListener('message', handler)
      clearTimeout(timer)

      if (event.data.type === 'math:result') {
        resolve(event.data.result as Float64Array)
      } else {
        reject(new Error(event.data.error ?? 'Math worker error'))
      }
    }

    mw.addEventListener('message', handler)

    // Transfer buffers — a and b are no longer usable on the main thread
    // after this call (zero-copy semantics)
    mw.postMessage(
      { type: 'math:compute', id, a, b, op },
      [a.buffer, b.buffer]
    )
  })
}

// ---------------------------------------------------------------------------
// Worker Teardown
// ---------------------------------------------------------------------------

/**
 * Terminates the math worker. Called on app unload or when a new file is loaded.
 */
export function terminateWorkers(): void {
  mathWorkerInstance?.terminate()
  mathWorkerInstance = null
  logger.log('duckdbService: Workers terminated')
}
