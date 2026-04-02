<script lang="ts">
  // Component: GridToolbar — Decimal toggle, CellNavigator, Arithmetic, Summary, CSV export.

  import CellNavigator from './CellNavigator.svelte'
  import {
    decimalPlaces, compactNotation, activeTab, file,
    setDecimalPlaces, toggleCompactNotation,
    toggleSummaryPanel, summaryPanelOpen
  } from '../../state/matrixStore.svelte.js'
  import { DECIMAL_OPTIONS } from '../../utils/constants.js'
  import { matrixSliceToCSV, downloadTextFile } from '../../utils/formatNumber.js'
  import { sliceMatrixRows } from '../../services/h5wasmService.js'
  import { logger } from '../../utils/logger.js'

  interface Props {
    onnavigate: (row: number, col: number) => void
    onopenarithmetic: () => void
  }

  const { onnavigate, onopenarithmetic }: Props = $props()

  let isExporting = $state(false)

  async function handleExportCSV() {
    const tab = activeTab
    const f = file
    if (!tab || !f || isExporting) return
    isExporting = true

    try {
      const [nrows, ncols] = f.shape
      const lookup = Object.values(f.lookups)[0] ?? null

      // Export visible slice only — first 500 rows to keep CSV manageable
      const sliceRows = Math.min(nrows, 500)
      const data = sliceMatrixRows(tab.id, 0, sliceRows, ncols, tab.id, tab.cachedRows)
      const csv = matrixSliceToCSV(data, sliceRows, ncols, 0, lookup, lookup, decimalPlaces)
      downloadTextFile(csv, `${tab.id}_export.csv`)
    } catch (err) {
      logger.error('GridToolbar: CSV export failed', err)
    } finally {
      isExporting = false
    }
  }
</script>

<div class="toolbar" role="toolbar" aria-label="Grid controls">
  <!-- Left: decimal selector -->
  <div class="toolbar-group">
    <span class="group-label">Decimals</span>
    <div class="decimal-pills" role="group" aria-label="Decimal places">
      {#each DECIMAL_OPTIONS as d}
        <button
          class="pill"
          class:is-active={decimalPlaces === d}
          onclick={() => setDecimalPlaces(d)}
          aria-pressed={decimalPlaces === d}
          aria-label={`${d} decimal places`}
        >{d}</button>
      {/each}
    </div>
  </div>

  <div class="divider-v" aria-hidden="true"></div>

  <!-- Compact notation toggle -->
  <button
    class="compact-btn btn btn-ghost"
    class:is-active={compactNotation}
    onclick={toggleCompactNotation}
    aria-pressed={compactNotation}
    title="Toggle compact notation (1.2M, 3.4B)"
  >
    1.2M
  </button>

  <div class="divider-v" aria-hidden="true"></div>

  <!-- Cell Navigator -->
  <CellNavigator {onnavigate} />

  <div class="divider-v" aria-hidden="true"></div>

  <!-- Right actions -->
  <div class="toolbar-actions">
    <button
      class="btn btn-ghost"
      onclick={onopenarithmetic}
      title="Matrix arithmetic (A op B)"
      disabled={!file || (file?.matrixNames.length ?? 0) < 2}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 7h10M7 2v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Arithmetic
    </button>

    <button
      class="btn btn-ghost"
      class:is-active={summaryPanelOpen}
      onclick={toggleSummaryPanel}
      title="Aggregation summary table"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M1 3h12M1 7h8M1 11h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Summary
    </button>

    <button
      class="btn btn-ghost"
      onclick={handleExportCSV}
      disabled={!activeTab || isExporting}
      title="Export visible rows to CSV"
    >
      {#if isExporting}
        <div class="spinner" aria-hidden="true"></div>
      {:else}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
      CSV
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    height: var(--toolbar-height);
    padding: 0 var(--space-8);
    background: var(--color-toolbar-bg);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .toolbar::-webkit-scrollbar { display: none; }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .group-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    letter-spacing: var(--letter-spacing-wide);
    white-space: nowrap;
  }

  .decimal-pills {
    display: flex;
    gap: var(--space-1);
  }

  .pill {
    width: 28px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    background: transparent;
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .pill:hover { background: var(--color-bg-elevated); color: var(--color-text-primary); }
  .pill.is-active {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  .compact-btn {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-4);
    height: 26px;
  }

  .compact-btn.is-active {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  .divider-v {
    width: 1px;
    height: 20px;
    background: var(--color-border);
    flex-shrink: 0;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-left: auto;
  }

  .toolbar-actions .btn {
    height: 28px;
    font-size: var(--font-size-xs);
    padding: 0 var(--space-6);
    gap: var(--space-3);
  }

  .toolbar-actions .btn.is-active {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
</style>
