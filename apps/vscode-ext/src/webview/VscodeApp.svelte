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
    exportSummaryCSV,
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

  // Decodes one base64 chunk directly into `target` at `offset` — never
  // materializes the whole file as one JS string. Returns the number of
  // bytes written so the caller can advance its offset.
  function decodeBase64Into(b64: string, target: Uint8Array, offset: number): number {
    const binary = atob(b64)
    for (let i = 0; i < binary.length; i++) target[offset + i] = binary.charCodeAt(i)
    return binary.length
  }

  // Chunked file transfer state — see extension.ts's 'initStart'/'initChunk'
  // messages. A single base64 string for the whole file would exceed V8's
  // max string length for files above ~400MB, so the extension host sends
  // it in pieces and this reassembles them into one preallocated buffer.
  let pendingName: string | undefined
  let pendingBytes: Uint8Array | undefined
  let pendingOffset = 0
  let pendingChunkCount = 0
  let receivedChunks = 0

  async function handleInit(name: string, bytes: Uint8Array) {
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
    const msg = event.data as {
      type: string
      name?: string
      bytesBase64?: string
      totalBytes?: number
      chunkCount?: number
    }
    if (msg.type === 'initStart' && msg.name && msg.totalBytes !== undefined && msg.chunkCount) {
      pendingName = msg.name
      pendingBytes = new Uint8Array(msg.totalBytes)
      pendingOffset = 0
      pendingChunkCount = msg.chunkCount
      receivedChunks = 0
    } else if (msg.type === 'initChunk' && msg.bytesBase64 !== undefined && pendingBytes) {
      pendingOffset += decodeBase64Into(msg.bytesBase64, pendingBytes, pendingOffset)
      receivedChunks++
      if (receivedChunks === pendingChunkCount && pendingName) {
        void handleInit(pendingName, pendingBytes)
        pendingName = undefined
        pendingBytes = undefined
      }
    } else if (msg.type === 'triggerExportSummary') {
      // From the "OMX: Export Summary as CSV" command palette action.
      // Reuses the exact same export path as the in-webview Summary panel
      // button (see formatNumber.ts's exportSummaryCSV()) — this is just a
      // second trigger source, not separate logic.
      const exported = exportSummaryCSV()
      if (!exported) {
        vscodeApi.postMessage({
          type: 'showInfo',
          message: 'No summary generated yet — open the Summary panel and click Generate first.',
        })
      }
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
