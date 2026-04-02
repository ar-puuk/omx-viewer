<script lang="ts">
  // Component: App — Root component. Routes between LandingPage and ViewerLayout.
  import LandingPage from './lib/components/landing/LandingPage.svelte'
  import ViewerLayout from './lib/components/viewer/ViewerLayout.svelte'
  import LoadingOverlay from './lib/components/shared/LoadingOverlay.svelte'
  import ErrorBanner from './lib/components/shared/ErrorBanner.svelte'
  import { store } from './lib/state/matrixStore.svelte.js'
  import { openOMXFile } from './lib/services/h5wasmService.js'
  import { initDuckDBWorker } from './lib/services/duckdbService.js'
  import { OMXValidationError } from './lib/services/omxParser.js'
  import { FILE_SIZE_WARN_BYTES } from './lib/utils/constants.js'
  import { formatFileSize } from './lib/utils/formatNumber.js'
  import { logger } from './lib/utils/logger.js'

  // Apply persisted theme on mount
  $effect(() => { store.applyThemeToDom(store.theme) })

  // Lazily init DuckDB worker in background — non-blocking
  $effect(() => {
    initDuckDBWorker().catch((err) => {
      logger.warn('App: DuckDB worker failed — aggregation disabled', err)
      store.addError('Aggregation features are unavailable (DuckDB failed to load). The matrix grid still works.', 'warning', true)
    })
  })

  async function handleFile(file: File) {
    if (file.size > FILE_SIZE_WARN_BYTES) {
      store.addError(`Large file detected (${formatFileSize(file.size)}). Loading may take a moment.`, 'warning', true)
    }
    store.setLoading(true, 'Initialising HDF5 reader…')
    try {
      store.setLoading(true, 'Opening file…')
      const parsedFile = await openOMXFile(file)
      store.setLoading(true, `Parsed ${parsedFile.matrixNames.length} matrices — loading viewer…`)
      await new Promise<void>((resolve) => setTimeout(resolve, 16))
      store.openFile(parsedFile)
      store.setLoading(false)
      logger.log('App: file opened successfully', parsedFile.filename)
    } catch (err) {
      store.setLoading(false)
      if (err instanceof OMXValidationError) {
        store.addError(err.message, 'error', true)
      } else {
        store.addError(`Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error', true)
        logger.error('App: file open failed', err)
      }
    }
  }
</script>

<ErrorBanner />

{#if store.isLoading}
  <LoadingOverlay message={store.loadingMessage} />
{/if}

{#if store.hasFile}
  <ViewerLayout />
{:else}
  <LandingPage onfile={handleFile} isLoading={store.isLoading} />
{/if}
