/**
 * formatNumber.ts — Locale-aware number formatting for matrix cell values.
 * Handles: decimal place configuration, compact notation, NaN/Infinity,
 * zero detection, and sign-based color class assignment.
 */

import type { DecimalOption } from './constants.js'

// ---------------------------------------------------------------------------
// Formatter Cache
// Intl.NumberFormat construction is expensive — cache one instance per config.
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.NumberFormat>()

/**
 * Returns a cached Intl.NumberFormat for the given decimal places.
 */
function getFormatter(decimals: DecimalOption, compact: boolean): Intl.NumberFormat {
  const key = `${decimals}:${compact}`
  if (formatterCache.has(key)) return formatterCache.get(key)!

  const fmt = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: compact ? 1 : decimals,
    maximumFractionDigits: compact ? 2 : decimals,
    notation: compact ? 'compact' : 'standard',
    compactDisplay: 'short',
  })

  formatterCache.set(key, fmt)
  return fmt
}

// ---------------------------------------------------------------------------
// Primary Formatting Function
// ---------------------------------------------------------------------------

/**
 * Formats a numeric value for display in the matrix grid.
 *
 * @param value        - The raw number to format (may be NaN or Infinity).
 * @param decimals     - Number of decimal places (0 | 2 | 4 | 6).
 * @param compact      - If true, use compact notation for large values (1.2M).
 * @returns            - Formatted string ready for display.
 */
export function formatNumber(
  value: number,
  decimals: DecimalOption,
  compact = false
): string {
  // Handle special floating-point values
  if (!isFinite(value)) {
    if (isNaN(value))       return 'NaN'
    if (value === Infinity)  return '+∞'
    if (value === -Infinity) return '−∞'
  }

  const fmt = getFormatter(decimals, compact)
  return fmt.format(value)
}

// ---------------------------------------------------------------------------
// Value Classification — used to assign CSS color classes
// ---------------------------------------------------------------------------

/** CSS class applied to positive values. */
export const CLASS_POSITIVE = 'value-positive'
/** CSS class applied to zero values. */
export const CLASS_ZERO     = 'value-zero'
/** CSS class applied to negative values. */
export const CLASS_NEGATIVE = 'value-negative'
/** CSS class applied to NaN/Infinity values. */
export const CLASS_NAN      = 'is-nan'

/**
 * Returns the CSS class name corresponding to the value's sign.
 * Used by GridCell to apply color coding without JS style manipulation.
 *
 * @param value - The raw numeric value.
 * @returns     - A CSS class string.
 */
export function getValueClass(value: number): string {
  if (!isFinite(value) || isNaN(value)) return CLASS_NAN
  if (value === 0)   return CLASS_ZERO
  if (value < 0)     return CLASS_NEGATIVE
  return CLASS_POSITIVE
}

// ---------------------------------------------------------------------------
// CSV Formatting — no locale formatting, plain decimal separator
// ---------------------------------------------------------------------------

/**
 * Formats a value for CSV export — uses fixed decimal notation with no
 * locale-specific thousands separators, ensuring maximum compatibility.
 *
 * @param value    - The raw number to format.
 * @param decimals - Number of decimal places.
 * @returns        - String safe for CSV output.
 */
export function formatForCSV(value: number, decimals: DecimalOption): string {
  if (isNaN(value))        return 'NaN'
  if (!isFinite(value))    return value > 0 ? 'Inf' : '-Inf'
  return value.toFixed(decimals)
}

// ---------------------------------------------------------------------------
// Summary Table Row → CSV Line
// ---------------------------------------------------------------------------

/**
 * Converts a summary result row (Array<number | string>) to a CSV line.
 * String values (index labels) are quoted if they contain commas or quotes.
 * Numeric values are formatted with formatForCSV.
 *
 * @param row      - One row from SummaryResult.rows.
 * @param decimals - Decimal places for numeric values.
 * @returns        - A CSV row string (no trailing newline).
 */
export function rowToCSVLine(
  row: Array<number | string>,
  decimals: DecimalOption
): string {
  return row
    .map((cell) => {
      if (typeof cell === 'string') {
        // Quote strings that contain commas, quotes, or newlines
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`
        }
        return cell
      }
      return formatForCSV(cell, decimals)
    })
    .join(',')
}

// ---------------------------------------------------------------------------
// Matrix Slice Export — visible grid view to CSV
// ---------------------------------------------------------------------------

/**
 * Converts a flat Float64Array representing a 2D matrix slice to a CSV string.
 * Includes an optional header row of column labels.
 *
 * @param data        - Flat typed array, row-major order.
 * @param nrows       - Number of rows in the slice.
 * @param ncols       - Number of columns.
 * @param rowOffset   - 0-based index of the first row (for the index column).
 * @param colLabels   - Optional array of column header strings.
 * @param rowLabels   - Optional array of row label strings.
 * @param decimals    - Decimal places for numeric values.
 * @returns           - Complete CSV string including header.
 */
export function matrixSliceToCSV(
  data: Float64Array | Float32Array,
  nrows: number,
  ncols: number,
  rowOffset: number,
  colLabels: string[] | null,
  rowLabels: string[] | null,
  decimals: DecimalOption
): string {
  const lines: string[] = []

  // Header row
  const headerCells = ['index']
  for (let c = 0; c < ncols; c++) {
    headerCells.push(colLabels ? colLabels[c] ?? String(c) : String(c))
  }
  lines.push(headerCells.join(','))

  // Data rows
  for (let r = 0; r < nrows; r++) {
    const rowIdx = rowOffset + r
    const label = rowLabels ? (rowLabels[rowIdx] ?? String(rowIdx)) : String(rowIdx)
    const cells: string[] = [label]
    for (let c = 0; c < ncols; c++) {
      cells.push(formatForCSV(data[r * ncols + c], decimals))
    }
    lines.push(cells.join(','))
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Compact Notation Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the absolute value exceeds the compact notation threshold.
 * Used by GridToolbar to enable/disable the compact toggle.
 *
 * @param value - The value to test.
 */
export function isLargeNumber(value: number): boolean {
  return Math.abs(value) >= 1_000_000
}

/**
 * Formats a file size in bytes to a human-readable string (KB / MB / GB).
 *
 * @param bytes - File size in bytes.
 * @returns     - e.g. "342.5 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024)                  return `${bytes} B`
  if (bytes < 1024 * 1024)           return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ---------------------------------------------------------------------------
// Trigger a browser download of a text blob
// ---------------------------------------------------------------------------

/**
 * Creates a Blob URL for the given text content and triggers a browser
 * download — no server involved.
 *
 * @param content  - The text content to download (e.g. a CSV string).
 * @param filename - The suggested filename for the download.
 * @param mimeType - MIME type (default: 'text/csv').
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = 'text/csv;charset=utf-8;'
): void {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Release the object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
