/**
 * Centralized pipeline limits (AGENTS §21: "centralized limits").
 */

/**
 * Never pass more than this many URLs to a single `.in()` filter — the
 * **URL existence check** of AGENTS §9.
 */
export const URL_EXISTENCE_CHUNK_SIZE = 15;

/** Articles fetched for the home feed. */
export const DEFAULT_ARTICLE_PAGE_SIZE = 24;

/** Related stories shown on the news details page (AGENTS §20). */
export const RELATED_ARTICLE_LIMIT = 5;

/** Default articles analyzed per batch when `ANALYSIS_BATCH_SIZE` is unset (§21). */
const DEFAULT_ANALYSIS_BATCH_SIZE = 5;

/** Batch size for AI analysis runs; batching exists only to avoid timeouts (§19). */
export function analysisBatchSize(): number {
  const parsed = Number.parseInt(process.env.ANALYSIS_BATCH_SIZE ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_ANALYSIS_BATCH_SIZE;
}
