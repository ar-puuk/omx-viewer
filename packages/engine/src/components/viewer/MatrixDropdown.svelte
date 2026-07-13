<script lang="ts">
  // Component: MatrixDropdown — vscode-theme-only replacement for
  // MatrixTabBar, rendered top-right in ViewerLayout's header. Same
  // Jupyter-kernel-picker-style pattern VS Code itself uses for "pick one
  // of several related things." Only ever rendered under the vscode theme
  // (see ViewerLayout.svelte) — bare codicon markup below, no Icon wrapper
  // needed since there's no web-theme fallback to switch between.
  import { store } from '../../state/matrixStore.svelte.js'

  let isOpen = $state(false)
  let rootEl = $state<HTMLDivElement | null>(null)

  const activeTab = $derived(store.activeTab)

  function toggle() { isOpen = !isOpen }

  function select(tabId: string) {
    store.setActiveTab(tabId)
    isOpen = false
  }

  function handleClose(e: MouseEvent, tabId: string) {
    e.stopPropagation()
    store.closeTab(tabId)
  }

  function handleWindowClick(e: MouseEvent) {
    if (isOpen && rootEl && !rootEl.contains(e.target as Node)) {
      isOpen = false
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') isOpen = false
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeyDown} />

<div class="matrix-dropdown" bind:this={rootEl}>
  <button
    class="trigger"
    onclick={toggle}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
  >
    <span class="trigger-label truncate">{activeTab?.label ?? 'Select matrix'}</span>
    <span class="codicon codicon-chevron-down trigger-chevron" aria-hidden="true"></span>
  </button>

  {#if isOpen}
    <ul class="dropdown-list" role="listbox" aria-label="Matrix tabs">
      {#each store.tabs as tab (tab.id)}
        <li
          role="option"
          aria-selected={tab.id === store.activeTabId}
          class="dropdown-item"
          class:is-active={tab.id === store.activeTabId}
          onclick={() => select(tab.id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') select(tab.id) }}
          tabindex="0"
        >
          {#if tab.isEphemeral}<span class="ephemeral-badge" aria-hidden="true">∿</span>{/if}
          <span class="item-label truncate">{tab.label}</span>
          <button
            class="item-close"
            onclick={(e) => handleClose(e, tab.id)}
            aria-label={`Close ${tab.label}`}
          >
            <span class="codicon codicon-close" aria-hidden="true"></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .matrix-dropdown { position: relative; }
  .trigger {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 26px;
    padding: 0 var(--space-6);
    background: var(--vscode-dropdown-background, var(--color-bg-elevated));
    color: var(--vscode-dropdown-foreground, var(--color-text-primary));
    border: 1px solid var(--vscode-dropdown-border, var(--color-border));
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    cursor: pointer;
    max-width: 220px;
  }
  .trigger:hover { border-color: var(--color-border-strong); }
  .trigger-label { flex: 1; text-align: left; }
  .trigger-chevron { font-size: 12px; flex-shrink: 0; opacity: 0.8; }

  .dropdown-list {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: 0;
    z-index: var(--z-overlay);
    min-width: 220px;
    max-width: 320px;
    max-height: 320px;
    overflow-y: auto;
    background: var(--vscode-dropdown-listBackground, var(--color-bg-elevated));
    border: 1px solid var(--vscode-dropdown-border, var(--color-border));
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    list-style: none;
  }
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .dropdown-item:hover { background: var(--color-cell-hover); color: var(--color-text-primary); }
  .dropdown-item.is-active { background: var(--color-cell-selected); color: var(--color-text-primary); }
  .ephemeral-badge { color: var(--color-accent); flex-shrink: 0; }
  .item-label { flex: 1; }
  .item-close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    opacity: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .dropdown-item:hover .item-close, .dropdown-item.is-active .item-close { opacity: 1; }
  .item-close:hover { background: var(--color-bg-overlay); color: var(--color-text-primary); }
  .item-close .codicon { font-size: 11px; }
</style>
