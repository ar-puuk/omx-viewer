<script lang="ts">
  // Component: MatrixTabBar — Horizontal scrollable tab bar showing all matrix tabs.

  import { tabs } from '../../state/matrixStore.svelte.js'
  import MatrixTab from './MatrixTab.svelte'
</script>

<div class="tabbar" role="tablist" aria-label="Matrix tabs">
  <div class="tabbar-scroll scroll-x">
    {#each tabs as tab (tab.id)}
      <MatrixTab {tab} />
    {/each}
  </div>
</div>

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    height: var(--tabbar-height);
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .tabbar-scroll {
    display: flex;
    align-items: stretch;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .tabbar-scroll::-webkit-scrollbar {
    display: none;
  }
</style>
