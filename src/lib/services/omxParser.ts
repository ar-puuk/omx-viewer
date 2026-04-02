/**
 * omxParser.ts — OMX-specific validation and metadata extraction layered
 * on top of h5wasmService's raw HDF5 access.
 *
 * Responsibilities:
 *   - Validate that an opened HDF5 file conforms to the OMX convention
 *   - Extract matrix names, shape, OMX version, and lookup tables
 *   - Produce typed MatrixFile objects consumed by matrixStore
 *
 * This module does NOT do any raw h5wasm calls — it delegates to
 * h5wasmService for all HDF5 I/O.
 */

import type { MatrixFile } from '../state/matrixStore.svelte.js'
import {
  MATRICES_GROUP,
  LOOKUP_GROUP,
  OMX_VERSION_ATTR,
  OMX_SHAPE_ATTR,
  HDF5_MAGIC,
} from '../utils/constants.js'
import { logger } from '../utils/logger.js'

// ---------------------------------------------------------------------------
// Public Validation Errors
// ---------------------------------------------------------------------------

export class OMXValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OMXValidationError'
  }
}

// ---------------------------------------------------------------------------
// File-level magic byte validation (before h5wasm touches the file)
// ---------------------------------------------------------------------------

/**
 * Validates that a File is a valid HDF5 file by checking the magic bytes.
 * Reads only the first 8 bytes — extremely fast even for 700 MB files.
 *
 * @param file - The File object from the browser's file picker or drag-drop.
 * @returns    - Resolves to true if magic bytes match, false otherwise.
 */
export async function validateHDF5Magic(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 8)
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < HDF5_MAGIC.length; i++) {
      if (bytes[i] !== HDF5_MAGIC[i]) return false
    }
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// OMX Schema Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Raw attribute value returned by h5wasm — can be various types.
 * We cast carefully before use.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawAttr = any

/**
 * Validates that the h5wasm File object contains the required OMX structure:
 *   - A '/matrices/' group with at least one dataset
 *   - A 'shape' root attribute containing a 2-element integer array
 *
 * @param h5File - The h5wasm File object (already opened).
 * @throws OMXValidationError if validation fails.
 */
export function validateOMXStructure(h5File: {
  keys(): string[]
  get(path: string): { keys(): string[] } | null
  attrs: Record<string, { value: RawAttr }>
}): void {
  // Diagnostic: log top-level keys and attrs so we can see the real structure
  const topLevel = h5File.keys()
  // eslint-disable-next-line no-console
  console.log('[omxParser] top-level keys:', topLevel)
  // eslint-disable-next-line no-console
  console.log('[omxParser] root attrs:', Object.keys(h5File.attrs))

  // 1. Check /matrices/ group exists — try both 'matrices' and '/matrices'
  const matricesKey = topLevel.find(
    (k) => k === MATRICES_GROUP || k === `/${MATRICES_GROUP}` || k.toLowerCase() === 'matrices'
  )
  if (!matricesKey) {
    throw new OMXValidationError(
      'No matrices found. This may not be an OMX file.'
    )
  }

  // 2. Check /matrices/ has at least one dataset
  const matricesGroup = h5File.get(matricesKey)
  // eslint-disable-next-line no-console
  console.log('[omxParser] matrices group:', matricesGroup)
  if (!matricesGroup) {
    throw new OMXValidationError(
      'The /matrices/ group could not be opened.'
    )
  }
  const matricesKeys = matricesGroup.keys()
  // eslint-disable-next-line no-console
  console.log('[omxParser] matrix names:', matricesKeys)
  if (matricesKeys.length === 0) {
    throw new OMXValidationError(
      'The /matrices/ group is empty — no matrix datasets found.'
    )
  }

  // 3. Check 'shape' root attribute — it may be optional in some OMX files
  const shapeAttr = h5File.attrs[OMX_SHAPE_ATTR]
  // eslint-disable-next-line no-console
  console.log('[omxParser] shape attr:', shapeAttr, shapeAttr?.value)
  if (!shapeAttr) {
    // Some OMX files omit the root shape attr — we will infer it from the first matrix
    // Do not throw here; parseOMXFile will handle this case
    return
  }

  // 4. Validate shape is a 2-element array of positive integers
  const shape = normalizeShape(shapeAttr.value)
  if (!shape) {
    throw new OMXValidationError(
      `Root attribute '${OMX_SHAPE_ATTR}' must be a 2-element array of positive integers.`
    )
  }
}

