/**
 * math.worker.ts — Plain Web Worker for element-wise matrix arithmetic.
 *
 * Receives two Float64Array buffers (transferred as Transferable — zero-copy)
 * and an operator string. Applies the operation in a tight loop and posts the
 * result buffer back (also Transferable — zero-copy return).
 *
 * ARCHITECTURAL NOTE: This worker handles ONLY element-wise arithmetic.
 * All aggregation (SUM, MEAN, MEDIAN, etc.) lives in duckdb.worker.ts.
 * The separation is intentional — Arrow IPC round-trips for a 700 MB matrix
 * would negate DuckDB's advantage for this simple operation.
 *
 * Message protocol:
 *   Main → Worker:
 *     {
 *       type: 'math:compute',
 *       id: string,
 *       a: Float64Array,       // Transferable
 *       b: Float64Array,       // Transferable
 *       op: 'add' | 'subtract' | 'multiply' | 'divide'
 *     }
 *
 *   Worker → Main:
 *     { type: 'math:result', id: string, result: Float64Array }  // Transferable
 *     { type: 'math:error',  id: string, error: string }
 */

type ArithmeticOp = 'add' | 'subtract' | 'multiply' | 'divide'

interface ComputeMessage {
  type: 'math:compute'
  id: string
  a: Float64Array
  b: Float64Array
  op: ArithmeticOp
}

self.onmessage = (event: MessageEvent<ComputeMessage>) => {
  const { type, id, a, b, op } = event.data

  if (type !== 'math:compute') return

  try {
    if (a.length !== b.length) {
      throw new Error(
        `Matrix dimensions mismatch: a has ${a.length} elements, b has ${b.length}`
      )
    }

    const result = new Float64Array(a.length)

    // Tight loop — JIT-optimised. Avoid function call overhead inside.
    switch (op) {
      case 'add':
        for (let i = 0; i < a.length; i++) {
          result[i] = a[i] + b[i]
        }
        break

      case 'subtract':
        for (let i = 0; i < a.length; i++) {
          result[i] = a[i] - b[i]
        }
        break

      case 'multiply':
        for (let i = 0; i < a.length; i++) {
          result[i] = a[i] * b[i]
        }
        break

      case 'divide':
        for (let i = 0; i < a.length; i++) {
          // Protect against division by zero — use NaN (IEEE 754 convention)
          result[i] = b[i] !== 0 ? a[i] / b[i] : NaN
        }
        break

      default:
        throw new Error(`Unknown arithmetic operator: ${op as string}`)
    }

    // Transfer the result buffer — zero-copy, no serialisation overhead
    self.postMessage(
      { type: 'math:result', id, result },
      [result.buffer]
    )
  } catch (err) {
    self.postMessage({
      type: 'math:error',
      id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Satisfy TypeScript's module requirements for worker files
export {}
