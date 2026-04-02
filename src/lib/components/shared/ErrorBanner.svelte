<script lang="ts">
  // Component: ErrorBanner — Dismissible error/warning display banner.
  import { store } from '../../state/matrixStore.svelte.js'
</script>

{#if store.errors.length > 0}
  <div class="banner-stack" role="alert" aria-live="assertive">
    {#each store.errors as err (err.id)}
      <div class="banner" class:is-warning={err.type === 'warning'} class:is-error={err.type === 'error'}>
        <span class="icon" aria-hidden="true">{#if err.type === 'warning'}⚠{:else}✕{/if}</span>
        <span class="message">{err.message}</span>
        {#if err.dismissible}
          <button class="dismiss btn-icon" onclick={() => store.dismissError(err.id)} aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .banner-stack {
    position: fixed;
    top: var(--space-8);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 320px;
    max-width: 600px;
    width: max-content;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-4) var(--space-8);
    border-radius: var(--radius-md);
    border: 1px solid;
    box-shadow: var(--shadow-lg);
    font-size: var(--font-size-sm);
    animation: slide-down 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
    backdrop-filter: blur(8px);
  }
  .banner.is-error { background: var(--color-error-bg); border-color: var(--color-error-border); color: var(--color-error-text); }
  .banner.is-warning { background: var(--color-warning-bg); border-color: var(--color-warning-border); color: var(--color-warning); }
  .icon { font-size: var(--font-size-md); flex-shrink: 0; }
  .message { flex: 1; font-family: var(--font-sans); line-height: var(--line-height-normal); }
  .dismiss { flex-shrink: 0; color: inherit; opacity: 0.6; padding: var(--space-1); }
  .dismiss:hover { opacity: 1; background: rgba(255,255,255,0.1); }
  @keyframes slide-down { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
</style>
