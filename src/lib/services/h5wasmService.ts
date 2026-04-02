/**
 * h5wasmService.ts — All h5wasm interactions: initialisation, file open,
 * schema parsing, chunked row slicing, and cross-matrix cell reads.
 *
 * h5wasm runs synchronously on the main thread after initialisation.
 * Keeping it here avoids postMessage serialisation overhead for every
 * scroll-triggered slice — critical for 30fps scroll performance.
 *
 * Data flow:
 *   1. App calls initH5Wasm() once after file selection (lazy load)
 *   2. App calls openOMXFile(file) — validates, parses, stores h5File handle
 *   3. VirtualGrid calls sliceMatrixRows() for each visible row range
 *   4. ArithmeticModal calls sliceFullMatrix() to fetch for math.worker
 *   5. MetadataPanel triggers sliceCellAllMatrices() for cross-matrix read
 */

import type { MatrixFile } from '../state/matrixStore.svelte.js'
import {
  DEFAULT_ROW_CHUNK_SIZE,
  MAX_CACHED_CHUNKS,
  MATRICES_GROUP,
} from '../utils/constants.js'
import {
  parseOMXFile,
  validateHDF5Magic,
  normalizeDtype,
  OMXValidationError,
} from './omxParser.js'
import { store } from '../state/matrixStore.svelte.js'
import { logger } from '../utils/logger.js'

// ---------------------------------------------------------------------------
// Module-level h5wasm state
// h5wasm is a singleton — initialise once per page load.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type H5Module = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type H5File = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type H5Dataset = any

let h5module: H5Module | null = null
let h5file: H5File | null = null

/** Per-matrix aligned chunk sizes (set on first open). */
const matrixChunkSizes = new Map<string, number>()

// ---------------------------------------------------------------------------
// 1. Initialisation — lazy, called only after file selection
// ---------------------------------------------------------------------------

/**
 * Initialises the h5wasm WebAssembly module.
 * Idempotent — safe to call multiple times; returns cached module after init.
 * The WASM binary is loaded from /omx-viewer/h5wasm/ (copied by postinstall).
 *
 * @returns - The initialised h5wasm module.
 * @throws  - If the WASM binary cannot be loaded.
 */
export async function initH5Wasm(): Promise<H5Module> {
  if (h5module) return h5module

  logger.time('h5wasmService:init')
  // Dynamic import — keeps h5wasm out of the initial bundle
  const h5wasmModule = await import('h5wasm')
  // h5wasm default export is the init function in the main entry
  const initFn = h5wasmModule.default ?? h5wasmModule
  h5module = await (typeof initFn === 'function' ? initFn : initFn.default)({
    locateFile: (filename: string) => `/omx-viewer/h5wasm/${filename}`
  })
  logger.timeEnd('h5wasmService:init')
  logger.log('h5wasmService: h5wasm initialised')
  return h5module
}

// ---------------------------------------------------------------------------
// 2. File Open + Validation
// ---------------------------------------------------------------------------

/**
 * Opens an OMX/HDF5 File, validates it, and returns the parsed MatrixFile.
 * Stores the h5wasm file handle in module scope for subsequent slice calls.
 *
 * Steps:
 *   1. Validate HDF5 magic bytes (cheap, no WASM needed)
 *   2. Ensure h5wasm is initialised
 *   3. Load file bytes into the h5wasm virtual FS
 *   4. Open with h5wasm and parse the OMX structure
 *   5. Detect and cache native chunk sizes for each matrix
 *
 * @param file - The browser File object from drag-drop or file picker.
 * @returns    - Parsed MatrixFile metadata.
 * @throws     - OMXValidationError for invalid files; Error for I/O failures.
 */
