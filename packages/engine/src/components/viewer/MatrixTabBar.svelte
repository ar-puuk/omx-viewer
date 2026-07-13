<script lang="ts">
  // Component: MatrixTabBar — Horizontal scrollable tab bar.
  // Hidden under the vscode theme — MatrixDropdown replaces it there (see
  // ViewerLayout.svelte). A horizontal tab bar scales poorly to files with
  // many matrices (the real test file had 23) in the narrower width typical
  // of a VS Code webview pane, and a top-right dropdown is the idiomatic
  // VS Code pattern for "pick one of several related things" (same pattern
  // as Jupyter's kernel picker). Same self-hiding pattern as ThemeToggle.
  import { store } from '../../state/matrixStore.svelte.js'
  import MatrixTab from './MatrixTab.svelte'

  const isVscodeTheme = document.documentElement.dataset.theme === 'vscode'
</script>

{#if !isVscodeTheme}
<div class="tabbar" role="tablist" aria-label="Matrix tabs">
  <div class="tabbar-scroll scroll-x">
    {#each store.tabs as tab (tab.id)}
      <MatrixTab {tab} />
    {/each}
  </div>
</div>
{/if}

<style>
  .tabbar { display: flex; align-items: stretch; height: var(--tabbar-height); background: var(--color-bg-surface); border-bottom: none; box-shadow: 0 1px 0 var(--color-border); flex-shrink: 0; }
  .tabbar-scroll { display: flex; align-items: stretch; flex: 1; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  .tabbar-scroll::-webkit-scrollbar { display: none; }
</style>
