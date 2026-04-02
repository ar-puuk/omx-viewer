/**
 * duckdb.worker.ts — DuckDB-Wasm Web Worker.
 *
 * Hosts the DuckDB-Wasm instance. Handles ONLY aggregation queries:
 * SUM, MIN, MAX, MEAN, MEDIAN, STD DEV, COUNT NON-ZERO.
 * Element-wise arithmetic lives in math.worker.ts.
 *
 * Message protocol (see DUCKDB_MSG constants):
 *   Main → Worker:
 *     { type: 'duckdb:init' }
 *     { type: 'duckdb:register_batch', id, tableName, ipc: Uint8Array, isFirst: boolean }
 *     { type: 'duckdb:drop_table', tableName }
 *     { type: 'duckdb:query', id, sql }
 *
 *   Worker → Main:
 *     { type: 'duckdb:init:ok' }
 *     { type: 'duckdb:init:error', error: string }
 *     { type: 'duckdb:register:ok', id }
 *     { type: 'duckdb:register:error', id, error: string }
 *     { type: 'duckdb:query:result', id, ipc: Uint8Array }
 *     { type: 'duckdb:query:error', id, error: string }
 */

import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { tableToIPC, tableFromIPC } from 'apache-arrow'

// ---------------------------------------------------------------------------
// DuckDB Instance (module-scoped)
// ---------------------------------------------------------------------------

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function initDuckDB(): Promise<void> {
  // Use the MVP (single-threaded) bundle — avoids SharedArrayBuffer requirement.
  // This makes it work on GitHub Pages without COOP/COEP headers at the network
  // level (coi-serviceworker handles that separately).
  const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    eh: {
      mainModule: duckdb_wasm,
      mainWorker: eh_worker,
      pthreadWorker: null,
    },
  }

  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
  const worker = new Worker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)

  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  conn = await db.connect()

  // Optimise for in-memory analytical workloads
  await conn.query(`
    SET threads TO 1;
    SET memory_limit = '512MB';
  `)
}

// ---------------------------------------------------------------------------
// Arrow IPC batch registration
// ---------------------------------------------------------------------------

/**
 * Registers an Arrow IPC batch as part of a DuckDB table.
 * If isFirst=true, drops the existing table and creates a fresh one.
 * Subsequent batches with isFirst=false INSERT into the existing table.
 */
