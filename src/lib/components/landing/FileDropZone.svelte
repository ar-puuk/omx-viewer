<script lang="ts">
  // Component: FileDropZone — Drag-and-drop + click-to-browse file input.
  import { ACCEPTED_FILE_EXTENSIONS, FILE_SIZE_WARN_BYTES } from '../../utils/constants.js'
  import { formatFileSize } from '../../utils/formatNumber.js'
  import { validateHDF5Magic } from '../../services/omxParser.js'
  import { store } from '../../state/matrixStore.svelte.js'

  interface Props { onfile: (file: File) => void; disabled?: boolean }
  const { onfile, disabled = false }: Props = $props()

  let isDraggingOver = $state(false)
  let isValidating = $state(false)
  let inputEl = $state<HTMLInputElement | null>(null)

  async function handleFile(file: File) {
    if (disabled || isValidating) return
    isValidating = true
    if (file.size > FILE_SIZE_WARN_BYTES) {
      store.addError(`File is ${formatFileSize(file.size)} — processing may be slow on low-memory devices.`, 'warning', true)
    }
    const valid = await validateHDF5Magic(file)
    if (!valid) { store.addError('This file does not appear to be a valid HDF5/OMX file.', 'error', true); isValidating = false; return }
    isValidating = false
    onfile(file)
  }

  function onDragOver(e: DragEvent) { e.preventDefault(); if (!disabled) isDraggingOver = true }
  function onDragLeave(e: DragEvent) { if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) isDraggingOver = false }
  function onDrop(e: DragEvent) { e.preventDefault(); isDraggingOver = false; const f = e.dataTransfer?.files[0]; if (f) handleFile(f) }
  function onInputChange(e: Event) { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) handleFile(f) }
  function openFilePicker() { if (!disabled) inputEl?.click() }
  function onKeyDown(e: KeyboardEvent) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFilePicker() } }
</script>

<input bind:this={inputEl} type="file" accept={ACCEPTED_FILE_EXTENSIONS.join(',')} class="sr-only" onchange={onInputChange} aria-hidden="true" tabindex="-1" />

<div
  class="dropzone"
  class:is-dragging-over={isDraggingOver}
  class:is-disabled={disabled}
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-label="Upload OMX or HDF5 file. Click or drag and drop."
  aria-disabled={disabled}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  onclick={openFilePicker}
  onkeydown={onKeyDown}
>
  <div class="dropzone-inner">
    <div class="icon-wrap" aria-hidden="true">
      {#if isValidating}
        <div class="spinner spinner-lg"></div>
      {:else}
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="1" y="1" width="38" height="38" rx="8" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
          <path d="M20 26V14M14 20l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
    </div>
    <div class="text-group">
      <p class="primary-text">{#if isValidating}Validating file…{:else if isDraggingOver}Drop to open{:else}Drop an OMX or HDF5 file here{/if}</p>
      <p class="secondary-text">or <span class="link">browse your computer</span></p>
    </div>
    <div class="meta">
      <span class="badge">.omx</span>
      <span class="badge">.h5</span>
      <span class="badge">.hdf5</span>
    </div>
  </div>
</div>

<style>
  .dropzone { position: relative; width: 100%; max-width: 520px; background: rgba(12, 12, 14, 0.5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px dashed var(--color-dropzone-border); border-radius: var(--radius-xl); cursor: pointer; transition: border-color var(--transition-normal), background-color var(--transition-normal), box-shadow var(--transition-normal), border-style var(--transition-normal); outline: none; user-select: none; }
  .dropzone:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
  .dropzone:hover:not(.is-disabled) { border-color: var(--color-border-strong); border-style: solid; background: rgba(25, 25, 25, 0.7); box-shadow: 0 0 0 1px var(--color-border-strong), var(--shadow-md); }
  .dropzone.is-dragging-over { border-color: var(--color-accent); border-style: solid; background: var(--color-dropzone-hover-bg); animation: glow-pulse 1.5s ease-in-out infinite; }
  .dropzone.is-disabled { opacity: 0.5; cursor: not-allowed; }
  .dropzone-inner { display: flex; flex-direction: column; align-items: center; gap: var(--space-8); padding: var(--space-24) var(--space-16); }
  .icon-wrap { color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; transition: color var(--transition-normal), transform var(--transition-spring); }
  .dropzone:hover:not(.is-disabled) .icon-wrap, .dropzone.is-dragging-over .icon-wrap { color: var(--color-accent); transform: translateY(-2px); }
  .text-group { text-align: center; }
  .primary-text { font-family: var(--font-sans); font-size: var(--font-size-md); font-weight: var(--font-weight-medium); color: var(--color-text-primary); margin-bottom: var(--space-2); }
  .secondary-text { font-size: var(--font-size-sm); color: var(--color-text-muted); }
  .link { color: var(--color-accent); text-decoration: underline; text-underline-offset: 2px; }
  .meta { display: flex; gap: var(--space-4); flex-wrap: wrap; justify-content: center; }
  @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); } 50% { box-shadow: 0 0 24px 4px rgba(59, 130, 246, 0.2); } }
</style>
