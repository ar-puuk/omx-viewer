<script lang="ts">
  // Component: CellNavigator — Row/Col number inputs + Go button.
  // Validates inputs against matrix bounds and emits scroll-to event.

  import {
    navigatorRow, navigatorCol,
    nrows, ncols,
    pinCell
  } from '../../state/matrixStore.svelte.js'

  interface Props {
    onnavigate: (row: number, col: number) => void
  }

  const { onnavigate }: Props = $props()

  let rowError = $state('')
  let colError = $state('')

  function validate(): { row: number; col: number } | null {
    rowError = ''
    colError = ''

    const r = parseInt(navigatorRow, 10)
    const c = parseInt(navigatorCol, 10)

    let valid = true

    if (isNaN(r) || r < 0 || r >= nrows) {
      rowError = `0 – ${nrows - 1}`
      valid = false
    }
    if (isNaN(c) || c < 0 || c >= ncols) {
      colError = `0 – ${ncols - 1}`
      valid = false
    }

    return valid ? { row: r, col: c } : null
  }

  function handleGo() {
    const result = validate()
    if (result) {
      pinCell(result.row, result.col)
      onnavigate(result.row, result.col)
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleGo()
  }
</script>

<div class="navigator" role="group" aria-label="Cell navigator">
  <div class="field" class:has-error={!!rowError}>
    <label class="field-label" for="nav-row">Row</label>
    <input
      id="nav-row"
      type="number"
      class="field-input"
      min="0"
      max={nrows - 1}
      placeholder="0"
      bind:value={navigatorRow}
      onkeydown={handleKeyDown}
      aria-invalid={!!rowError}
      aria-describedby={rowError ? 'nav-row-err' : undefined}
    />
    {#if rowError}
      <span id="nav-row-err" class="field-error">{rowError}</span>
    {/if}
  </div>

  <div class="field" class:has-error={!!colError}>
    <label class="field-label" for="nav-col">Col</label>
    <input
      id="nav-col"
      type="number"
      class="field-input"
      min="0"
      max={ncols - 1}
      placeholder="0"
      bind:value={navigatorCol}
      onkeydown={handleKeyDown}
      aria-invalid={!!colError}
      aria-describedby={colError ? 'nav-col-err' : undefined}
    />
    {#if colError}
      <span id="nav-col-err" class="field-error">{colError}</span>
    {/if}
  </div>

  <button class="go-btn btn btn-primary" onclick={handleGo} aria-label="Navigate to cell">
    Go →
  </button>
</div>

<style>
  .navigator {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    position: relative;
  }

  .field-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    letter-spacing: var(--letter-spacing-wide);
  }

  .field-input {
    width: 72px;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    transition: border-color var(--transition-fast);
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .field-input::-webkit-outer-spin-button,
  .field-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .field-input:focus {
    border-color: var(--color-accent);
    outline: none;
    box-shadow: 0 0 0 2px var(--color-accent-subtle);
  }

  .has-error .field-input {
    border-color: var(--color-negative);
  }

  .field-error {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    font-size: var(--font-size-xs);
    color: var(--color-negative);
    white-space: nowrap;
    font-family: var(--font-mono);
  }

  .go-btn {
    height: 30px;
    font-size: var(--font-size-xs);
    padding: 0 var(--space-6);
    font-family: var(--font-mono);
    letter-spacing: var(--letter-spacing-wide);
  }
</style>
