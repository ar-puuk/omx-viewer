# Workers — Implementation Reference

Files: `math.worker.ts`

---

## Architectural Boundary (CRITICAL)

| Operation | Implementation | Transport |
|---|---|---|
| Aggregations (SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO) | Streaming h5wasm loop, main thread (`duckdbService.ts`) | Synchronous, chunked |
| Element-wise arithmetic (add/sub/mul/div) | `math.worker.ts` | Transferable Float64Array |
| Cross-matrix cell read | Main thread (h5wasm) | Synchronous |

**`duckdb.worker.ts` was removed during the Stage 1 shared-engine refactor** (see `docs/plan.md`) — it was dead code, registered but never invoked by any aggregation or stats path (aggregation already used streaming h5wasm, see `services/CLAUDE.md`). Do not reintroduce a DuckDB worker for dense matrix aggregation or arithmetic; if DuckDB earns a role again it's for the Stage 2 GIS zone attribute table or a bounded per-matrix query, not this path.

**Never send arithmetic to a streaming aggregation loop. Never send aggregations to math.worker.**

---

## math.worker.ts

Minimal implementation — no dependencies:

```ts
self.onmessage = (e) => {
  const { type, id, a, b, op } = e.data
  if (type !== 'math:compute') return

  const result = new Float64Array(a.length)
  switch (op) {
    case 'add':      for (let i = 0; i < a.length; i++) result[i] = a[i] + b[i]; break
    case 'subtract': for (let i = 0; i < a.length; i++) result[i] = a[i] - b[i]; break
    case 'multiply': for (let i = 0; i < a.length; i++) result[i] = a[i] * b[i]; break
    case 'divide':   for (let i = 0; i < a.length; i++) result[i] = b[i] !== 0 ? a[i] / b[i] : NaN; break
  }

  // Transferable — zero copy back to main thread
  self.postMessage({ type: 'math:result', id, result }, [result.buffer])
}
```

**Input buffers `a` and `b` are transferred (detached) — do not use them after postMessage.**
