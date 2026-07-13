<script lang="ts">
  // Component: Icon — renders a real VS Code codicon under the vscode
  // theme, or the caller's custom SVG (passed as children) everywhere else.
  // apps/web never sets data-theme="vscode", so it always gets the custom
  // SVG unchanged. @vscode/codicons' CSS is only imported in
  // apps/vscode-ext's main.ts — never shipped to the browser build.
  import type { Snippet } from 'svelte'

  interface Props {
    codicon: string
    size?: number
    children?: Snippet
  }
  const { codicon, size = 14, children }: Props = $props()

  const isVscodeTheme = document.documentElement.dataset.theme === 'vscode'
</script>

{#if isVscodeTheme}
  <span class="codicon codicon-{codicon}" style="font-size: {size}px; line-height: 1;" aria-hidden="true"></span>
{:else if children}
  {@render children()}
{/if}