export async function openOMXFile(file: File): Promise<MatrixFile> {
  // Step 1: Validate magic bytes before loading the full file
  const isHDF5 = await validateHDF5Magic(file)
  if (!isHDF5) {
    throw new OMXValidationError(
      'This file does not appear to be a valid HDF5/OMX file.'
    )
  }

  // Step 2: Ensure h5wasm is ready
  const mod = await initH5Wasm()

  // Step 3: Close any previously open file
  closeCurrentFile()

  // Step 4: Read file bytes and mount to h5wasm virtual FS
  logger.time('h5wasmService:readFile')
  const arrayBuffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(arrayBuffer)
  logger.timeEnd('h5wasmService:readFile')

  // h5wasm uses Emscripten's virtual FS — write to /work/
  const vfsPath = `/work/${file.name}`
  mod.FS.mkdirTree('/work')
  mod.FS.writeFile(vfsPath, uint8)

  // Step 5: Open the file
  logger.time('h5wasmService:openFile')
  try {
    h5file = new mod.File(vfsPath, 'r')
  } catch (err) {
    throw new OMXValidationError(
      'This file does not appear to be a valid HDF5/OMX file.'
    )
  }
  logger.timeEnd('h5wasmService:openFile')

  // Step 6: Parse OMX structure
  const parsedFile = parseOMXFile(h5file, file.name)

  // Step 7: Detect native chunk sizes and dtypes for each matrix
  matrixChunkSizes.clear()
  for (const name of parsedFile.matrixNames) {
    try {
      const chunkSize = getAlignedChunkSize(name, parsedFile.shape[1])
      matrixChunkSizes.set(name, chunkSize)

      // Detect dtype and update the tab in the store
      const dataset = h5file.get(`${MATRICES_GROUP}/${name}`) as H5Dataset
      const rawDtype: string = dataset.dtype ?? 'float32'
      const dtype = normalizeDtype(rawDtype)
      store.setTabDtype(name, dtype)

      logger.debug(
        `h5wasmService: matrix '${name}' dtype=${dtype} ` +
        `chunkSize=${chunkSize}`
      )
    } catch (err) {
      logger.warn(`h5wasmService: Could not inspect matrix '${name}'`, err)
      matrixChunkSizes.set(name, DEFAULT_ROW_CHUNK_SIZE)
    }
  }

  return parsedFile
}

// ---------------------------------------------------------------------------
// 3. Chunk Size Detection — aligns reads to native HDF5 chunk shape
// ---------------------------------------------------------------------------

/**
 * Reads the HDF5 dataset's native chunk shape and returns an aligned row
 * chunk size. Alignment to native chunks minimises wasted decompression.
 *
 * @param matrixName - Name of the matrix dataset under /matrices/.
 * @param ncols      - Number of columns (used for contiguous fallback).
 * @returns          - Aligned row chunk size to use for slice calls.
 */
export function getAlignedChunkSize(matrixName: string, _ncols: number): number {
  if (!h5file) return DEFAULT_ROW_CHUNK_SIZE

  try {
    const dataset = h5file.get(`${MATRICES_GROUP}/${matrixName}`) as H5Dataset
    const chunks: number[] | null = dataset.chunks ?? null

    if (chunks && chunks.length >= 1 && chunks[0] > 0) {
      // Use the larger of the native row chunk or our default
      return Math.max(chunks[0], DEFAULT_ROW_CHUNK_SIZE)
    }
  } catch {
    // Dataset may not be chunked (contiguous layout) — fall through
  }

  return DEFAULT_ROW_CHUNK_SIZE
}

/**
 * Returns the cached aligned chunk size for a named matrix.
 * Falls back to DEFAULT_ROW_CHUNK_SIZE if not yet computed.
 *
 * @param matrixName - Matrix dataset name.
 * @returns          - Row chunk size.
 */
export function getChunkSize(matrixName: string): number {
  return matrixChunkSizes.get(matrixName) ?? DEFAULT_ROW_CHUNK_SIZE
}

// ---------------------------------------------------------------------------
// 4. Chunked Row Slicing — core performance path
// ---------------------------------------------------------------------------

/**
 * Slices a range of rows from a named matrix dataset.
 * Returns a flat Float64Array in row-major order: shape [rowCount × ncols].
 *
 * Results are cached in the MatrixTab's LRU cache. Cache hits avoid
 * re-issuing any h5wasm slice call.
 *
 * @param matrixName - Dataset name under /matrices/.
 * @param rowStart   - Inclusive start row (0-based).
 * @param rowEnd     - Exclusive end row.
 * @param ncols      - Number of columns in the matrix.
 * @param tabId      - Tab ID for cache storage (usually equals matrixName).
 * @returns          - Flat Float64Array, length = (rowEnd - rowStart) × ncols.
 * @throws           - If h5wasm is not initialised or the dataset is missing.
 */
