<script lang="ts">
  // Component: App — Root component. Routes between LandingPage and ViewerLayout.
  // Handles file open lifecycle: validation → h5wasm init → parse → store.

  import LandingPage from './lib/components/landing/LandingPage.svelte'
  import ViewerLayout from './lib/components/viewer/ViewerLayout.svelte'
  import LoadingOverlay from './lib/components/shared/LoadingOverlay.svelte'
  import ErrorBanner from './lib/components/shared/ErrorBanner.svelte'

  import {
    hasFile, isLoading, loadingMessage,
    setLoading, openFile, addError, applyThemeToDom, theme
  } from './lib/state/matrixStore.svelte.js'
  import { openOMXFile } from './lib/services/h5wasmService.js'
  import { initDuckDBWorker } from './lib/services/duckdbService.js'
  import { OMXValidationError } from './lib/services/omxParser.js'
  import { FILE_SIZE_WARN_BYTES } from './lib/utils/constants.js'
  import { formatFileSize } from './lib/utils/formatNumber.js'
  import { logger } from './lib/utils/logger.js'

  // Apply the persisted or default theme immediately on mount
  $effect(() => {
    applyThemeToDom(theme)
  })

  // Lazily initialise DuckDB worker in the background after app mounts.
  // Non-blocking — if it fails, aggregation features are disabled with a warning.
  $effect(() => {
    initDuckDBWorker().catch((err) => {
      logger.warn('App: DuckDB worker failed to initialise — aggregation disabled', err)
      addError(
        'Aggregation features are unavailable (DuckDB failed to load). The matrix grid still works.',
        'warning',
        true
      )
    })
  })

  /**
   * Called by FileDropZone / LandingPage when the user selects a file.
   * Runs the full open lifecycle:
   *   1. Show loading overlay
   *   2. Open + validate via h5wasmService (lazy-loads h5wasm WASM on first call)
   *   3. Parse OMX structure into MatrixFile
   *   4. Commit to store → triggers route change to ViewerLayout
   */
  async function handleFile(file: File) {
    // Warn proactively for very large files
    if (file.size > FILE_SIZE_WARN_BYTES) {
      addError(
        `Large file detected (${formatFileSize(file.size)}). Loading may take a moment on low-memory devices.`,
        'warning',
        true
      )
    }

    setLoading(true, 'Initialising HDF5 reader…')

    try {
      setLoading(true, 'Opening file…')
      const parsedFile = await openOMXFile(file)

      setLoading(true, `Parsed ${parsedFile.matrixNames.length} matrices — loading viewer…`)

      // Small async tick so the loading message renders before the potentially
      // heavy store update + reactive cascade
      await new Promise<void>((resolve) => setTimeout(resolve, 16))

      openFile(parsedFile)
      setLoading(false)

      logger.log('App: file opened successfully', parsedFile.filename)
    } catch (err) {
      setLoading(false)

      if (err instanceof OMXValidationError) {
        addError(err.message, 'error', true)
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error opening file'
        addError(`Failed to open file: ${msg}`, 'error', true)
        logger.error('App: file open failed', err)
      }
    }
  }
</script>

<!-- Global error banners (toast stack) -->
<ErrorBanner />

<!-- Loading overlay — shown during file open / h5wasm init -->
{#if isLoading}
  <LoadingOverlay message={loadingMessage} />
{/if}

<!-- Route: Landing or Viewer -->
{#if hasFile}
  <ViewerLayout />
{:else}
  <LandingPage onfile={handleFile} {isLoading} />
{/if}
