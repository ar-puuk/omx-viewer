<script lang="ts">
  // Component: VscodeApp — webview root. No landing page: VS Code's own
  // "Open With" is the file-open affordance, so this boots straight into
  // the viewer once the extension host posts the file's bytes.
  import {
    ViewerLayout,
    LoadingOverlay,
    ErrorBanner,
    store,
    openOMXFile,
    OMXValidationError,
    setFileSaveHandler,
    logger,
  } from '@omx-viewer/engine'

  declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void }
  const vscodeApi = acquireVsCodeApi()

  // No theme effect here, unlike apps/web's App.svelte — data-theme="vscode"
  // is set once in extension.ts's HTML template and never touched by JS.
  // VS Code's own theme is the live source of truth via var(--vscode-*)
  // tokens, which VS Code updates automatically on theme change; applying
  // store.theme ('dark'/'light', the browser toggle's state) here would
  // fight that hardcoded value.

  // The default Blob+<a download> pattern doesn't reliably trigger a save
  // inside a sandboxed webview iframe — confirmed empirically (silent no-op)
  // in Task 6. Route through the extension host instead, which has real
  // access to showSaveDialog()/fs.writeFile().
  setFileSaveHandler((content, filename) => {
    vscodeApi.postMessage({ type: 'saveFile', filename, content })
  })

  function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  async function handleInit(name: string, bytesBase64: string) {
    const bytes = base64ToBytes(bytesBase64)
    store.setLoading(true, 'Opening file…')
    try {
      const parsedFile = await openOMXFile(name, bytes)
      store.setLoading(true, `Parsed ${parsedFile.matrixNames.length} matrices — loading viewer…`)
      await new Promise<void>((resolve) => setTimeout(resolve, 16))
      store.openFile(parsedFile)
      store.setLoading(false)
      logger.log('VscodeApp: file opened successfully', parsedFile.filename)
    } catch (err) {
      store.setLoading(false)
      if (err instanceof OMXValidationError) {
        store.addError(err.message, 'error', true)
      } else {
        store.addError(`Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error', true)
        logger.error('VscodeApp: file open failed', err)
      }
    }
  }

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as { type: string; name?: string; bytesBase64?: string }
    if (msg.type === 'init' && msg.name && msg.bytesBase64) {
      void handleInit(msg.name, msg.bytesBase64)
    }
  })

  vscodeApi.postMessage({ type: 'ready' })
</script>

<ErrorBanner />

{#if store.isLoading}
  <LoadingOverlay message={store.loadingMessage} />
{/if}

{#if store.hasFile}
  <ViewerLayout />
{/if}
