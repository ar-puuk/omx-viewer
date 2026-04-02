/**
 * duckdbService.ts — Main-thread interface to the DuckDB Web Worker.
 *
 * Provides a promise-based API over the postMessage protocol defined in
 * duckdb.worker.ts. The worker is lazily initialised on first use.
 *
 * Responsibilities:
 *   - Spawn and initialise the DuckDB worker
 *   - Register Arrow IPC matrix batches with the worker
 *   - Execute aggregation SQL (or send a config for dynamic SQL generation)
 *   - Parse Arrow IPC results back to JS row arrays
 *   - Provide a clean API for the SummaryPanel and MetadataPanel
 *
 * NOT responsible for: element-wise arithmetic (see mathWorkerService.ts).
 */

import {
  DUCKDB_TIMEOUT_MS,
  DUCKDB_BATCH_ROWS,
} from '../utils/constants.js'
import { matrixToArrowIPCBatches, arrowIPCToRows } from '../utils/arrowUtils.js'
import { sliceFullMatrix } from './h5wasmService.js'
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
// Matrix Registration
// ---------------------------------------------------------------------------

/**
 * Registers a matrix with DuckDB by slicing it from h5wasm in batches and
 * sending each batch as an Arrow IPC message to the worker.
 *
 * The matrix is stored as a DuckDB table named after the matrix.
 * This is the setup step required before running any aggregation SQL.
 *
 * @param matrixName - Name of the matrix dataset (becomes the table name).
 * @param nrows      - Total number of rows.
 * @param ncols      - Total number of columns.
 */
export async function registerMatrix(
  matrixName: string,
  nrows: number,
  ncols: number
): Promise<void> {
  if (!workerReady) throw new Error('DuckDB worker not ready')

  logger.time(`duckdbService:register:${matrixName}`)

  // Slice the full matrix from h5wasm in batches
  const fullData = sliceFullMatrix(matrixName, nrows, ncols)

  let isFirst = true
  for (const { ipc, startRow } of matrixToArrowIPCBatches(
    fullData, nrows, ncols, 0, DUCKDB_BATCH_ROWS
  )) {
    logger.debug(`duckdbService: registering batch startRow=${startRow}`)
    await sendToWorker(
      {
        type: 'duckdb:register_batch',
        tableName: matrixName,
        ipc,
        isFirst,
      },
      [ipc.buffer]
    )
    isFirst = false
  }

  logger.timeEnd(`duckdbService:register:${matrixName}`)
}

// ---------------------------------------------------------------------------
// Aggregation — SummaryPanel main entry point
// ---------------------------------------------------------------------------

/**
 * Aggregation configuration for the summary query.
 */
export interface AggregationConfig {
  dimension: 'by_row' | 'by_col'
  fn: 'sum' | 'min' | 'max' | 'mean' | 'median' | 'stddev' | 'count_nonzero'
  scope: 'active' | 'all_matrices'
  activeMatrix: string
  allMatrixNames: string[]
  nrows: number
  ncols: number
}

/**
 * Runs an aggregation query against the registered DuckDB tables.
 *
 * Steps:
 *   1. Determine which matrices are in scope
 *   2. Register each scoped matrix with DuckDB (slicing from h5wasm)
 *   3. Send a config object to the worker for dynamic SQL construction
 *   4. Parse the Arrow IPC result back to columnNames + rows
 *
 * @param config - Aggregation configuration.
 * @returns      - { columnNames, rows }
 */
export async function runAggregation(config: AggregationConfig): Promise<{
  columnNames: string[]
  rows: Array<Array<number | string>>
}> {
  await initDuckDBWorker()

  const matrixNames = config.scope === 'active'
    ? [config.activeMatrix]
    : config.allMatrixNames.filter((n) => {
        // Only include file-backed (non-ephemeral) matrices
        return store.tabs.find((t) => t.id === n && !t.isEphemeral)
      })

  // Register all scoped matrices
  for (const name of matrixNames) {
    await registerMatrix(name, config.nrows, config.ncols)
  }

  // Send config to worker for dynamic SQL construction
  const workerConfig = {
    dimension: config.dimension,
    fn: config.fn,
    scope: config.scope,
    matrixNames,
    ncols: config.ncols,
  }

  const response = await sendToWorker({
    type: 'duckdb:query',
    config: workerConfig,
  }) as { ipc?: Uint8Array }

  if (!response.ipc) {
    throw new Error('DuckDB worker returned no IPC buffer')
  }

  const result = arrowIPCToRows(response.ipc)

  // Drop registered tables to free DuckDB memory
  for (const name of matrixNames) {
    worker?.postMessage({ type: 'duckdb:drop_table', tableName: name })
  }

  return result
}

// ---------------------------------------------------------------------------
// Metadata Stats Query
// ---------------------------------------------------------------------------

/**
 * Computes MIN, MAX, and MEAN for a single matrix using DuckDB.
 * Used by MetadataPanel for the stats display.
 *
 * @param matrixName - Matrix to compute stats for.
 * @param nrows      - Total rows.
 * @param ncols      - Total columns.
 * @returns          - { min, max, mean }
 */
export async function computeMatrixStats(
  matrixName: string,
  nrows: number,
  ncols: number
): Promise<{ min: number; max: number; mean: number }> {
  await initDuckDBWorker()
  await registerMatrix(matrixName, nrows, ncols)

  // Build a query that finds global min, max, mean across all columns
  const colExprs = Array.from({ length: ncols }, (_, i) => `c${i}`)
  const minExpr  = colExprs.map((c) => `MIN("${matrixName}".${c})`).join(', ')
  const maxExpr  = colExprs.map((c) => `MAX("${matrixName}".${c})`).join(', ')
  const sumExpr  = colExprs.map((c) => `SUM("${matrixName}".${c})`).join(' + ')

  const sql = `
    SELECT
      LEAST(${minExpr}) AS "min",
      GREATEST(${maxExpr}) AS "max",
      (${sumExpr}) / (${nrows} * ${ncols}) AS "mean"
    FROM "${matrixName}"
  `.trim()

  const response = await sendToWorker({ type: 'duckdb:query', sql }) as { ipc?: Uint8Array }

  worker?.postMessage({ type: 'duckdb:drop_table', tableName: matrixName })

  if (!response.ipc) return { min: NaN, max: NaN, mean: NaN }

  const { rows } = arrowIPCToRows(response.ipc)
  if (rows.length === 0) return { min: NaN, max: NaN, mean: NaN }

  const row = rows[0]
  return {
    min:  typeof row[0] === 'number' ? row[0] : NaN,
    max:  typeof row[1] === 'number' ? row[1] : NaN,
    mean: typeof row[2] === 'number' ? row[2] : NaN,
  }
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
