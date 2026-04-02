<script lang="ts">
  // Component: SummaryPanel — Collapsible bottom drawer for aggregation summary.
  // Dimension / Function / Scope config form → Generate → scrollable result table → CSV download.

  import {
    summaryConfig, summaryResult, summaryPanelOpen,
    file, activeTabId, fileMatrixIds, decimalPlaces,
    setSummaryConfig, startSummaryLoad, setSummaryResult, setSummaryError,
  } from '../../state/matrixStore.svelte.js'
  import {
    AGGREGATION_FUNCTIONS, AGGREGATION_FUNCTION_LABELS,
    AGGREGATION_DIMENSIONS, AGGREGATION_DIMENSION_LABELS,
    AGGREGATION_SCOPES, AGGREGATION_SCOPE_LABELS,
  } from '../../utils/constants.js'
  import { rowToCSVLine, downloadTextFile } from '../../utils/formatNumber.js'
  import { runAggregation } from '../../services/duckdbService.js'
  import { logger } from '../../utils/logger.js'

  let isGenerating = $state(false)

  async function handleGenerate() {
    const f = file
    const activeId = activeTabId
    if (!f || !activeId || isGenerating) return

    isGenerating = true
    startSummaryLoad()

    try {
      const result = await runAggregation({
        dimension: summaryConfig.dimension,
        fn: summaryConfig.fn,
        scope: summaryConfig.scope,
        activeMatrix: activeId,
        allMatrixNames: fileMatrixIds,
        nrows: f.shape[0],
        ncols: f.shape[1],
      })

      setSummaryResult(result.columnNames, result.rows)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Aggregation failed'
      setSummaryError(msg)
      logger.error('SummaryPanel: aggregation failed', err)
    } finally {
      isGenerating = false
    }
  }

  function handleDownloadCSV() {
    const res = summaryResult
    if (!res || res.rows.length === 0) return

    const header = res.columnNames.join(',')
    const rows = res.rows.map((r) => rowToCSVLine(r, decimalPlaces))
    const csv = [header, ...rows].join('\n')

    const fnLabel = AGGREGATION_FUNCTION_LABELS[res.config.fn].replace(/\s+/g, '_')
    const dimLabel = AGGREGATION_DIMENSION_LABELS[res.config.dimension].replace(/\s+/g, '_')
    downloadTextFile(csv, `summary_${fnLabel}_${dimLabel}.csv`)
  }

  const panelLabel = $derived(() => {
    if (!summaryResult?.config) return 'Summary'
    const fn  = AGGREGATION_FUNCTION_LABELS[summaryResult.config.fn]
    const dim = AGGREGATION_DIMENSION_LABELS[summaryResult.config.dimension]
    const sc  = summaryResult.config.scope === 'all_matrices' ? 'All Matrices' : 'Active Matrix'
    return `${fn} ${dim} · ${sc}`
  })
</script>

