<script lang="ts">
  // Component: MetadataPanel — Collapsible sidebar with stats and cross-matrix cell inspector.
  import { store } from '../../state/matrixStore.svelte.js'
  import { formatNumber } from '../../utils/formatNumber.js'
  import { computeMatrixStats } from '../../services/duckdbService.js'
  import { computeBasicStats } from '../../services/h5wasmService.js'
  import { logger } from '../../utils/logger.js'

  interface Stats { min: number; max: number; mean: number }
  let stats = $state<Stats | null>(null)
  let statsLoading = $state(false)

  $effect(() => {
    const tab = store.activeTab
    const f = store.file
    if (!tab || !f) { stats = null; return }
    statsLoading = true; stats = null
    computeMatrixStats(tab.id, f.shape[0], f.shape[1])
      .then((s) => { stats = s; statsLoading = false })
      .catch(() => {
        try { stats = computeBasicStats(tab.id, f.shape[0], f.shape[1]) } catch (err) { logger.warn('MetadataPanel: stats failed', err); stats = null }
        statsLoading = false
      })
  })

  function fmtStat(v: number): string { return isNaN(v) ? '—' : formatNumber(v, store.decimalPlaces) }
</script>

<aside class="sidebar" class:is-collapsed={!store.sidebarOpen} aria-label="Metadata panel" aria-hidden={!store.sidebarOpen}>
  {#if store.sidebarOpen}
    <div class="sidebar-inner animate-fade-in">
      <div class="sidebar-header">
        <span class="sidebar-title">Info</span>
        <button class="btn-icon collapse-btn" onclick={() => store.toggleSidebar()} aria-label="Collapse sidebar">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      {#if store.file}
        <section class="sidebar-section">
          <h3 class="section-title">File</h3>
          <div class="meta-grid">
            <span class="meta-key">Name</span><span class="meta-val truncate" title={store.file.filename}>{store.file.filename}</span>
            <span class="meta-key">Shape</span><span class="meta-val mono">{store.file.shape[0].toLocaleString()} × {store.file.shape[1].toLocaleString()}</span>
            <span class="meta-key">OMX ver</span><span class="meta-val mono">{store.file.omxVersion}</span>
            <span class="meta-key">Matrices</span><span class="meta-val mono">{store.file.matrixNames.length}</span>
          </div>
        </section>
      {/if}

      {#if store.activeTab}
        <section class="sidebar-section">
          <h3 class="section-title">Matrix · {store.activeTab.label}</h3>
          <div class="meta-grid">
            <span class="meta-key">dtype</span><span class="meta-val mono badge">{store.activeTab.dtype}</span>
            {#if statsLoading}
              <span class="meta-key">min</span><span class="meta-val skeleton skeleton-text" style="width:60px;display:inline-block;">&nbsp;</span>
              <span class="meta-key">max</span><span class="meta-val skeleton skeleton-text" style="width:60px;display:inline-block;">&nbsp;</span>
              <span class="meta-key">mean</span><span class="meta-val skeleton skeleton-text" style="width:60px;display:inline-block;">&nbsp;</span>
            {:else if stats}
              <span class="meta-key">min</span><span class="meta-val mono">{fmtStat(stats.min)}</span>
              <span class="meta-key">max</span><span class="meta-val mono">{fmtStat(stats.max)}</span>
              <span class="meta-key">mean</span><span class="meta-val mono">{fmtStat(stats.mean)}</span>
            {/if}
          </div>
        </section>
      {/if}

      {#if store.pinnedCell}
        <section class="sidebar-section cell-section">
          <h3 class="section-title">
            Cell [{store.pinnedCell.row}, {store.pinnedCell.col}]
            {#if store.pinnedCell.isLoading}<div class="spinner" style="width:12px;height:12px;border-width:1.5px;" aria-label="Loading"></div>{/if}
          </h3>
          <div class="matrix-values" role="list">
            {#each store.fileMatrixIds as matrixId (matrixId)}
              {@const value = store.pinnedCell.valuesPerMatrix[matrixId]}
              <!-- Using div + tabindex instead of button with listitem role to satisfy a11y -->
              <div
                class="matrix-value-row"
                role="listitem"
                tabindex="0"
                onclick={() => store.setActiveTab(matrixId)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') store.setActiveTab(matrixId) }}
                title={`Switch to ${matrixId}`}
              >
                <span class="matrix-name truncate">{matrixId}</span>
                <span class="matrix-val mono">{value !== undefined ? formatNumber(value, store.decimalPlaces) : '…'}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if store.file && Object.keys(store.file.lookups).length > 0}
        <section class="sidebar-section">
          <h3 class="section-title">Lookups</h3>
          <div class="meta-grid">
            {#each Object.entries(store.file.lookups) as [name, vals]}
              <span class="meta-key truncate" title={name}>{name}</span>
              <span class="meta-val mono">{vals.length} zones</span>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {:else}
    <button class="expand-btn btn-icon" onclick={() => store.toggleSidebar()} aria-label="Expand sidebar" title="Expand sidebar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  {/if}
</aside>

<style>
  .sidebar { width: var(--sidebar-width); min-width: var(--sidebar-width); background: var(--color-sidebar-bg); border-left: 1px solid var(--color-border); display: flex; flex-direction: column; overflow: hidden; transition: width var(--transition-slow) cubic-bezier(0.16, 1, 0.3, 1), min-width var(--transition-slow) cubic-bezier(0.16, 1, 0.3, 1); flex-shrink: 0; }
  .sidebar.is-collapsed { width: 32px; min-width: 32px; }
  .sidebar-inner { display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; flex: 1; scrollbar-width: thin; scrollbar-color: var(--color-scrollbar-thumb) transparent; }
  .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-8); border-bottom: 1px solid var(--color-border); flex-shrink: 0; position: sticky; top: 0; background: var(--color-sidebar-bg); z-index: var(--z-raised); }
  .sidebar-title { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-text-muted); letter-spacing: var(--letter-spacing-widest); text-transform: uppercase; }
  .collapse-btn { color: var(--color-text-muted); width: 24px; height: 24px; }
  .sidebar-section { padding: var(--space-6) var(--space-8); border-bottom: 1px solid var(--color-border); }
  .section-title { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-text-muted); letter-spacing: var(--letter-spacing-wider); text-transform: uppercase; margin-bottom: var(--space-6); display: flex; align-items: center; gap: var(--space-4); }
  .meta-grid { display: grid; grid-template-columns: auto 1fr; gap: var(--space-2) var(--space-6); align-items: baseline; }
  .meta-key { font-size: var(--font-size-xs); color: var(--color-text-muted); font-family: var(--font-mono); white-space: nowrap; }
  .meta-val { font-size: var(--font-size-xs); color: var(--color-text-primary); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cell-section .section-title { color: var(--color-accent); }
  .matrix-values { display: flex; flex-direction: column; gap: var(--space-1); }
  .matrix-value-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); cursor: pointer; width: 100%; transition: background-color var(--transition-fast); gap: var(--space-4); }
  .matrix-value-row:hover { background: var(--color-bg-elevated); }
  .matrix-name { font-size: var(--font-size-xs); color: var(--color-text-secondary); font-family: var(--font-mono); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .matrix-val { font-size: var(--font-size-xs); color: var(--color-text-primary); font-family: var(--font-mono); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .expand-btn { width: 32px; height: 48px; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); border-radius: 0; }
</style>
