<script lang="ts">
  // Component: VirtualGrid — Core 2D virtualized matrix renderer.
  // Uses TanStack Virtual for both row and column virtualization.
  // Lazy-loads row chunks via h5wasmService; caches in MatrixTab LRU.

  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import {
    nrows, ncols, activeTab, activeTabId,
    primaryLookup, pinnedCell,
    pinCell, setPinnedCellValues,
    file
  } from '../../state/matrixStore.svelte.js'
  import { sliceMatrixRows, sliceCellAllMatrices } from '../../services/h5wasmService.js'
  import { formatNumber, getValueClass } from '../../utils/formatNumber.js'
  import { decimalPlaces, compactNotation } from '../../state/matrixStore.svelte.js'
  import {
    ROW_HEIGHT, COL_WIDTH, HEADER_HEIGHT, ROW_HEADER_WIDTH,
    GRID_ROW_OVERSCAN, GRID_COL_OVERSCAN, DEFAULT_ROW_CHUNK_SIZE
  } from '../../utils/constants.js'
  import { logger } from '../../utils/logger.js'

  interface Props {
    /** Called by parent after pinCell() to programmatically scroll to the cell. */
    scrollToCell?: (row: number, col: number) => void
  }

  let { scrollToCell = $bindable() }: Props = $props()

  let scrollContainer = $state<HTMLElement | null>(null)
  let scrollError = $state<string | null>(null)

  // -------------------------------------------------------------------------
  // Virtualizers — created reactively when container is mounted
  // -------------------------------------------------------------------------

  const rowVirtualizer = $derived.by(() => {
    if (!scrollContainer) return null
    return createVirtualizer({
      count: nrows,
      getScrollElement: () => scrollContainer!,
      estimateSize: () => ROW_HEIGHT,
      overscan: GRID_ROW_OVERSCAN,
    })
  })

  const colVirtualizer = $derived.by(() => {
    if (!scrollContainer) return null
    return createVirtualizer({
      count: ncols,
      getScrollElement: () => scrollContainer!,
      estimateSize: () => COL_WIDTH,
      overscan: GRID_COL_OVERSCAN,
      horizontal: true,
    })
  })

  const virtualRows = $derived(rowVirtualizer ? $state(rowVirtualizer).getVirtualItems() : [])
  const virtualCols = $derived(colVirtualizer ? $state(colVirtualizer).getVirtualItems() : [])
  const totalHeight = $derived(rowVirtualizer ? $state(rowVirtualizer).getTotalSize() : 0)
  const totalWidth  = $derived(colVirtualizer ? $state(colVirtualizer).getTotalSize() : 0)

  // -------------------------------------------------------------------------
  // Row data cache — typed array data for visible rows
  // -------------------------------------------------------------------------

  /** Flat data buffer for currently visible rows. Maps rowStart → Float64Array */
  let rowCache = $state(new Map<number, Float64Array>())

  // Fetch visible rows when virtual items change
  $effect(() => {
    if (!activeTab || !activeTabId || virtualRows.length === 0 || ncols === 0) return

    const tab = activeTab
    const colCount = ncols
    const tabId = activeTabId

    // Determine the row range needed
    const firstRow = virtualRows[0].index
    const lastRow  = virtualRows[virtualRows.length - 1].index + 1

    // Chunk-align the fetch
    const chunkSize = DEFAULT_ROW_CHUNK_SIZE
    const chunkStart = Math.floor(firstRow / chunkSize) * chunkSize
    const chunkEnd   = Math.min(Math.ceil(lastRow / chunkSize) * chunkSize, nrows)

    // Check cache first
    if (tab.cachedRows.has(chunkStart)) {
      rowCache = new Map(tab.cachedRows)
      return
    }

    // Fetch from h5wasm (synchronous)
    try {
      if (tab.isEphemeral && tab.ephemeralData) {
        // Ephemeral arithmetic result — data is already in memory
        rowCache = new Map([[0, tab.ephemeralData]])
        return
      }

      const data = sliceMatrixRows(
        tab.id, chunkStart, chunkEnd, colCount, tabId, tab.cachedRows
      )
      rowCache = new Map(tab.cachedRows)
    } catch (err) {
      scrollError = err instanceof Error ? err.message : 'Failed to load matrix data'
      logger.error('VirtualGrid: slice error', err)
    }
  })

  // -------------------------------------------------------------------------
  // Cell value lookup
  // -------------------------------------------------------------------------

  function getCellValue(row: number, col: number): number | null {
    const tab = activeTab
    if (!tab) return null

    // Ephemeral data — full matrix in memory
    if (tab.isEphemeral && tab.ephemeralData) {
      const idx = row * ncols + col
      return tab.ephemeralData[idx] ?? null
    }

    // Find which chunk this row belongs to
    const chunkSize = DEFAULT_ROW_CHUNK_SIZE
    const chunkStart = Math.floor(row / chunkSize) * chunkSize
    const chunk = tab.cachedRows.get(chunkStart)
    if (!chunk) return null

    const localRow = row - chunkStart
    const idx = localRow * ncols + col
    return chunk[idx] ?? null
  }

  // -------------------------------------------------------------------------
  // Cell click — pin cell and trigger cross-matrix read
  // -------------------------------------------------------------------------

  function handleCellClick(row: number, col: number) {
    pinCell(row, col)

    // Cross-matrix read — synchronous sequential slices
    if (file?.matrixNames) {
      try {
        const values = sliceCellAllMatrices(file.matrixNames, row, col)
        setPinnedCellValues(values)
      } catch (err) {
        logger.warn('VirtualGrid: cross-matrix read failed', err)
        setPinnedCellValues({})
      }
    }
  }

  // -------------------------------------------------------------------------
  // Programmatic scroll-to — exposed via bind:scrollToCell prop
  // -------------------------------------------------------------------------

  $effect(() => {
    scrollToCell = (row: number, col: number) => {
      rowVirtualizer?.scrollToIndex(row, { align: 'center' })
      colVirtualizer?.scrollToIndex(col, { align: 'center' })
    }
  })

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function getLabel(index: number): string {
    return primaryLookup ? (primaryLookup[index] ?? String(index)) : String(index)
  }

  function isPinnedRow(row: number): boolean {
    return pinnedCell?.row === row
  }

  function isPinnedCol(col: number): boolean {
    return pinnedCell?.col === col
  }

  function isPinnedCell(row: number, col: number): boolean {
    return pinnedCell?.row === row && pinnedCell?.col === col
  }