export function sliceMatrixRows(
  matrixName: string,
  rowStart: number,
  rowEnd: number,
  ncols: number,
  tabId: string,
  cachedRows: Map<number, Float64Array>
): Float64Array {
  if (!h5file) {
    throw new Error('h5wasmService: No file is open. Call openOMXFile() first.')
  }

  const chunkSize = getChunkSize(matrixName)
  // Align rowStart to chunk boundary
  const chunkStart = Math.floor(rowStart / chunkSize) * chunkSize

  // Cache hit — return immediately
  if (cachedRows.has(chunkStart)) {
    store.touchCacheEntry(tabId, chunkStart)
    const cached = cachedRows.get(chunkStart)!
    return extractRowsFromChunk(cached, rowStart - chunkStart, rowEnd - chunkStart, ncols)
  }

  // Cache miss — fetch from h5wasm
  logger.time(`h5wasmService:slice:${matrixName}[${chunkStart}]`)

  const chunkEnd = Math.min(chunkStart + chunkSize, /* total rows determined at call site */ rowEnd + chunkSize)
  const dataset = h5file.get(`${MATRICES_GROUP}/${matrixName}`) as H5Dataset

  // Determine actual dataset row count from shape
  const shape: number[] = dataset.shape ?? [0, ncols]
  const totalRows = shape[0]
  const actualEnd = Math.min(chunkStart + chunkSize, totalRows)

  const raw = dataset.slice([[chunkStart, actualEnd], [0, ncols]]) as
    Float32Array | Float64Array | Int32Array

  // Normalise to Float64Array
  const chunk: Float64Array =
    raw instanceof Float64Array ? raw : new Float64Array(raw)

  logger.timeEnd(`h5wasmService:slice:${matrixName}[${chunkStart}]`)

  // Store in LRU cache
  store.addChunkToCache(tabId, chunkStart, chunk, MAX_CACHED_CHUNKS)

  return extractRowsFromChunk(chunk, rowStart - chunkStart, rowEnd - chunkStart, ncols)
}

/**
 * Extracts a sub-range of rows from an already-fetched chunk.
 * Used to serve partial-chunk requests from cache.
 *
 * @param chunk      - Flat Float64Array for the full chunk.
 * @param localStart - Start row index within the chunk (0-based within chunk).
 * @param localEnd   - End row index within the chunk (exclusive).
 * @param ncols      - Number of columns.
 * @returns          - Flat Float64Array for the requested sub-range.
 */
function extractRowsFromChunk(
  chunk: Float64Array,
  localStart: number,
  localEnd: number,
  ncols: number
): Float64Array {
  const clampedStart = Math.max(0, localStart)
  const clampedEnd = Math.min(Math.floor(chunk.length / ncols), localEnd)
  if (clampedStart >= clampedEnd) return new Float64Array(0)
  return chunk.subarray(clampedStart * ncols, clampedEnd * ncols)
}

// ---------------------------------------------------------------------------
// 5. Full Matrix Slice — for arithmetic (sent to math.worker)
// ---------------------------------------------------------------------------

/**
 * Reads an entire matrix dataset in ROW_CHUNK_SIZE batches, assembling a
 * single flat Float64Array. Used by ArithmeticModal before sending to
 * math.worker.ts.
 *
 * WARNING: This loads the ENTIRE matrix into memory. Only call for matrices
 * that will be immediately transferred to a worker (Transferable buffer).
 * Max safe size: ~700 MB / 2 matrices in parallel = ~350 MB each.
 *
 * @param matrixName - Dataset name under /matrices/.
 * @param nrows      - Total number of rows.
 * @param ncols      - Total number of columns.
 * @returns          - Flat Float64Array of shape [nrows × ncols].
 */
export function sliceFullMatrix(
  matrixName: string,
  nrows: number,
  ncols: number
): Float64Array {
  if (!h5file) {
    throw new Error('h5wasmService: No file is open.')
  }

  const result = new Float64Array(nrows * ncols)
  const dataset = h5file.get(`${MATRICES_GROUP}/${matrixName}`) as H5Dataset
  const chunkSize = getChunkSize(matrixName)

  logger.time(`h5wasmService:sliceFull:${matrixName}`)

  let row = 0
  while (row < nrows) {
    const end = Math.min(row + chunkSize, nrows)
    const raw = dataset.slice([[row, end], [0, ncols]]) as
      Float32Array | Float64Array | Int32Array
    const chunk = raw instanceof Float64Array ? raw : new Float64Array(raw)
    result.set(chunk, row * ncols)
    row = end
  }

  logger.timeEnd(`h5wasmService:sliceFull:${matrixName}`)
  return result
}