// ---------------------------------------------------------------------------
// Shape Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalises the raw 'shape' attribute value to [number, number].
 * h5wasm may return the shape as an Int32Array, BigInt64Array, number[],
 * or a plain number depending on how the OMX file was written.
 *
 * @param raw - Raw attribute value.
 * @returns   - [nrows, ncols] or null if the value is invalid.
 */
export function normalizeShape(raw: RawAttr): [number, number] | null {
  let arr: number[]

  if (raw instanceof Int32Array || raw instanceof Uint32Array ||
      raw instanceof Float32Array || raw instanceof Float64Array) {
    arr = Array.from(raw)
  } else if (raw instanceof BigInt64Array || raw instanceof BigUint64Array) {
    arr = Array.from(raw).map(Number)
  } else if (Array.isArray(raw)) {
    arr = raw.map(Number)
  } else if (typeof raw === 'number') {
    // Some files store shape as a scalar for square matrices
    arr = [raw, raw]
  } else {
    return null
  }

  if (arr.length < 2) return null
  const [nrows, ncols] = arr
  if (!Number.isInteger(nrows) || !Number.isInteger(ncols)) return null
  if (nrows <= 0 || ncols <= 0) return null

  return [nrows, ncols]
}

// ---------------------------------------------------------------------------
// OMX Version Extraction
// ---------------------------------------------------------------------------

/**
 * Reads the 'omx_version' root attribute.
 * Returns 'unknown' if the attribute is absent (not all OMX files include it).
 *
 * @param attrs - The h5wasm root attrs record.
 * @returns     - Version string e.g. "0.2".
 */
export function extractOMXVersion(
  attrs: Record<string, { value: RawAttr }>
): string {
  const attr = attrs[OMX_VERSION_ATTR]
  if (!attr) return 'unknown'
  const val = attr.value
  if (typeof val === 'string') return val
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0]
  return String(val)
}

// ---------------------------------------------------------------------------
// Matrix Name Enumeration
// ---------------------------------------------------------------------------

/**
 * Returns the names of all datasets under /matrices/.
 * Filters out any subgroups (only datasets are matrix data).
 *
 * @param matricesGroup - h5wasm Group object for the /matrices/ path.
 * @returns             - Array of dataset names.
 */
export function extractMatrixNames(matricesGroup: {
  keys(): string[]
  get(name: string): { type: string } | null
}): string[] {
  const names: string[] = []
  for (const key of matricesGroup.keys()) {
    const item = matricesGroup.get(key)
    // h5wasm items have a 'type' field: 'Dataset' | 'Group'
    if (item && (item as { type: string }).type === 'Dataset') {
      names.push(key)
    } else if (item) {
      // Fallback: include if type is unrecognised (older h5wasm versions)
      logger.warn(`omxParser: /matrices/${key} has unexpected type — including anyway`)
      names.push(key)
    }
  }
  return names
}

// ---------------------------------------------------------------------------
// Lookup Table Extraction
// ---------------------------------------------------------------------------

/**
 * Reads all datasets under /lookup/ and returns them as string arrays.
 * Each lookup is a 1D array of zone labels (strings or integers).
 * If /lookup/ is absent or empty, returns an empty record.
 *
 * @param h5File - The h5wasm File object.
 * @returns      - Record of lookup name → string[].
 */
export function extractLookups(h5File: {
  keys(): string[]
  get(path: string): {
    keys(): string[]
    get(name: string): { value: RawAttr; type: string } | null
    value?: RawAttr
    type?: string
  } | null
}): Record<string, string[]> {
  const lookups: Record<string, string[]> = {}

  if (!h5File.keys().includes(LOOKUP_GROUP)) {
    logger.debug('omxParser: No /lookup/ group found — zone labels unavailable')
    return lookups
  }

  const lookupGroup = h5File.get(LOOKUP_GROUP)
  if (!lookupGroup) return lookups

  for (const key of lookupGroup.keys()) {
    try {
      const dataset = lookupGroup.get(key)
      if (!dataset) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = (dataset as any).value
      if (!raw) continue

      const labels = normalizeLookupValues(raw)
      if (labels.length > 0) {
        lookups[key] = labels
        logger.debug(`omxParser: Loaded lookup '${key}' — ${labels.length} entries`)
      }
    } catch (err) {
      logger.warn(`omxParser: Failed to read lookup '${key}'`, err)
    }
  }

  return lookups
}

