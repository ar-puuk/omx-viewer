<script lang="ts">
  // Component: App — Root component. Routes between LandingPage and ViewerLayout.
  import LandingPage from './landing/LandingPage.svelte'
  import {
    ViewerLayout,
    LoadingOverlay,
    ErrorBanner,
    store,
    openOMXFile,
    OMXValidationError,
    FILE_SIZE_WARN_BYTES,
    formatFileSize,
    logger,
  } from '@omx-viewer/engine'

  // Apply persisted theme on mount
  $effect(() => { store.applyThemeToDom(store.theme) })

  async function handleFile(file: File) {
    if (file.size > FILE_SIZE_WARN_BYTES) {
      store.addError(`Large file detected (${formatFileSize(file.size)}). Loading may take a moment.`, 'warning', true)
    }
    store.setLoading(true, 'Initialising HDF5 reader…')
    try {
      store.setLoading(true, 'Opening file…')
      // Browser-specific: read the File into memory before crossing into the
      // host-agnostic engine, which takes raw bytes, not a File object.
      const bytes = new Uint8Array(await file.arrayBuffer())
      const parsedFile = await openOMXFile(file.name, bytes)
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
