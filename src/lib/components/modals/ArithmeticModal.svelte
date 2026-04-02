<script lang="ts">
  // Component: ArithmeticModal — Matrix A op B arithmetic.
  import { store } from '../../state/matrixStore.svelte.js'
  import { ARITHMETIC_OPS, ARITHMETIC_OP_SYMBOLS, ARITHMETIC_OP_LABELS } from '../../utils/constants.js'
  import { sliceFullMatrix } from '../../services/h5wasmService.js'
  import { computeArithmetic } from '../../services/duckdbService.js'
  import type { ArithmeticOp } from '../../utils/constants.js'
  import { logger } from '../../utils/logger.js'

  interface Props { onclose: () => void }
  const { onclose }: Props = $props()

  // Derive from store so we always have the latest matrix list
  const matrixNames = $derived(store.fileMatrixIds)
  let matrixA = $state('')
  let matrixB = $state('')
  let op = $state<ArithmeticOp>('subtract')
  let isComputing = $state(false)

  // Initialise selections when matrixNames becomes available
  $effect(() => {
    if (matrixNames.length > 0 && !matrixA) matrixA = matrixNames[0]
    if (matrixNames.length > 1 && !matrixB) matrixB = matrixNames[1]
    else if (matrixNames.length > 0 && !matrixB) matrixB = matrixNames[0]
  })

  const canCompute = $derived(!!matrixA && !!matrixB && !isComputing && !!store.file)
  const resultLabel = $derived(`${matrixA} ${ARITHMETIC_OP_SYMBOLS[op]} ${matrixB}`)

  async function handleCompute() {
    const f = store.file
    if (!f || !canCompute) return
    isComputing = true
    try {
      const [nrows, ncols] = f.shape
      const dataA = sliceFullMatrix(matrixA, nrows, ncols)
      const dataB = sliceFullMatrix(matrixB, nrows, ncols)
      const result = await computeArithmetic(dataA, dataB, op)
      store.addEphemeralTab(resultLabel, result)
      onclose()
    } catch (err) {
      store.addError(err instanceof Error ? err.message : 'Arithmetic failed', 'error', true)
      logger.error('ArithmeticModal: compute failed', err)
    } finally { isComputing = false }
  }

  function handleKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onclose() }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="backdrop animate-fade-in"
  role="dialog"
  aria-modal="true"
  aria-label="Matrix arithmetic"
  tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) onclose() }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose() }}
>
  <div class="modal animate-slide-up" role="document">
    <div class="modal-header">
      <h2 class="modal-title">Matrix Arithmetic</h2>
      <button class="btn-icon" onclick={onclose} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <p class="modal-desc">Compute element-wise arithmetic between two matrices. Result appears as a new temporary tab.</p>
      <div class="form-group">
        <label class="form-label" for="matrix-a">Matrix A</label>
        <select id="matrix-a" class="form-select" bind:value={matrixA}>
          {#each matrixNames as name}<option value={name}>{name}</option>{/each}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Operation</label>
        <div class="op-pills" role="group" aria-label="Operation">
          {#each ARITHMETIC_OPS as o}
            <button class="op-pill" class:is-active={op === o} onclick={() => { op = o }} aria-pressed={op === o} title={ARITHMETIC_OP_LABELS[o]}>{ARITHMETIC_OP_SYMBOLS[o]}</button>
          {/each}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="matrix-b">Matrix B</label>
        <select id="matrix-b" class="form-select" bind:value={matrixB}>
          {#each matrixNames as name}<option value={name}>{name}</option>{/each}
        </select>
      </div>
      <div class="result-preview" aria-live="polite">
        <span class="preview-label">Result tab:</span>
        <span class="preview-name mono">{resultLabel}</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={onclose}>Cancel</button>
      <button class="btn btn-primary" onclick={handleCompute} disabled={!canCompute} aria-busy={isComputing}>
        {#if isComputing}<div class="spinner" aria-hidden="true"></div>Computing…{:else}Compute{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: var(--z-modal); background: var(--color-modal-overlay); display: flex; align-items: center; justify-content: center; padding: var(--space-8); backdrop-filter: blur(4px); }
  .modal { background: var(--color-bg-surface); border: 1px solid var(--color-border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); width: 100%; max-width: 440px; display: flex; flex-direction: column; overflow: hidden; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-8) var(--space-10); border-bottom: 1px solid var(--color-border); }
  .modal-title { font-family: var(--font-mono); font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); color: var(--color-text-primary); }
  .modal-body { padding: var(--space-10); display: flex; flex-direction: column; gap: var(--space-10); }
  .modal-desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: var(--line-height-relaxed); }
  .form-group { display: flex; flex-direction: column; gap: var(--space-3); }
  .form-label { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-text-muted); letter-spacing: var(--letter-spacing-wide); }
  .form-select { font-family: var(--font-mono); font-size: var(--font-size-sm); background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary); padding: var(--space-3) var(--space-6); width: 100%; cursor: pointer; }
  .form-select:focus { border-color: var(--color-accent); outline: none; }
  .op-pills { display: flex; gap: var(--space-3); }
  .op-pill { flex: 1; height: 40px; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: var(--font-size-xl); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted); background: var(--color-bg-elevated); cursor: pointer; transition: background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast); }
  .op-pill:hover { border-color: var(--color-border-strong); color: var(--color-text-primary); }
  .op-pill.is-active { background: var(--color-accent-subtle); color: var(--color-accent); border-color: var(--color-accent); }
  .result-preview { display: flex; align-items: center; gap: var(--space-6); padding: var(--space-6); background: var(--color-bg-elevated); border-radius: var(--radius-md); border: 1px solid var(--color-border); }
  .preview-label { font-size: var(--font-size-xs); color: var(--color-text-muted); font-family: var(--font-mono); white-space: nowrap; }
  .preview-name { font-size: var(--font-size-sm); color: var(--color-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .modal-footer { display: flex; justify-content: flex-end; gap: var(--space-6); padding: var(--space-8) var(--space-10); border-top: 1px solid var(--color-border); }
</style>