// ---------------------------------------------------------------------------
// 6. Single-Cell Slice — for cross-matrix cell inspector
// ---------------------------------------------------------------------------

/**
 * Reads the scalar value at [row, col] from a single named matrix.
 * Uses the minimal possible slice: [[row, row+1], [col, col+1]].
 * This reads exactly one HDF5 chunk and returns a 1-element TypedArray.
 *
 * @param matrixName - Dataset name under /matrices/.
 * @param row        - 0-based row index.
 * @param col        - 0-based column index.
 * @returns          - The scalar value at [row, col].
 */
export function sliceCell(matrixName: string, row: number, col: number): number {
  if (!h5file) return NaN

  try {
    const dataset = h5file.get(`${MATRICES_GROUP}/${matrixName}`) as H5Dataset
    const raw = dataset.slice([[row, row + 1], [col, col + 1]]) as
      Float32Array | Float64Array | Int32Array
    return raw[0] ?? NaN
  } catch (err) {
    logger.warn(`h5wasmService: sliceCell failed for ${matrixName}[${row},${col}]`, err)
    return NaN
  }
}

/**
 * Reads the scalar value at [row, col] from EVERY non-ephemeral matrix.
 * All reads are synchronous and sequential — h5wasm single-cell slices are
 * extremely fast (one HDF5 chunk read per call).
 *
 * @param matrixNames - Names of all file-backed matrices.
 * @param row         - 0-based row index.
 * @param col         - 0-based column index.
 * @returns           - Record of matrixName → value.
 */
export function sliceCellAllMatrices(
  matrixNames: string[],
  row: number,
  col: number
): Record<string, number> {
  const values: Record<string, number> = {}
  for (const name of matrixNames) {
    values[name] = sliceCell(name, row, col)
  }
  return values
}

// ---------------------------------------------------------------------------
// 7. Matrix Metadata — min, max, mean (computed via DuckDB in practice,
//    but a fast h5wasm-only fallback is provided for small matrices)
// ---------------------------------------------------------------------------

/**
 * Computes basic statistics (min, max, mean) for a matrix slice by reading
 * the full dataset in chunks. This is the fallback path used when DuckDB is
 * unavailable. For large matrices, prefer the DuckDB worker path.
 *
 * @param matrixName - Dataset name.
 * @param nrows      - Total rows.
 * @param ncols      - Total columns.
 * @returns          - { min, max, mean }
 */
export function computeBasicStats(
  matrixName: string,
  nrows: number,
  ncols: number
): { min: number; max: number; mean: number } {
  if (!h5file) return { min: NaN, max: NaN, mean: NaN }

  const dataset = h5file.get(`${MATRICES_GROUP}/${matrixName}`) as H5Dataset
  const chunkSize = getChunkSize(matrixName)

  let min = Infinity
  let max = -Infinity
  let sum = 0
  let count = 0

  let row = 0
  while (row < nrows) {
    const end = Math.min(row + chunkSize, nrows)
    const raw = dataset.slice([[row, end], [0, ncols]]) as
      Float32Array | Float64Array | Int32Array

    for (let i = 0; i < raw.length; i++) {
      const v = raw[i]
      if (isFinite(v)) {
        if (v < min) min = v
        if (v > max) max = v
        sum += v
        count++
      }
    }
    row = end
  }

  return {
    min: count > 0 ? min : NaN,
    max: count > 0 ? max : NaN,
    mean: count > 0 ? sum / count : NaN,
  }
}

// ---------------------------------------------------------------------------
// 8. File Lifecycle
// ---------------------------------------------------------------------------

/**
 * Closes the currently open h5wasm file handle and frees its virtual FS entry.
 * Safe to call when no file is open.
 */
export function closeCurrentFile(): void {
  if (h5file) {
    try {
      h5file.close()
    } catch {
      // Ignore close errors
    }
    h5file = null
    matrixChunkSizes.clear()
    logger.log('h5wasmService: File closed')
  }
}

/**
 * Returns true if an h5wasm file is currently open.
 */
export function isFileOpen(): boolean {
  return h5file !== null
}

/**
 * Returns the raw h5wasm File object for direct access when needed.
 * Use sparingly — prefer the typed service functions above.
 */
export function getRawH5File(): H5File | null {
  return h5file
}
