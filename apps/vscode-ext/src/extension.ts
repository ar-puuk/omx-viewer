import * as vscode from 'vscode'
import * as path from 'path'

/**
 * OmxDocument — minimal CustomDocument wrapper. No in-memory model beyond
 * the URI: h5wasm (inside the webview) owns the actual parsed file state.
 * Read-only for Stage 1 — no save/revert/backup needed.
 */
class OmxDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {}
}

class OmxEditorProvider implements vscode.CustomReadonlyEditorProvider<OmxDocument> {
  // Tracks every open OMX webview panel so the command palette action can
  // find whichever one is currently focused — WebviewPanel.active is a
  // real, queryable property VS Code maintains for exactly this purpose.
  private panels = new Set<vscode.WebviewPanel>()

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): OmxDocument {
    return new OmxDocument(uri)
  }

  /**
   * "OMX: Export Summary as CSV" command handler. Finds the active OMX
   * webview (if any) and asks it to trigger the same CSV export path the
   * in-webview Summary panel button already uses.
   */
  exportActiveSummary(): void {
    const panel = [...this.panels].find((p) => p.active)
    if (!panel) {
      void vscode.window.showInformationMessage('OMX Viewer: no OMX file is currently active.')
      return
    }
    void panel.webview.postMessage({ type: 'triggerExportSummary' })
  }

  async resolveCustomEditor(
    document: OmxDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    this.panels.add(panel)
    panel.onDidDispose(() => this.panels.delete(panel))

    const webviewRoot = vscode.Uri.file(
      path.join(this.context.extensionPath, 'dist-webview')
    )

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot],
    }

    // Register the message listener BEFORE setting .html — if the webview
    // loads and posts 'ready' before a listener exists, that message is
    // lost with no error, no retry, and no visible symptom other than the
    // viewer silently never receiving a file.
    panel.webview.onDidReceiveMessage(async (msg: {
      type: string
      detail?: string
      filename?: string
      content?: string
      message?: string
    }) => {
      if (msg.type === 'ready') {
        try {
          const bytes = await vscode.workspace.fs.readFile(document.uri)
          const name = path.basename(document.uri.fsPath)
          const totalBytes = bytes.byteLength
          // Base64, not a raw Uint8Array/Buffer — verified empirically that
          // VS Code's webview postMessage does NOT preserve typed arrays via
          // structured clone as assumed; it JSON-serializes them, and since
          // readFile() returns a Node Buffer, that means Buffer.toJSON()'s
          // {type:'Buffer', data:[...]} wrapper on the receiving end. Base64
          // sidesteps that ambiguity entirely and is more compact than the
          // number-array shape we were already accidentally getting.
          //
          // Sent in chunks, not one Buffer.toString('base64') call — base64
          // inflates size ~4/3, and a single base64 string for a file above
          // ~400MB exceeds V8's ~512MiB max string length ("Cannot create a
          // string longer than 0x1fffffe8 characters"), which threw here
          // before the webview ever saw a byte.
          const CHUNK_BYTES = 32 * 1024 * 1024
          const chunkCount = Math.max(1, Math.ceil(totalBytes / CHUNK_BYTES))
          await panel.webview.postMessage({ type: 'initStart', name, totalBytes, chunkCount })
          for (let i = 0; i < chunkCount; i++) {
            const start = i * CHUNK_BYTES
            const end = Math.min(start + CHUNK_BYTES, totalBytes)
            const chunkBase64 = Buffer.from(
              bytes.buffer,
              bytes.byteOffset + start,
              end - start
            ).toString('base64')
            await panel.webview.postMessage({ type: 'initChunk', index: i, bytesBase64: chunkBase64 })
          }
        } catch (err) {
          void vscode.window.showErrorMessage(
            `OMX Viewer: failed to read file — ${err instanceof Error ? err.message : String(err)}`
          )
        }
      } else if (msg.type === 'saveFile' && msg.filename && msg.content !== undefined) {
        try {
          const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(msg.filename),
            filters: { 'CSV files': ['csv'], 'All files': ['*'] },
          })
          if (saveUri) {
            await vscode.workspace.fs.writeFile(saveUri, Buffer.from(msg.content, 'utf-8'))
            void vscode.window.showInformationMessage(`Saved ${path.basename(saveUri.fsPath)}`)
          }
        } catch (err) {
          void vscode.window.showErrorMessage(
            `OMX Viewer: failed to save file — ${err instanceof Error ? err.message : String(err)}`
          )
        }
      } else if (msg.type === 'showInfo' && msg.message) {
        void vscode.window.showInformationMessage(msg.message)
      } else if (msg.type === 'log') {
        console.log('[omx-viewer webview]', msg.detail)
      }
    })

    panel.webview.html = this.getHtml(panel.webview, webviewRoot)
  }

  private getHtml(webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewRoot, 'main.js')
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewRoot, 'main.css')
    )
    // Linked directly, not imported from main.ts — copied as a raw,
    // unprocessed static asset by scripts/copy-codicons.js. Letting Vite's
    // CSS pipeline touch this file corrupts its glyph escapes (confirmed:
    // icons silently didn't render, no build error).
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewRoot, 'codicon.css')
    )
    const csp = webview.cspSource

    return `<!DOCTYPE html>
<html lang="en" data-theme="vscode">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'wasm-unsafe-eval' ${csp}; style-src ${csp} 'unsafe-inline'; worker-src ${csp} blob: data:; img-src ${csp} data:; font-src ${csp};">
<link rel="stylesheet" href="${styleUri}">
<link rel="stylesheet" href="${codiconUri}">
<title>OMX Viewer</title>
</head>
<body>
<div id="app"></div>
<script type="module" src="${scriptUri}"></script>
</body>
</html>`
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new OmxEditorProvider(context)

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'omxViewer.editor',
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    ),
    vscode.commands.registerCommand('omxViewer.exportSummaryCsv', () => {
      provider.exportActiveSummary()
    })
  )
}

export function deactivate(): void {}
