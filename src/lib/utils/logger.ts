/**
 * logger.ts — Thin logging utility.
 * All methods are no-ops in production builds (import.meta.env.PROD).
 * In development, delegates to the browser console with a [omx] prefix.
 *
 * Usage:
 *   import { logger } from '$lib/utils/logger.js'
 *   logger.log('Parsed matrix:', name)
 *   logger.warn('Chunk cache full — evicting LRU')
 *   logger.error('DuckDB init failed', err)
 */

const PREFIX = '[omx]'
const IS_PROD = import.meta.env.PROD

/* eslint-disable no-console */
export const logger = {
  /** Log general informational messages (dev only). */
  log: IS_PROD
    ? () => { /* no-op in production */ }
    : (...args: unknown[]) => console.log(PREFIX, ...args),

  /** Log debug-level detail (dev only). */
  debug: IS_PROD
    ? () => { /* no-op in production */ }
    : (...args: unknown[]) => console.debug(PREFIX, ...args),

  /** Log warnings — non-fatal issues worth surfacing in dev. */
  warn: IS_PROD
    ? () => { /* no-op in production */ }
    : (...args: unknown[]) => console.warn(PREFIX, ...args),

  /** Log errors — always suppressed in production to avoid leaking internals. */
  error: IS_PROD
    ? () => { /* no-op in production */ }
    : (...args: unknown[]) => console.error(PREFIX, ...args),

  /** Log timing information using console.time / timeEnd (dev only). */
  time: IS_PROD
    ? (_label: string) => { /* no-op */ }
    : (label: string) => console.time(`${PREFIX} ${label}`),

  timeEnd: IS_PROD
    ? (_label: string) => { /* no-op */ }
    : (label: string) => console.timeEnd(`${PREFIX} ${label}`),
}
/* eslint-enable no-console */
