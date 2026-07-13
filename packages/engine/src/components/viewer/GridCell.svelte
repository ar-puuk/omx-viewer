<script lang="ts">
  // Component: GridCell — Individual matrix cell with value color coding.
  import { formatNumber, getValueClass } from '../../utils/formatNumber.js'
  import { store } from '../../state/matrixStore.svelte.js'

  interface Props { value: number; row: number; col: number; width: number; onclick: (row: number, col: number) => void }
  const { value, row, col, width, onclick }: Props = $props()

  const formatted = $derived(formatNumber(value, store.decimalPlaces, store.compactNotation))
  const valueClass = $derived(getValueClass(value))
  const isPinned = $derived(store.pinnedCell !== null && store.pinnedCell.row === row && store.pinnedCell.col === col)
  const isPinnedCol = $derived(store.pinnedCell !== null && !isPinned && store.pinnedCell.col === col)
</script>

<div
  class="grid-cell {valueClass}"
  class:is-pinned={isPinned}
  class:is-pinned-col={isPinnedCol}
  style="width: {width}px; min-width: {width}px;"
  role="gridcell"
  aria-colindex={col + 1}
  aria-selected={isPinned}
  tabindex="-1"
  onclick={() => onclick(row, col)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onclick(row, col) }}
>
  {formatted}
</div>