{#if summaryPanelOpen}
  <div class="summary-panel animate-slide-up" role="region" aria-label="Aggregation summary panel">

    <!-- Config bar -->
    <div class="config-bar">
      <div class="config-fields">
        <!-- Dimension -->
        <div class="config-field">
          <label class="field-label" for="sum-dim">Dimension</label>
          <select
            id="sum-dim"
            class="config-select"
            value={summaryConfig.dimension}
            onchange={(e) => setSummaryConfig({ ...summaryConfig, dimension: (e.currentTarget as HTMLSelectElement).value as typeof summaryConfig.dimension })}
          >
            {#each AGGREGATION_DIMENSIONS as dim}
              <option value={dim}>{AGGREGATION_DIMENSION_LABELS[dim]}</option>
            {/each}
          </select>
        </div>

        <!-- Function -->
        <div class="config-field">
          <label class="field-label" for="sum-fn">Function</label>
          <select
            id="sum-fn"
            class="config-select"
            value={summaryConfig.fn}
            onchange={(e) => setSummaryConfig({ ...summaryConfig, fn: (e.currentTarget as HTMLSelectElement).value as typeof summaryConfig.fn })}
          >
            {#each AGGREGATION_FUNCTIONS as fn}
              <option value={fn}>{AGGREGATION_FUNCTION_LABELS[fn]}</option>
            {/each}
          </select>
        </div>

        <!-- Scope -->
        <div class="config-field">
          <label class="field-label" for="sum-scope">Scope</label>
          <select
            id="sum-scope"
            class="config-select"
            value={summaryConfig.scope}
            onchange={(e) => setSummaryConfig({ ...summaryConfig, scope: (e.currentTarget as HTMLSelectElement).value as typeof summaryConfig.scope })}
          >
            {#each AGGREGATION_SCOPES as sc}
              <option value={sc}>{AGGREGATION_SCOPE_LABELS[sc]}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="config-actions">
        <button
          class="btn btn-primary generate-btn"
          onclick={handleGenerate}
          disabled={isGenerating || !file}
          aria-busy={isGenerating}
        >
          {#if isGenerating}
            <div class="spinner" aria-hidden="true"></div>
            Generating…
          {:else}
            Generate
          {/if}
        </button>

        {#if summaryResult && summaryResult.rows.length > 0 && !summaryResult.isLoading}
          <button
            class="btn btn-ghost"
            onclick={handleDownloadCSV}
            title="Download summary as CSV"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M6.5 1v7M4 5.5l2.5 2.5L9 5.5M2 11h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            CSV
          </button>
        {/if}
      </div>
    </div>

    <!-- Result area -->
    <div class="result-area">
      {#if summaryResult?.isLoading}
        <div class="result-placeholder">
          <div class="spinner spinner-lg" aria-label="Generating summary…"></div>
          <span class="placeholder-text">Running aggregation…</span>
        </div>

      {:else if summaryResult?.error}
        <div class="result-error" role="alert">
          <span>⚠ {summaryResult.error}</span>
        </div>

      {:else if summaryResult && summaryResult.rows.length > 0}
        <!-- Result header -->
        <div class="result-header">
          <span class="result-label">{panelLabel()}</span>
          <span class="result-count">{summaryResult.rows.length.toLocaleString()} rows</span>
        </div>

        <!-- Scrollable result table — rendered in SummaryPanel, NOT appended to grid -->
        <div class="summary-table-container">
          <table class="summary-table" role="grid" aria-label="Aggregation result">
            <thead>
              <tr>
                {#each summaryResult.columnNames as col}
                  <th scope="col">{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each summaryResult.rows as row, i (i)}
                <tr>
                  {#each row as cell}
                    <td>
                      {typeof cell === 'number'
                        ? (isNaN(cell) ? '—' : cell.toLocaleString(undefined, { maximumFractionDigits: decimalPlaces }))
                        : cell}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

      {:else}
        <div class="result-placeholder">
          <span class="placeholder-text">
            Configure options above and click <strong>Generate</strong> to compute aggregations.
          </span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .summary-panel {
    flex-shrink: 0;
    background: var(--color-summary-bg);
    border-top: 1px solid var(--color-border-strong);
    display: flex;
    flex-direction: column;
    height: var(--summary-panel-height);
    min-height: var(--summary-panel-min-height);
    overflow: hidden;
  }

  /* Config bar */
  .config-bar {
    display: flex;
    align-items: flex-end;
    gap: var(--space-8);
    padding: var(--space-6) var(--space-8);
    background: var(--color-summary-header-bg);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .config-fields {
    display: flex;
    gap: var(--space-8);
    flex-wrap: wrap;
    flex: 1;
  }

  .config-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .field-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    letter-spacing: var(--letter-spacing-wide);
  }

  .config-select {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
    transition: border-color var(--transition-fast);
    min-width: 140px;
  }

  .config-select:focus {
    border-color: var(--color-accent);
    outline: none;
  }

  .config-actions {
    display: flex;
    gap: var(--space-4);
    align-items: flex-end;
  }

  .generate-btn {
    height: 30px;
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    gap: var(--space-3);
  }

  /* Result area */
  .result-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-8) var(--space-2);
    flex-shrink: 0;
  }

  .result-label {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-accent);
    letter-spacing: var(--letter-spacing-wide);
  }

  .result-count {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .summary-table-container {
    flex: 1;
    overflow: auto;
    margin: 0 var(--space-8) var(--space-8);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    scrollbar-width: thin;
    scrollbar-color: var(--color-scrollbar-thumb) transparent;
  }

  .result-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    color: var(--color-text-muted);
    padding: var(--space-16);
  }

  .placeholder-text {
    font-size: var(--font-size-sm);
    text-align: center;
    line-height: var(--line-height-relaxed);
  }

  .placeholder-text strong {
    color: var(--color-text-secondary);
  }

  .result-error {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    color: var(--color-negative);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
  }
</style>
