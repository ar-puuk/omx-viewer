<script lang="ts">
  // Component: VirtualGrid — Core 2D virtualized matrix renderer.
  // createVirtualizer returns a Svelte derived store. Subscribe with $ in template.
  // Virtualizers are created imperatively once the scroll container mounts.

  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import { get } from 'svelte/store'
  import { store } from '../../state/matrixStore.svelte.js'
  import { sliceMatrixRows, sliceCellAllMatrices } from '../../services/h5wasmService.js'
  import { formatNumber, getValueClass } from '../../utils/formatNumber.js'
  import {
    ROW_HEIGHT, COL_WIDTH, HEADER_HEIGHT,
    GRID_ROW_OVERSCAN, GRID_COL_OVERSCAN,
    DEFAULT_ROW_CHUNK_SIZE,
    SCROLL_DEBOUNCE_MS,
  } from '../../utils/constants.js'
  import { logger } from '../../utils/logger.js'

  interface Props {
    scrollToCell?: (row: number, col: number) => void
  }
  let { scrollToCell = $bindable() }: Props = $props()

  let scrollContainer = $state<HTMLElement | null>(null)
  let scrollError = $state<string | null>(null)
  let debounceTimer: ReturnType<typeof setTimeout>

  // Plain variables for virtualizer store references (used by scrollToCell)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rowVirtStore: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let colVirtStore: any = null

  // $state variables for template-consumed data — manually synced via .subscribe()
  // This avoids wrapping Svelte 4-era stores in $state proxies, which breaks
  // the $ auto-subscription in Svelte 5.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let virtualRows = $state<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let virtualCols = $state<any[]>([])
  let totalHeight = $state(0)
  let totalWidth = $state(0)

  // Create virtualizers when the scroll container binds and nrows/ncols are known
  $effect(() => {
    if (!scrollContainer || store.nrows === 0 || store.ncols === 0) return

    const rv = createVirtualizer({
      count: store.nrows,
      getScrollElement: () => scrollContainer!,
      estimateSize: () => ROW_HEIGHT,
      overscan: GRID_ROW_OVERSCAN,
    })

    const cv = createVirtualizer({
      count: store.ncols,
      getScrollElement: () => scrollContainer!,
      estimateSize: () => COL_WIDTH,
      overscan: GRID_COL_OVERSCAN,
      horizontal: true,
    })

    rowVirtStore = rv
    colVirtStore = cv

    // Manual subscriptions — write scroll-driven updates to $state variables
    const unsub1 = rv.subscribe((inst: { getVirtualItems: () => any[]; getTotalSize: () => number }) => {
      virtualRows = inst.getVirtualItems()
      totalHeight = inst.getTotalSize()
    })
    const unsub2 = cv.subscribe((inst: { getVirtualItems: () => any[]; getTotalSize: () => number }) => {
      virtualCols = inst.getVirtualItems()
      totalWidth = inst.getTotalSize()
    })

    // Fetch initial visible chunks once virtualizers are ready.
    // setTimeout escapes the $effect reactive tracking context —
    // fetchVisibleChunks reads store.activeTab (reactive), which would
    // create an infinite loop if called synchronously inside $effect.
    setTimeout(fetchVisibleChunks, 0)

    return () => {
      unsub1()
      unsub2()
      rowVirtStore = null
      colVirtStore = null
    }
  })

  // ---------------------------------------------------------------------------
  // Scroll-driven chunk fetching
  //
  // Uses a direct onscroll handler instead of a Svelte store subscription
  // chain. The previous approach (rowVirt.subscribe → $state → $effect)
  // was unreliable because $state mutations from store subscription callbacks
  // don't always trigger dependent $effect re-runs in Svelte 5.
  //
  // The onscroll handler computes the visible row range from scrollTop and
  // ROW_HEIGHT — no TanStack Virtual dependency for the fetch path.
  // ---------------------------------------------------------------------------

  function handleScroll() {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(fetchVisibleChunks, SCROLL_DEBOUNCE_MS)
  }

  function fetchVisibleChunks() {
    const tab = store.activeTab
    if (!tab || store.ncols === 0 || tab.isEphemeral || !scrollContainer) return

    const scrollTop = scrollContainer.scrollTop
    const viewportHeight = scrollContainer.clientHeight
    const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT))
    const lastRow = Math.min(store.nrows - 1, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT))

    const chunkSize = DEFAULT_ROW_CHUNK_SIZE
    const firstChunk = Math.floor(firstRow / chunkSize) * chunkSize
    const lastChunk = Math.floor(lastRow / chunkSize) * chunkSize

    for (let cs = firstChunk; cs <= lastChunk; cs += chunkSize) {
      if (tab.cachedRows.has(cs)) {
        store.touchCacheEntry(tab.id, cs)
        continue
      }
      try {
        sliceMatrixRows(
          tab.id,
          cs,
          Math.min(cs + chunkSize, store.nrows),
          store.ncols,
          tab.id,
          tab.cachedRows
        )
      } catch (err) {
        scrollError = err instanceof Error ? err.message : 'Failed to load matrix data'
        logger.error('VirtualGrid: slice error', err)
      }
    }
  }

  // Re-fetch when active tab changes (new tab has empty cache)
  $effect(() => {
    void store.activeTabId
    if (scrollContainer && store.nrows > 0) {
      setTimeout(fetchVisibleChunks, 0)
    }
  })

  // Expose scrollToCell for CellNavigator
  $effect(() => {
    scrollToCell = (row: number, col: number) => {
      if (rowVirtStore && colVirtStore && scrollContainer) {
        const rv = get(rowVirtStore)
        const cv = get(colVirtStore)

        // Manually compute offsets that center the cell within the actual
        // visible data area, accounting for sticky headers that TanStack
        // Virtual's built-in 'center' alignment doesn't know about.
        const visibleHeight = scrollContainer.clientHeight - HEADER_HEIGHT
        const rowOffset = row * ROW_HEIGHT - (visibleHeight - ROW_HEIGHT) / 2
        rv.scrollToOffset(Math.max(0, rowOffset))

        const visibleWidth = scrollContainer.clientWidth - ROW_HEADER_WIDTH
        const colOffset = col * COL_WIDTH - (visibleWidth - COL_WIDTH) / 2
        cv.scrollToOffset(Math.max(0, colOffset))

        // Fetch chunks at the new scroll position after scrollTo completes
        setTimeout(fetchVisibleChunks, SCROLL_DEBOUNCE_MS + 16)
      }
    }
  })

  function getCellValue(row: number, col: number): number | null {
    // Reading cacheVersion creates a reactive dependency so Svelte re-renders
    // cells when new chunks arrive. Map.set() is not tracked by Svelte 5's
    // proxy system, so without this the grid never updates after data loads.
    void store.cacheVersion
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
    onscroll={handleScroll}
  >
    {#if virtualRows.length > 0 && virtualCols.length > 0}
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
