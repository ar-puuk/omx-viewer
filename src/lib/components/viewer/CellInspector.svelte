<script lang="ts">
  // Component: CellInspector — Popover on cell click showing row/col/label/value.
  import { store } from '../../state/matrixStore.svelte.js'
  import { formatNumber } from '../../utils/formatNumber.js'

  interface Props { anchorX?: number; anchorY?: number }
  const { anchorX = 0, anchorY = 0 }: Props = $props()

  const cell = $derived(store.pinnedCell)
  const lookup = $derived(store.primaryLookup)
  const rowLabel = $derived(lookup && cell ? (lookup[cell.row] ?? null) : null)
  const colLabel = $derived(lookup && cell ? (lookup[cell.col] ?? null) : null)
  const rawValue = $derived(() => {
    if (!cell) return null
    const vals = Object.values(cell.valuesPerMatrix)
    return vals.length > 0 ? vals[0] : null
  })
</script>

{#if cell}
  <div class="inspector animate-scale-in" style="left: {anchorX}px; top: {anchorY}px" role="tooltip">
    <div class="inspector-header">
      <span class="label">Cell Inspector</span>
      <button class="close btn-icon" onclick={() => store.clearPinnedCell()} aria-label="Close inspector">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="inspector-body">
      <div class="row-entry"><span class="key">Row</span><span class="val mono">{cell.row}</span>{#if rowLabel}<span class="zone-label">{rowLabel}</span>{/if}</div>
      <div class="row-entry"><span class="key">Col</span><span class="val mono">{cell.col}</span>{#if colLabel}<span class="zone-label">{colLabel}</span>{/if}</div>
      {#if rawValue() !== null}
        <div class="row-entry value-row">
          <span class="key">Value</span>
          <span class="val mono value-display">{formatNumber(rawValue()!, store.decimalPlaces)}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .inspector { position: absolute; z-index: var(--z-overlay); background: var(--color-bg-overlay); border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); min-width: 180px; max-width: 240px; font-size: var(--font-size-sm); transform-origin: top left; pointer-events: auto; }
  .inspector-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-6); border-bottom: 1px solid var(--color-border); }
  .label { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-text-muted); letter-spacing: var(--letter-spacing-wider); text-transform: uppercase; }
  .close { color: var(--color-text-muted); width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
  .inspector-body { padding: var(--space-4) var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); }
  .row-entry { display: flex; align-items: center; gap: var(--space-4); }
  .key { font-size: var(--font-size-xs); color: var(--color-text-muted); font-family: var(--font-mono); width: 36px; flex-shrink: 0; }
  .val { font-family: var(--font-mono); color: var(--color-text-primary); font-variant-numeric: tabular-nums; }
  .zone-label { font-size: var(--font-size-xs); color: var(--color-text-secondary); overflow: hidden; white-space: nowrap; max-width: 100px; text-overflow: ellipsis; }
  .value-row { padding-top: var(--space-3); border-top: 1px solid var(--color-border); margin-top: var(--space-1); }
  .value-display { color: var(--color-accent); font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); }
</style>