// ---------------------------------------------------------------------------
// Lookup Value Normalisation
// ---------------------------------------------------------------------------

/**
 * Converts raw h5wasm dataset values to a string array.
 * Lookup tables can be stored as: string[], Int32Array, Float64Array, etc.
 *
 * @param raw - Raw value from h5wasm dataset.value.
 * @returns   - String array of zone labels.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLookupValues(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v))
  }
  if (raw instanceof Int32Array || raw instanceof Uint32Array ||
      raw instanceof Float32Array || raw instanceof Float64Array) {
    return Array.from(raw).map(String)
  }
  if (raw instanceof BigInt64Array || raw instanceof BigUint64Array) {
    return Array.from(raw).map((v) => String(Number(v)))
  }
  if (typeof raw === 'string') {
    return [raw]
  }
  return []
}

// ---------------------------------------------------------------------------
// Full OMX Parse — assembles a MatrixFile from an open h5wasm file
// ---------------------------------------------------------------------------

/**
 * Parses an already-opened h5wasm File object into a typed MatrixFile.
 * Validates structure, extracts shape, matrix names, and lookups.
 *
 * @param h5File   - The h5wasm File object (must already be open).
 * @param filename - Original filename for display purposes.
 * @returns        - Fully populated MatrixFile object.
 * @throws         - OMXValidationError if the file does not conform to OMX.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOMXFile(h5File: any, filename: string): MatrixFile {
  logger.time('omxParser:parseOMXFile')

  // Step 1: Validate structure
  validateOMXStructure(h5File)

  // Step 2: Extract OMX version
  const omxVersion = extractOMXVersion(h5File.attrs)

  // Step 3: Extract matrix names
  const matricesGroup = h5File.get(MATRICES_GROUP)
  const matrixNames = extractMatrixNames(matricesGroup)

  // Step 4: Extract shape — fall back to inferring from the first matrix
  // if the root 'shape' attribute is absent (some OMX writers omit it)
  let shape: [number, number] | null = null
  const shapeRaw = h5File.attrs[OMX_SHAPE_ATTR]?.value
  if (shapeRaw !== undefined && shapeRaw !== null) {
    shape = normalizeShape(shapeRaw)
  }
  if (!shape) {
    try {
      const firstMatrix = h5File.get(`${MATRICES_GROUP}/${matrixNames[0]}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ds = firstMatrix as any
      if (ds?.shape && Array.isArray(ds.shape) && ds.shape.length >= 2) {
        shape = [Number(ds.shape[0]), Number(ds.shape[1])]
      }
    } catch { /* ignore */ }
  }
  if (!shape) {
    throw new OMXValidationError('Could not determine matrix shape. The file may not be a valid OMX file.')
  }

  if (matrixNames.length === 0) {
    throw new OMXValidationError(
      'No matrices found. This may not be an OMX file.'
    )
  }

  // Step 5: Extract lookups
  const lookups = extractLookups(h5File)

  logger.timeEnd('omxParser:parseOMXFile')
  logger.log(
    `omxParser: Parsed '${filename}' — ${matrixNames.length} matrices, ` +
    `shape ${shape[0]}×${shape[1]}, OMX v${omxVersion}`
  )

  return { filename, shape, omxVersion, matrixNames, lookups }
}

// ---------------------------------------------------------------------------
// Dtype Detection
// ---------------------------------------------------------------------------

/**
 * Maps an h5wasm dtype string to our MatrixTab dtype union.
 * h5wasm reports dtypes like 'float32', 'float64', 'int32', etc.
 *
 * @param h5dtype - Raw dtype string from h5wasm dataset.dtype.
 * @returns       - Normalised dtype for MatrixTab.
 */
export function normalizeDtype(
  h5dtype: string
): 'float32' | 'float64' | 'int32' {
  const lower = h5dtype.toLowerCase()
  if (lower.includes('float64') || lower.includes('f8') || lower.includes('double')) {
    return 'float64'
  }
  if (lower.includes('int32') || lower.includes('i4') || lower.includes('int16') ||
      lower.includes('i2') || lower.includes('uint')) {
    return 'int32'
  }
  // Default: float32 (most common in transportation OMX files)
  return 'float32'
}
