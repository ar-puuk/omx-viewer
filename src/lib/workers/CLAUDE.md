# Workers — Implementation Reference

Files: `duckdb.worker.ts`, `math.worker.ts`

---

## Architectural Boundary (CRITICAL)

| Operation | Worker | Transport |
|---|---|---|
| Aggregations (SUM/MIN/MAX/MEAN/MEDIAN/STDDEV/COUNT_NONZERO) | `duckdb.worker.ts` | Arrow IPC |
| Element-wise arithmetic (add/sub/mul/div) | `math.worker.ts` | Transferable Float64Array |
| Cross-matrix cell read | Main thread (h5wasm) | Synchronous |

**Never send arithmetic to DuckDB. Never send aggregations to math.worker.**

---

## duckdb.worker.ts

### Initialisation
```ts
import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'

// MVP bundle = single-threaded, no SharedArrayBuffer required
const MANUAL_BUNDLES = { mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker } }
const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
db = new duckdb.AsyncDuckDB(logger, new Worker(bundle.mainWorker))
await db.instantiate(bundle.mainModule)
conn = await db.connect()
```

### Arrow IPC batch registration
```ts
// First batch: DROP existing table, CREATE from IPC
await db.registerFileBuffer(`${viewName}.arrow`, ipc)
await conn.query(`CREATE TABLE "${tableName}" AS SELECT * FROM read_ipc_file('${viewName}.arrow')`)

// Subsequent batches: INSERT
await conn.query(`INSERT INTO "${tableName}" SELECT * FROM read_ipc_file('${viewName}.arrow')`)
```

### Dynamic SQL generation — all 28 combinations

**Aggregation function mapping:**
```ts
// DuckDB native functions:
sum           → SUM(expr)
min           → MIN(expr)
max           → MAX(expr)
mean          → AVG(expr)
median        → MEDIAN(expr)
stddev        → STDDEV_POP(expr)
count_nonzero → COUNT(expr) FILTER (WHERE expr != 0)
```

**By Row, single matrix:**
```sql
SELECT CAST(_row AS INTEGER) AS idx,
       (SUM(c0) + SUM(c1) + ... + SUM(cN)) AS value
FROM "TAZ_AUTO"
GROUP BY _row ORDER BY idx
```

**By Row, all matrices (multi-column JOIN):**
```sql
SELECT CAST("TAZ_AUTO"._row AS INTEGER) AS idx,
       (SUM("TAZ_AUTO".c0) + ...) AS "TAZ_AUTO",
       (SUM("TAZ_TRANSIT".c0) + ...) AS "TAZ_TRANSIT"
FROM "TAZ_AUTO"
JOIN "TAZ_TRANSIT" ON "TAZ_AUTO"._row = "TAZ_TRANSIT"._row
GROUP BY "TAZ_AUTO"._row ORDER BY idx
```

**By Column, single matrix:**
```sql
-- One UNION per column index:
SELECT 0 AS idx, SUM(c0) AS value FROM "TAZ_AUTO"
UNION ALL
SELECT 1 AS idx, SUM(c1) AS value FROM "TAZ_AUTO"
...
ORDER BY idx
```

**Arrow columns:** The Arrow table has columns `_row`, `c0`, `c1`, ..., `c{ncols-1}`.
`_row` contains the absolute row index (0-based) for GROUP BY.

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