</script>

{#if scrollError}
  <div class="grid-error-state" role="alert">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    {scrollError}
  </div>
{:else}
  <div
    bind:this={scrollContainer}
    class="grid-scroll-container"
    role="grid"
    aria-rowcount={nrows}
    aria-colcount={ncols}
    aria-label="Matrix data grid"
  >
    <!-- Sticky column header row -->
    <div
      class="grid-header-row"
      style="width: {totalWidth + ROW_HEADER_WIDTH}px;"
    >
      <!-- Corner cell -->
      <div class="grid-corner-cell" style="width: {ROW_HEADER_WIDTH}px;">
        <span style="font-size: var(--font-size-xs); color: var(--color-text-muted); font-family: var(--font-mono);">
          {nrows}×{ncols}
        </span>
      </div>

      <!-- Column headers — only render virtual columns -->
      {#each virtualCols as vcol (vcol.index)}
        <div
          class="grid-col-header"
          class:is-pinned={isPinnedCol(vcol.index)}
          style="width: {vcol.size}px; transform: translateX({vcol.start}px);"
          role="columnheader"
          aria-colindex={vcol.index + 1}
          title={getLabel(vcol.index)}
        >
          {getLabel(vcol.index)}
        </div>
      {/each}
    </div>

    <!-- Virtualized data area -->
    <div
      class="grid-data-area"
      style="height: {totalHeight}px; width: {totalWidth + ROW_HEADER_WIDTH}px;"
    >
      {#each virtualRows as vrow (vrow.index)}
        <div
          class="grid-row"
          class:is-pinned-row={isPinnedRow(vrow.index)}
          style="transform: translateY({vrow.start}px); width: {totalWidth + ROW_HEADER_WIDTH}px;"
          role="row"
          aria-rowindex={vrow.index + 1}
        >
          <!-- Sticky row header -->
          <div
            class="grid-row-header"
            class:is-pinned={isPinnedRow(vrow.index)}
            style="width: {ROW_HEADER_WIDTH}px;"
            role="rowheader"
            title={getLabel(vrow.index)}
          >
            {getLabel(vrow.index)}
          </div>

          <!-- Data cells -->
          {#each virtualCols as vcol (vcol.index)}
            {@const val = getCellValue(vrow.index, vcol.index)}
            {@const pinned = isPinnedCell(vrow.index, vcol.index)}
            {@const pinnedC = !pinned && isPinnedCol(vcol.index)}
            <div
              class="grid-cell {val !== null ? getValueClass(val) : 'is-loading'}"
              class:is-pinned={pinned}
              class:is-pinned-col={pinnedC}
              class:is-nan={val !== null && !isFinite(val)}
              style="width: {vcol.size}px; min-width: {vcol.size}px; transform: translateX({vcol.start}px);"
              role="gridcell"
              aria-colindex={vcol.index + 1}
              aria-selected={pinned}
              tabindex="-1"
              onclick={() => handleCellClick(vrow.index, vcol.index)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCellClick(vrow.index, vcol.index)
              }}
            >
              {#if val !== null}
                {formatNumber(val, decimalPlaces, compactNotation)}
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
