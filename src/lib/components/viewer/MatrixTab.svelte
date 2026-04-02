<script lang="ts">
  // Component: MatrixTab — Individual tab button in the tab bar.

  import { activeTabId } from '../../state/matrixStore.svelte.js'
  import { setActiveTab, closeTab } from '../../state/matrixStore.svelte.js'
  import type { MatrixTab as Tab } from '../../state/matrixStore.svelte.js'

  interface Props {
    tab: Tab
  }

  const { tab }: Props = $props()

  const isActive = $derived(activeTabId === tab.id)

  function handleClose(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation()
    closeTab(tab.id)
  }
</script>

<div
  class="tab"
  class:is-active={isActive}
  class:is-ephemeral={tab.isEphemeral}
  role="tab"
  aria-selected={isActive}
  tabindex={isActive ? 0 : -1}
  onclick={() => setActiveTab(tab.id)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab(tab.id) }}
>
  {#if tab.isEphemeral}
    <span class="ephemeral-badge" aria-hidden="true">∿</span>
  {/if}
  <span class="tab-label" title={tab.label}>{tab.label}</span>
  <button
    class="close-btn"
    onclick={handleClose}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClose(e) }}
    aria-label={`Close ${tab.label}`}
    tabindex="-1"
  >
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
</div>

<style>
  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 100%;
    padding: 0 var(--space-6);
    border-right: 1px solid var(--color-border);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    color: var(--color-text-muted);
    position: relative;
    user-select: none;
    min-width: 80px;
    max-width: 200px;
  }

  .tab:hover {
    background: var(--color-tab-hover-bg);
    color: var(--color-text-secondary);
  }

  .tab.is-active {
    background: var(--color-tab-active-bg);
    color: var(--color-text-primary);
    border-bottom: 2px solid var(--color-accent);
  }

  .tab.is-active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--color-tab-active-bg);
  }

  .tab.is-ephemeral {
    font-style: italic;
  }

  .ephemeral-badge {
    color: var(--color-accent);
    font-size: var(--font-size-xs);
    flex-shrink: 0;
  }

  .tab-label {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    letter-spacing: var(--letter-spacing-tight);
  }

  .close-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    opacity: 0;
    transition: opacity var(--transition-fast), background-color var(--transition-fast);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
  }

  .tab:hover .close-btn,
  .tab.is-active .close-btn {
    opacity: 1;
  }

  .close-btn:hover {
    background: var(--color-bg-overlay);
    color: var(--color-text-primary);
  }
</style>
