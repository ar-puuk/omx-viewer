<script lang="ts">
  // Component: LoadingOverlay — Full-screen loading spinner with message text.
  // Shown during file open and DuckDB initialisation. Blocks interaction.

  interface Props {
    message?: string
    transparent?: boolean
  }

  const { message = 'Loading…', transparent = false }: Props = $props()
</script>

<div class="overlay" class:transparent role="status" aria-live="polite" aria-label={message}>
  <div class="content animate-slide-up">
    <div class="spinner-ring">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="20" stroke="var(--color-border-strong)" stroke-width="3"/>
        <path
          d="M24 4 A20 20 0 0 1 44 24"
          stroke="var(--color-accent)"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
    </div>
    <p class="message">{message}</p>
    <div class="progress-bar is-indeterminate">
      <div class="progress-bar-fill"></div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(9, 9, 11, 0.88);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fade-in 150ms ease both;
  }

  .overlay.transparent {
    background: transparent;
    backdrop-filter: none;
  }

  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-12) var(--space-16);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    min-width: 240px;
  }

  .spinner-ring {
    width: 48px;
    height: 48px;
    animation: spin 0.9s linear infinite;
  }

  .spinner-ring svg {
    width: 100%;
    height: 100%;
  }

  .message {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    letter-spacing: var(--letter-spacing-wide);
    text-align: center;
  }

  .progress-bar {
    width: 160px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
