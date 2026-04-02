<script lang="ts">
  // Component: VirtualGrid — Core 2D virtualized matrix renderer.
  // createVirtualizer returns a Svelte derived store. Subscribe with $ in template.
  // Virtualizers are created imperatively once the scroll container mounts.

  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import type { Readable } from 'svelte/store'
  import { store } from '../../state/matrixStore.svelte.js'
  import { sliceMatrixRows, sliceCellAllMatrices } from '../../services/h5wasmService.js'
  import { formatNumber, getValueClass } from '../../utils/formatNumber.js'
  import {
    ROW_HEIGHT, COL_WIDTH,
    GRID_ROW_OVERSCAN, GRID_COL_OVERSCAN,
    DEFAULT_ROW_CHUNK_SIZE,
  } from '../../utils/constants.js'
  import { logger } from '../../utils/logger.js'

  interface Props {
    scrollToCell?: (row: number, col: number) => void
  }
  let { scrollToCell = $bindable() }: Props = $props()

  let scrollContainer = $state<HTMLElement | null>(null)
  let scrollError = $state<string | null>(null)
  let debounceTimer: ReturnType<typeof setTimeout>

  // Virtualizer stores — created once container is available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rowVirt = $state<Readable<any> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let colVirt = $state<Readable<any> | null>(null)

  // Create virtualizers when the scroll container binds and nrows/ncols are known
  $effect(() => {
    if (!scrollContainer || store.nrows === 0 || store.ncols === 0) return

    rowVirt = createVirtualizer({
      count: store.nrows,
      getScrollElement: () => scrollContainer!,
      estimateSize: () => ROW_HEIGHT,
      overscan: GRID_ROW_OVERSCAN,
    })

    colVirt = createVirtualizer({
      count: store.ncols,
      getScrollElement: () => scrollContainer!,
      estimateSize: () => COL_WIDTH,
      overscan: GRID_COL_OVERSCAN,
      horizontal: true,
    })
  })

  // Expose scrollToCell for CellNavigator
  $effect(() => {
    scrollToCell = (row: number, col: number) => {
      if (rowVirt && colVirt) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        import('svelte/store').then(({ get }: any) => {
          get(rowVirt).scrollToIndex(row, { align: 'center' })
          get(colVirt).scrollToIndex(col, { align: 'center' })
        })
      }
    }
  })

  // Fetch row data with 50ms debounce
  function scheduleRowFetch(firstRow: number) {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const tab = store.activeTab
      if (!tab || store.ncols === 0 || tab.isEphemeral) return

      const chunkSize = DEFAULT_ROW_CHUNK_SIZE
      const chunkStart = Math.floor(firstRow / chunkSize) * chunkSize

      if (tab.cachedRows.has(chunkStart)) {
        store.touchCacheEntry(tab.id, chunkStart)
        return
      }

      try {
        sliceMatrixRows(
          tab.id,
          chunkStart,
          Math.min(chunkStart + chunkSize, store.nrows),
          store.ncols,
          tab.id,
          tab.cachedRows
        )
      } catch (err) {
        scrollError = err instanceof Error ? err.message : 'Failed to load matrix data'
        logger.error('VirtualGrid: slice error', err)
      }
    }, 50)
  }

  function getCellValue(row: number, col: number): number | null {
    const tab = store.activeTab
    if (!tab) return null
    if (tab.isEphemeral && tab.ephemeralData) {
      return tab.ephemeralData[row * store.ncols + col] ?? null
    }
    const chunkStart = Math.floor(row / DEFAULT_ROW_CHUNK_SIZE) * DEFAULT_ROW_CHUNK_SIZE
    const chunk = tab.cachedRows.get(chunkStart)
    if (!chunk) return null
    return chunk[(row - chunkStart) * store.ncols + col] ?? null
  }

  function handleCellClick(row: number, col: number) {
    store.pinCell(row, col)
    if (store.file?.matrixNames) {
      try {
        const values = sliceCellAllMatrices(store.file.matrixNames, row, col)
        store.setPinnedCellValues(values)
      } catch (err) {
        logger.warn('VirtualGrid: cross-matrix read failed', err)
        store.setPinnedCellValues({})
      }
    }
  }

  function getLabel(index: number): string {
    return store.primaryLookup ? (store.primaryLookup[index] ?? String(index)) : String(index)
  }

  const ROW_HEADER_WIDTH = 72
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
    aria-rowcount={store.nrows}
    aria-colcount={store.ncols}
    aria-label="Matrix data grid"
  >
    {#if rowVirt && colVirt}
      <!-- Subscribe to the Svelte stores with $ prefix -->
      {@const rv = $rowVirt}
      {@const cv = $colVirt}
      {@const virtualRows = rv.getVirtualItems()}
      {@const virtualCols = cv.getVirtualItems()}
      {@const totalHeight = rv.getTotalSize()}
      {@const totalWidth  = cv.getTotalSize()}

      <!-- Trigger debounced fetch whenever visible rows change -->
      {#if virtualRows.length > 0}
        {scheduleRowFetch(virtualRows[0].index)}
      {/if}

      <!-- Sticky column header row -->
      <div class="grid-header-row" style="width:{totalWidth + ROW_HEADER_WIDTH}px;">
        <div class="grid-corner-cell" style="width:{ROW_HEADER_WIDTH}px;">
          <span style="font-size:var(--font-size-xs);color:var(--color-text-muted);font-family:var(--font-mono);">
            {store.nrows}×{store.ncols}
          </span>
        </div>
        {#each virtualCols as vcol (vcol.index)}
          <div
            class="grid-col-header"
            class:is-pinned={store.pinnedCell?.col === vcol.index}
            style="width:{vcol.size}px; transform:translateX({vcol.start}px);"
            role="columnheader"
            aria-colindex={vcol.index + 1}
            title={getLabel(vcol.index)}
          >{getLabel(vcol.index)}</div>
        {/each}
      </div>

      <!-- Virtualized data area -->
      <div class="grid-data-area" style="height:{totalHeight}px; width:{totalWidth + ROW_HEADER_WIDTH}px;">
        {#each virtualRows as vrow (vrow.index)}
          <div
            class="grid-row"
            class:is-pinned-row={store.pinnedCell?.row === vrow.index}
            style="transform:translateY({vrow.start}px); width:{totalWidth + ROW_HEADER_WIDTH}px;"
            role="row"
            aria-rowindex={vrow.index + 1}
          >
            <div
              class="grid-row-header"
              class:is-pinned={store.pinnedCell?.row === vrow.index}
              style="width:{ROW_HEADER_WIDTH}px;"
              role="rowheader"
              title={getLabel(vrow.index)}
            >{getLabel(vrow.index)}</div>

            {#each virtualCols as vcol (vcol.index)}
              {@const val = getCellValue(vrow.index, vcol.index)}
              {@const pinned = store.pinnedCell?.row === vrow.index && store.pinnedCell?.col === vcol.index}
              {@const pinnedC = !pinned && store.pinnedCell?.col === vcol.index}
              <div
                class="grid-cell {val !== null ? getValueClass(val) : 'is-loading'}"
                class:is-pinned={pinned}
                class:is-pinned-col={pinnedC}
                style="width:{vcol.size}px; min-width:{vcol.size}px; transform:translateX({vcol.start}px);"
                role="gridcell"
                aria-colindex={vcol.index + 1}
                aria-selected={pinned}
                tabindex="-1"
                onclick={() => handleCellClick(vrow.index, vcol.index)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCellClick(vrow.index, vcol.index) }}
              >
                {#if val !== null}
                  {formatNumber(val, store.decimalPlaces, store.compactNotation)}
                {:else}
                  &nbsp;
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
