/**
 * arrowUtils.ts — Utilities for converting TypedArrays to Apache Arrow IPC
 * format for consumption by DuckDB-Wasm in the aggregation worker.
 *
 * Arrow IPC conversion is ONLY used when sending matrix data to DuckDB for
 * aggregation queries. Element-wise arithmetic uses plain TypedArrays in
 * math.worker.ts — no Arrow overhead.
 */

import { tableFromArrays, tableToIPC, tableFromIPC } from 'apache-arrow'
import type { Table } from 'apache-arrow'

// ---------------------------------------------------------------------------
// Matrix → Arrow IPC
// ---------------------------------------------------------------------------

/**
 * Converts a flat row-major Float64Array (a matrix slice) into an Arrow IPC
 * Uint8Array suitable for postMessage to the DuckDB worker.
 *
 * The resulting Arrow table has columns named c0, c1, ..., c{ncols-1} plus
 * a '_row' column containing the absolute row indices (for GROUP BY in SQL).
 *
 * @param data      - Flat Float64Array in row-major order, shape [nrows × ncols].
 * @param nrows     - Number of rows in the slice.
 * @param ncols     - Number of columns.
 * @param rowOffset - Absolute row index of the first row (used to populate '_row').
 * @returns         - Arrow IPC Uint8Array ready for transfer to the worker.
 */
export function matrixToArrowIPC(
  data: Float64Array,
  nrows: number,
  ncols: number,
  rowOffset: number
): Uint8Array {
  // Build column arrays in Arrow's columnar format
  const columns: Record<string, Float64Array> = {}

  // Row index column — absolute indices for GROUP BY _row
  const rowIndices = new Float64Array(nrows)
  for (let r = 0; r < nrows; r++) {
    rowIndices[r] = rowOffset + r
  }
  columns['_row'] = rowIndices

  // Data columns c0 … c{ncols-1}
  for (let c = 0; c < ncols; c++) {
    const col = new Float64Array(nrows)
    for (let r = 0; r < nrows; r++) {
      col[r] = data[r * ncols + c]
    }
    columns[`c${c}`] = col
  }

  const table = tableFromArrays(columns)
  return tableToIPC(table)
}

// ---------------------------------------------------------------------------
// Arrow IPC → JS objects (result parsing on main thread)
// ---------------------------------------------------------------------------

/**
 * Parses an Arrow IPC Uint8Array returned from the DuckDB worker into a
 * plain { columnNames, rows } structure that Svelte components can render.
 *
 * @param ipcBuffer - Arrow IPC Uint8Array from the worker postMessage.
 * @returns         - { columnNames: string[], rows: Array<Array<number | string>> }
 */
export function arrowIPCToRows(ipcBuffer: Uint8Array): {
  columnNames: string[]
  rows: Array<Array<number | string>>
} {
  const table: Table = tableFromIPC(ipcBuffer)

  const columnNames = table.schema.fields.map((f) => f.name)
  const rows: Array<Array<number | string>> = []

  for (let r = 0; r < table.numRows; r++) {
    const row: Array<number | string> = []
    for (const name of columnNames) {
      const val = table.getChild(name)?.get(r)
      // Arrow may return BigInt for integer columns — normalise to number
      if (typeof val === 'bigint') {
        row.push(Number(val))
      } else if (val === null || val === undefined) {
        row.push(NaN)
      } else {
        row.push(val as number | string)
      }
    }
    rows.push(row)
  }

  return { columnNames, rows }
}

// ---------------------------------------------------------------------------
// Single-column result helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a single numeric column from an Arrow IPC buffer as a Float64Array.
 * Used for metadata stats (min, max, mean) returned from DuckDB.
 *
 * @param ipcBuffer  - Arrow IPC Uint8Array.
 * @param columnName - Name of the column to extract.
 * @returns          - Float64Array of values, or an empty array if column not found.
 */
export function arrowIPCToColumn(
  ipcBuffer: Uint8Array,
  columnName: string
): Float64Array {
  const table: Table = tableFromIPC(ipcBuffer)
  const col = table.getChild(columnName)
  if (!col) return new Float64Array(0)

  const result = new Float64Array(col.length)
  for (let i = 0; i < col.length; i++) {
    const val = col.get(i)
    result[i] = val === null || val === undefined
      ? NaN
      : typeof val === 'bigint'
        ? Number(val)
        : (val as number)
  }
  return result
}

/**
 * Extracts a single scalar value (first row, named column) from an Arrow IPC
 * buffer. Used for DuckDB aggregate scalar results like MIN(), MAX(), AVG().
 *
 * @param ipcBuffer  - Arrow IPC Uint8Array.
 * @param columnName - Column containing the scalar.
 * @returns          - The scalar value as a number, or NaN if not found.
 */
export function arrowIPCToScalar(
  ipcBuffer: Uint8Array,
  columnName: string
): number {
  const col = arrowIPCToColumn(ipcBuffer, columnName)
  return col.length > 0 ? col[0] : NaN
}

// ---------------------------------------------------------------------------
// Batch registration helper — splits large data into manageable IPC batches
// ---------------------------------------------------------------------------

/**
 * Splits a large flat matrix Float64Array into multiple Arrow IPC buffers,
 * each covering at most `batchRows` rows. This avoids creating one enormous
 * postMessage payload when registering a 700 MB matrix with DuckDB.
 *
 * @param data      - Full flat Float64Array (nrows × ncols), row-major.
 * @param nrows     - Total number of rows.
 * @param ncols     - Total number of columns.
 * @param rowOffset - Absolute row index of data[0] (for '_row' column).
 * @param batchRows - Max rows per IPC batch (default 500).
 * @yields          - { ipc: Uint8Array, startRow: number, endRow: number }
 */
export function* matrixToArrowIPCBatches(
  data: Float64Array,
  nrows: number,
  ncols: number,
  rowOffset: number,
  batchRows = 500
): Generator<{ ipc: Uint8Array; startRow: number; endRow: number }> {
  let start = 0
  while (start < nrows) {
    const end = Math.min(start + batchRows, nrows)
    const batchSize = end - start

    // Slice the flat array for this batch
    const batchData = data.subarray(start * ncols, end * ncols)
    // Ensure it's a proper Float64Array (subarray returns a view)
    const batchFloat64 = batchData instanceof Float64Array
      ? batchData
      : new Float64Array(batchData)

    const ipc = matrixToArrowIPC(batchFloat64, batchSize, ncols, rowOffset + start)

    yield { ipc, startRow: rowOffset + start, endRow: rowOffset + end }
    start = end
  }
}
