/**
 * duckdbService.ts — Aggregation service + DuckDB worker + math worker.
 *
 * Aggregations (runAggregation, computeMatrixStats) are computed by streaming
 * row chunks directly from h5wasm — no DuckDB or Arrow IPC needed. This avoids
 * the O(full-matrix) memory overhead that caused OOM with wide matrices
 * (3,629 cols × 23 matrices ≈ 2.4 GB exceeded DuckDB-Wasm's 512 MB limit).
 *
 * The DuckDB worker infrastructure is retained for potential future use.
 * Element-wise arithmetic uses math.worker.ts (Transferable Float64Arrays).
 */

import {
  DUCKDB_TIMEOUT_MS,
} from '../utils/constants.js'
import { sliceRawChunk, getChunkSize, computeBasicStats } from './h5wasmService.js'
import { logger } from '../utils/logger.js'
import { store } from '../state/matrixStore.svelte.js'

// ---------------------------------------------------------------------------
// Worker Lifecycle
// ---------------------------------------------------------------------------

let worker: Worker | null = null
let workerReady = false
let workerInitPromise: Promise<void> | null = null

/** Pending promise resolvers keyed by message ID. */
const pending = new Map<
  string,
  { resolve: (data: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

let _msgIdCounter = 0
function nextId(): string {
  return `ddb-${++_msgIdCounter}`
}

// ---------------------------------------------------------------------------
// Worker Initialisation
// ---------------------------------------------------------------------------

/**
 * Lazily spawns the DuckDB worker and waits for its init:ok message.
 * Idempotent — safe to call multiple times.
 *
 * @returns - Resolves when the worker is ready to accept queries.
 * @throws  - If the worker fails to initialise within DUCKDB_TIMEOUT_MS.
 */
export async function initDuckDBWorker(): Promise<void> {
  if (workerReady) return
  if (workerInitPromise) return workerInitPromise

  workerInitPromise = new Promise<void>((resolve, reject) => {
    // Vite processes ?worker imports as ES module workers
    worker = new Worker(
      new URL('../workers/duckdb.worker.ts', import.meta.url),
      { type: 'module' }
    )

    const timer = setTimeout(() => {
      reject(new Error('DuckDB worker init timed out'))
    }, DUCKDB_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent) => {
      const { type, id, error } = event.data as {
        type: string
        id?: string
        error?: string
        ipc?: Uint8Array
      }

      // Init responses
      if (type === 'duckdb:init:ok') {
        clearTimeout(timer)
        workerReady = true
        store.duckdbReady = true  // valid: store is a class instance, not an import binding
        logger.log('duckdbService: DuckDB worker ready')
        resolve()
        return
      }

      if (type === 'duckdb:init:error') {
        clearTimeout(timer)
        logger.error('duckdbService: DuckDB init failed:', error)
        reject(new Error(error ?? 'DuckDB worker failed to initialise'))
        return
      }

      // Route all other responses to their pending promise
      if (id && pending.has(id)) {
        const { resolve: res, reject: rej, timer: t } = pending.get(id)!
        clearTimeout(t)
        pending.delete(id)

        if (type.endsWith(':error')) {
          rej(new Error(error ?? 'DuckDB worker error'))
        } else {
          res(event.data)
        }
      }
    }

    worker.onerror = (err) => {
      clearTimeout(timer)
      const msg = err.message ?? 'DuckDB worker crashed'
      logger.error('duckdbService: Worker error:', msg)
      reject(new Error(msg))
    }

    // Trigger initialisation
    worker.postMessage({ type: 'duckdb:init' })
  })

  return workerInitPromise
}

// ---------------------------------------------------------------------------
// Low-level worker messaging
// ---------------------------------------------------------------------------

/**
 * Sends a message to the DuckDB worker and waits for a matching response.
 * Automatically assigns and tracks a message ID for promise resolution.
 *
 * @param msg        - Message payload (must not include 'id' — added here).
 * @param transfer   - Optional Transferable buffers.
 * @returns          - Resolves with the worker's response data.
 */
function sendToWorker(
  msg: Record<string, unknown>,
  transfer: Transferable[] = []
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!worker || !workerReady) {
      reject(new Error('DuckDB worker is not ready'))
      return
    }

    const id = nextId()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`DuckDB worker timeout for message ${id}`))
    }, DUCKDB_TIMEOUT_MS)

    pending.set(id, {
      resolve: resolve as (data: unknown) => void,
      reject,
      timer,
    })

    worker.postMessage({ ...msg, id }, transfer)
  })
}

// ---------------------------------------------------------------------------
// Streaming Aggregation — replaces DuckDB-based aggregation
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
// Aggregation — SummaryPanel main entry point
// ---------------------------------------------------------------------------

/**
 * Runs a streaming aggregation by reading h5wasm row chunks directly.
 * Processes one matrix at a time — peak memory is one chunk (~2.9 MB for
 * 200 rows × 3,629 cols × 4 bytes) plus the result arrays.
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

  const aggFn = dimension === 'by_row' ? streamingRowAgg : streamingColAgg
  const resultLength = dimension === 'by_row' ? nrows : ncols

  // Aggregate each matrix, yielding between matrices for UI responsiveness
  const perMatrix: Record<string, Float64Array> = {}
  for (const name of matrixNames) {
    perMatrix[name] = aggFn(name, nrows, ncols, fn)
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

let mathWorker: Worker | null = null

/**
 * Lazily spawns the math worker.
 */
function getMathWorker(): Worker {
  if (!mathWorker) {
    mathWorker = new Worker(
      new URL('../workers/math.worker.ts', import.meta.url),
      { type: 'module' }
    )
  }
  return mathWorker
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
  return new Promise((resolve, reject) => {
    const mw = getMathWorker()
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
 * Terminates both workers. Called on app unload or when a new file is loaded.
 */
export function terminateWorkers(): void {
  worker?.terminate()
  mathWorker?.terminate()
  worker = null
  mathWorker = null
  workerReady = false
  workerInitPromise = null
  pending.clear()
  logger.log('duckdbService: Workers terminated')
}
