<script lang="ts">
  // Component: ThemeToggle — Dark/light theme toggle button.
  import { store } from '../../state/matrixStore.svelte.js'
</script>

<button
  class="toggle btn-icon"
  onclick={() => store.toggleTheme()}
  aria-label={store.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
  title={store.theme === 'dark' ? 'Light mode' : 'Dark mode'}
>
  {#if store.theme === 'dark'}
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  {:else}
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 108 8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  {/if}
</button>

<style>
  .toggle { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); border-radius: var(--radius-md); transition: background-color var(--transition-fast), color var(--transition-fast); }
  .toggle:hover { background: var(--color-bg-elevated); color: var(--color-text-primary); }
</style>