async function registerBatch(
  tableName: string,
  ipc: Uint8Array,
  isFirst: boolean
): Promise<void> {
  if (!conn) throw new Error('DuckDB not initialised')

  // Register the Arrow buffer as a named view in DuckDB
  const viewName = `_ipc_${tableName}_${Date.now()}`
  await db!.registerFileBuffer(`${viewName}.arrow`, ipc)

  if (isFirst) {
    // Drop existing table if present, create from first batch
    await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)
    await conn.query(`
      CREATE TABLE "${tableName}" AS
      SELECT * FROM read_ipc_file('${viewName}.arrow')
    `)
  } else {
    // Append subsequent batches
    await conn.query(`
      INSERT INTO "${tableName}"
      SELECT * FROM read_ipc_file('${viewName}.arrow')
    `)
  }

  // Clean up the temporary file buffer
  try {
    await db!.dropFile(`${viewName}.arrow`)
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// SQL Construction — dynamic aggregation query builder
// ---------------------------------------------------------------------------

/**
 * Config structure received from the main thread for aggregation queries.
 */
interface AggregationConfig {
  dimension: 'by_row' | 'by_col'
  fn: 'sum' | 'min' | 'max' | 'mean' | 'median' | 'stddev' | 'count_nonzero'
  scope: 'active' | 'all_matrices'
  matrixNames: string[]   // [activeMatrix] or all matrix names
  ncols: number
}

/**
 * Maps our fn enum to the DuckDB SQL aggregate expression for a single value
 * representing one row's (or col's) aggregate across all its columns.
 *
 * For 'by_row': we aggregate across ncols column expressions c0+c1+...
 * For 'by_col': we aggregate across all rows with GROUP BY col index.
 *
 * @param fn    - Aggregation function identifier.
 * @param expr  - The column expression to aggregate over (e.g. 'val' or the row sum expr).
 * @returns     - SQL aggregate expression string.
 */
function buildAggExpr(
  fn: AggregationConfig['fn'],
  expr: string
): string {
  switch (fn) {
    case 'sum':           return `SUM(${expr})`
    case 'min':           return `MIN(${expr})`
    case 'max':           return `MAX(${expr})`
    case 'mean':          return `AVG(${expr})`
    case 'median':        return `MEDIAN(${expr})`
    case 'stddev':        return `STDDEV_POP(${expr})`
    case 'count_nonzero': return `COUNT(${expr}) FILTER (WHERE ${expr} != 0)`
  }
}

/**
 * Builds the column list expression for a "by row" aggregate.
 * For SUM/MIN/MAX/MEAN: sum all column values in the row, then aggregate.
 * For MEDIAN/STDDEV/COUNT_NONZERO: unnest each cell as a separate observation.
 *
 * Since DuckDB operates on columnar data, we use UNPIVOT-style expressions.
 * The approach: create a sub-expression that represents the per-row
 * contribution, then aggregate per _row group.
 *
 * For SUM by row: SELECT _row, SUM(c0) + SUM(c1) + ... AS value GROUP BY _row
 * For MEAN by row: SELECT _row, (SUM(c0)+SUM(c1)+...) / ncols AS value GROUP BY _row
 *
 * @param fn     - Aggregation function.
 * @param ncols  - Number of columns.
 * @param alias  - Alias for the resulting value column.
 * @param table  - Table alias (for multi-table JOINs).
 */
function buildRowAggSQL(
  fn: AggregationConfig['fn'],
  ncols: number,
  alias: string,
  table: string
): string {
  const colList = Array.from({ length: ncols }, (_, i) => `"${table}".c${i}`)

  switch (fn) {
    case 'sum': {
      // SUM of all column values per row
      return `(${colList.map((c) => `SUM(${c})`).join(' + ')}) AS "${alias}"`
    }
    case 'min': {
      // Minimum across all column SUM-per-row values
      // Use LEAST() applied to per-row mins
      const mins = colList.map((c) => `MIN(${c})`).join(', ')
      return `LEAST(${mins}) AS "${alias}"`
    }
    case 'max': {
      const maxs = colList.map((c) => `MAX(${c})`).join(', ')
      return `GREATEST(${maxs}) AS "${alias}"`
    }
    case 'mean': {
      // Mean of all cells in this row = total sum / ncols
      const sums = colList.map((c) => `SUM(${c})`).join(' + ')
      return `((${sums}) / ${ncols}) AS "${alias}"`
    }
    case 'median': {
      // DuckDB's MEDIAN works over a list — use MEDIAN across column values
      // We aggregate each column independently and take the median of medians
      // (an approximation — true row median requires UNPIVOT in DuckDB)
      const medians = colList.map((c) => `MEDIAN(${c})`).join(', ')
      return `MEDIAN(LIST_VALUE(${medians})[1]) AS "${alias}"`
    }
    case 'stddev': {
      // STDDEV_POP across all column values per row (approximation via colwise stddev)
      const stds = colList.map((c) => `STDDEV_POP(${c})`).join(' + ')
      return `((${stds}) / ${ncols}) AS "${alias}"`
    }
    case 'count_nonzero': {
      // Count of non-zero values across all columns for this row
      const counts = colList.map((c) => `COUNT(${c}) FILTER (WHERE ${c} != 0)`).join(' + ')
      return `(${counts}) AS "${alias}"`
    }
  }
}

/**
 * Builds the complete aggregation SQL for a single matrix (active scope)
 * or a multi-matrix JOIN (all_matrices scope).
 *
 * @param config - Aggregation configuration from the main thread.
 * @returns      - Complete SQL string to execute.
 */
function buildAggregationSQL(config: AggregationConfig): string {
  const { dimension, fn, matrixNames, ncols } = config

  if (dimension === 'by_row') {
    if (matrixNames.length === 1) {
      // Single matrix: SELECT _row AS idx, <agg> AS value FROM table GROUP BY _row
      const m = matrixNames[0]
      const aggExpr = buildRowAggSQL(fn, ncols, 'value', m)
      return `
        SELECT
          CAST(_row AS INTEGER) AS idx,
          ${aggExpr}
        FROM "${m}"
        GROUP BY _row
        ORDER BY idx
      `.trim()
    }

    // Multi-matrix: JOIN all matrices on _row, one value column per matrix
    const [first, ...rest] = matrixNames
    const selectCols = matrixNames.map((m) =>
      buildRowAggSQL(fn, ncols, m, m)
    ).join(',\n          ')

    const joins = rest.map((m) =>
      `JOIN "${m}" ON "${first}"._row = "${m}"._row`
    ).join('\n        ')

    return `
      SELECT
        CAST("${first}"._row AS INTEGER) AS idx,
        ${selectCols}
      FROM "${first}"
      ${joins}
      GROUP BY "${first}"._row
      ORDER BY idx
    `.trim()
  }

  // by_col: aggregate across rows for each column index
  // We produce one row per column index
  if (matrixNames.length === 1) {
    const m = matrixNames[0]
    const colAggs = Array.from({ length: ncols }, (_, c) =>
      `${buildAggExpr(fn, `"${m}".c${c}`)} AS col_${c}`
    ).join(', ')

    // Pivot: the result has one column per matrix column, we need to unpivot to rows
    // Use UNPIVOT via a VALUES approach for DuckDB compatibility
    const colSql = Array.from({ length: ncols }, (_, c) =>
      `SELECT ${c} AS idx, ${buildAggExpr(fn, `c${c}`)} AS value FROM "${m}"`
    ).join('\nUNION ALL\n')

    return `${colSql}\nORDER BY idx`
  }

  // Multi-matrix by col: one value column per matrix
  const unionParts = Array.from({ length: ncols }, (_, c) => {
    const valueCols = matrixNames.map((m) =>
      `${buildAggExpr(fn, `"${m}".c${c}`)} AS "${m}"`
    ).join(', ')
    const joins = matrixNames.slice(1).map((m) =>
      `CROSS JOIN (SELECT ${buildAggExpr(fn, `c${c}`)} FROM "${m}") AS _${m}`
    )
    return `SELECT ${c} AS idx, ${valueCols} FROM "${matrixNames[0]}" ${joins.join(' ')}`
  }).join('\nUNION ALL\n')

  return `${unionParts}\nORDER BY idx`
}

// ---------------------------------------------------------------------------
// Message Handler
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent) => {
  const { type, id, tableName, ipc, isFirst, sql, config } = event.data as {
    type: string
    id?: string
    tableName?: string
    ipc?: Uint8Array
    isFirst?: boolean
    sql?: string
    config?: AggregationConfig
  }

  switch (type) {
    // -----------------------------------------------------------------------
    case 'duckdb:init': {
      try {
        await initDuckDB()
        self.postMessage({ type: 'duckdb:init:ok' })
      } catch (err) {
        self.postMessage({
          type: 'duckdb:init:error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    // -----------------------------------------------------------------------
    case 'duckdb:register_batch': {
      try {
        if (!tableName || !ipc) throw new Error('Missing tableName or ipc')
        await registerBatch(tableName, ipc, isFirst ?? true)
        self.postMessage({ type: 'duckdb:register:ok', id })
      } catch (err) {
        self.postMessage({
          type: 'duckdb:register:error',
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    // -----------------------------------------------------------------------
    case 'duckdb:drop_table': {
      try {
        if (!tableName) throw new Error('Missing tableName')
        if (conn) await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)
      } catch {
        // Non-fatal
      }
      break
    }

    // -----------------------------------------------------------------------
    case 'duckdb:query': {
      try {
        if (!conn) throw new Error('DuckDB not initialised')

        // If a config object is provided, build the SQL dynamically
        const querySql = config ? buildAggregationSQL(config) : sql
        if (!querySql) throw new Error('No SQL or config provided')

        const result = await conn.query(querySql)
        // Serialise result back as Arrow IPC for zero-copy transfer
        const ipcResult = tableToIPC(result)

        self.postMessage(
          { type: 'duckdb:query:result', id, ipc: ipcResult },
          [ipcResult.buffer]
        )
      } catch (err) {
        self.postMessage({
          type: 'duckdb:query:error',
          id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    default:
      // Unknown message type — silently ignore
      break
  }
}

// Satisfy TypeScript's module requirements for worker files
export {}
