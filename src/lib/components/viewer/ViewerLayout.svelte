<script lang="ts">
  // Component: ViewerLayout — Master layout after a file is loaded.
  import MatrixTabBar from './MatrixTabBar.svelte'
  import GridToolbar from './GridToolbar.svelte'
  import VirtualGrid from './VirtualGrid.svelte'
  import MetadataPanel from '../modals/MetadataPanel.svelte'
  import SummaryPanel from '../modals/SummaryPanel.svelte'
  import ArithmeticModal from '../modals/ArithmeticModal.svelte'
  import ThemeToggle from '../shared/ThemeToggle.svelte'
  import { store } from '../../state/matrixStore.svelte.js'
  import { closeCurrentFile } from '../../services/h5wasmService.js'

  let scrollToCell = $state<((row: number, col: number) => void) | undefined>(undefined)
  let showArithmeticModal = $state(false)

  function handleNavigate(row: number, col: number) { scrollToCell?.(row, col) }

  function handleNewFile() { closeCurrentFile(); store.resetState() }
</script>

<div class="viewer-root">
  <!-- Header Bar -->
  <header class="app-header">
    <div class="header-left">
      <div class="logo-mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="var(--color-accent)" stroke-width="1.5"/>
          <rect x="12" y="1" width="9" height="9" rx="1.5" stroke="var(--color-accent)" stroke-width="1.5"/>
          <rect x="1" y="12" width="9" height="9" rx="1.5" stroke="var(--color-accent)" stroke-width="1.5"/>
          <rect x="12" y="12" width="9" height="9" rx="1.5" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="1.5"/>
        </svg>
      </div>
      <span class="app-name">OMX Viewer</span>
      {#if store.file}
        <div class="divider-v" aria-hidden="true"></div>
        <span class="filename truncate" title={store.file.filename}>{store.file.filename}</span>
        <span class="shape-badge badge">{store.file.shape[0].toLocaleString()}×{store.file.shape[1].toLocaleString()}</span>
      {/if}
    </div>
    <div class="header-right">
      <button class="btn btn-ghost new-file-btn" onclick={handleNewFile} title="Open a different file">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M1.5 6.5h10M6.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        New file
      </button>
      <ThemeToggle />
    </div>
  </header>

  <!-- Tab Bar -->
  <MatrixTabBar />

  <!-- Main content -->
  <div class="main-area">
    <div class="grid-column">
      <GridToolbar onnavigate={handleNavigate} onopenarithmetic={() => { showArithmeticModal = true }} />
      <div class="grid-wrapper" style="flex: 1; overflow: hidden;">
        {#if store.hasFile}
          <VirtualGrid bind:scrollToCell />
        {:else}
          <div class="grid-empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="44" height="44" rx="6" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>
              <path d="M16 24h16M24 16v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>No matrix selected</p>
          </div>
        {/if}
      </div>
      <SummaryPanel />
    </div>
    <MetadataPanel />
  </div>

  {#if showArithmeticModal}
    <ArithmeticModal onclose={() => { showArithmeticModal = false }} />
  {/if}
</div>

<style>
  .viewer-root { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; background: var(--color-bg-base); }
  .app-header { display: flex; align-items: center; justify-content: space-between; height: var(--header-height); padding: 0 var(--space-8); background: var(--color-header-bg); border-bottom: 1px solid var(--color-border-strong); flex-shrink: 0; gap: var(--space-8); z-index: var(--z-sticky); }
  .header-left { display: flex; align-items: center; gap: var(--space-6); min-width: 0; flex: 1; }
  .logo-mark { flex-shrink: 0; }
  .app-name { font-family: var(--font-mono); font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); letter-spacing: var(--letter-spacing-widest); text-transform: uppercase; flex-shrink: 0; }
  .filename { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-text-primary); max-width: 300px; }
  .shape-badge { flex-shrink: 0; }
  .header-right { display: flex; align-items: center; gap: var(--space-4); flex-shrink: 0; }
  .new-file-btn { font-size: var(--font-size-xs); height: 28px; gap: var(--space-3); padding: 0 var(--space-6); }
  .main-area { display: flex; flex: 1; overflow: hidden; min-height: 0; }
  .grid-column { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-width: 0; }
</style>
