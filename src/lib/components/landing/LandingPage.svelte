<script lang="ts">
  // Component: LandingPage — Hero, file drop zone, how-it-works steps, footer.
  // Shown before any file is loaded.

  import FileDropZone from './FileDropZone.svelte'

  interface Props {
    onfile: (file: File) => void
    isLoading?: boolean
  }

  const { onfile, isLoading = false }: Props = $props()
</script>

<main class="landing">
  <!-- Background grid texture -->
  <div class="bg-grid" aria-hidden="true"></div>

  <div class="landing-content">
    <!-- Logo / wordmark -->
    <header class="landing-header">
      <div class="logo" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="1" y="1" width="13" height="13" rx="2" stroke="var(--color-accent)" stroke-width="1.5"/>
          <rect x="18" y="1" width="13" height="13" rx="2" stroke="var(--color-accent)" stroke-width="1.5"/>
          <rect x="1" y="18" width="13" height="13" rx="2" stroke="var(--color-accent)" stroke-width="1.5"/>
          <rect x="18" y="18" width="13" height="13" rx="2" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="1.5"/>
        </svg>
      </div>
      <span class="wordmark">OMX Viewer</span>
    </header>

    <!-- Hero headline -->
    <section class="hero">
      <h1 class="headline">
        Explore OMX matrices<br/>
        <span class="headline-accent">in your browser.</span>
      </h1>
      <p class="subheadline">
        Browser-native HDF5 matrix explorer. No upload, no server, no limits.
        All processing happens locally — your data never leaves your machine.
      </p>
    </section>

    <!-- Drop zone -->
    <section class="dropzone-section" aria-label="File upload">
      <FileDropZone {onfile} disabled={isLoading} />
    </section>

    <!-- How it works -->
    <section class="steps" aria-label="How it works">
      <div class="step">
        <div class="step-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 13V7M7 10l3-3 3 3" stroke="var(--color-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="1" y="1" width="18" height="18" rx="4" stroke="var(--color-border-strong)" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="step-text">
          <strong>1. Upload</strong>
          <span>Drop your .omx or .h5 file — up to 700 MB</span>
        </div>
      </div>

      <div class="step-divider" aria-hidden="true">→</div>

      <div class="step">
        <div class="step-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h10M3 15h7" stroke="var(--color-accent)" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="step-text">
          <strong>2. Parse</strong>
          <span>WebAssembly reads structure instantly</span>
        </div>
      </div>

      <div class="step-divider" aria-hidden="true">→</div>

      <div class="step">
        <div class="step-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="var(--color-accent)" stroke-width="1.5"/>
            <rect x="11" y="1" width="8" height="8" rx="1.5" stroke="var(--color-accent)" stroke-width="1.5"/>
            <rect x="1" y="11" width="8" height="8" rx="1.5" stroke="var(--color-accent)" stroke-width="1.5"/>
            <rect x="11" y="11" width="8" height="8" rx="1.5" fill="var(--color-accent-subtle)" stroke="var(--color-accent)" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="step-text">
          <strong>3. Explore</strong>
          <span>Scroll, aggregate, compare, export</span>
        </div>
      </div>
    </section>

    <!-- Privacy footer -->
    <footer class="privacy-note" role="note">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 1L2 3v4c0 2.76 2.13 5.35 5 6 2.87-.65 5-3.24 5-6V3L7 1z"
          stroke="var(--color-text-muted)" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
      All processing happens locally. Your data never leaves your browser.
    </footer>
  </div>
</main>

<style>
  .landing {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--color-landing-bg);
    overflow: hidden;
  }

  /* Subtle grid background texture */
  .bg-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--color-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-border) 1px, transparent 1px);
    background-size: 48px 48px;
    opacity: 0.25;
    pointer-events: none;
  }

  .landing-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-16);
    padding: var(--space-24) var(--space-12);
    max-width: 640px;
    width: 100%;
    text-align: center;
  }

  /* Header / logo */
  .landing-header {
    display: flex;
    align-items: center;
    gap: var(--space-6);
  }

  .wordmark {
    font-family: var(--font-mono);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    letter-spacing: var(--letter-spacing-wider);
    text-transform: uppercase;
  }

  /* Hero */
  .hero {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .headline {
    font-family: var(--font-mono);
    font-size: clamp(28px, 5vw, 40px);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    line-height: var(--line-height-tight);
    letter-spacing: var(--letter-spacing-tight);
  }

  .headline-accent {
    color: var(--color-accent);
  }

  .subheadline {
    font-family: var(--font-sans);
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    line-height: var(--line-height-relaxed);
    max-width: 480px;
  }

  /* Drop zone section */
  .dropzone-section {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  /* How it works steps */
  .steps {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    flex-wrap: wrap;
    justify-content: center;
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-6) var(--space-8);
    min-width: 160px;
  }

  .step-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-text {
    display: flex;
    flex-direction: column;
    text-align: left;
    gap: var(--space-1);
  }

  .step-text strong {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .step-text span {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .step-divider {
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    font-size: var(--font-size-lg);
  }

  /* Privacy note */
  .privacy-note {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
  }
</style>
