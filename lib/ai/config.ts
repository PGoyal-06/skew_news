/**
 * Centralized AI analysis settings (AGENTS §21: "centralized limits").
 *
 * The model ID is a constant rather than an environment variable: the §21 env
 * table is canonical, and adding a variable there means editing that table and
 * `.env.example` for a value that changes with a deploy, not with a deployment
 * target.
 */

/**
 * OpenAI model used for article analysis, saved to `article_analyses.model`.
 *
 * Chosen from the provider's current capability table in
 * `node_modules/@ai-sdk/openai/docs/03-openai.mdx`, which lists it as
 * supporting object generation. Do not swap in a remembered model ID — check
 * that table first.
 */
export const ANALYSIS_MODEL = "gpt-5-mini";

/** `raw_text` is truncated to this many characters before it reaches the model. */
export const MAX_ARTICLE_CHARS = 24_000;

/** Initial attempt plus exactly one retry on invalid output (AGENTS §19). */
export const ANALYSIS_ATTEMPTS = 2;

/**
 * Whole-run budget. Mirrors `SCRAPE_LIMITS.runTimeoutMs` so a long run returns
 * a `partial` summary instead of being killed mid-batch by the platform.
 */
export const ANALYSIS_RUN_TIMEOUT_MS = 270_000;

/**
 * OpenAI embedding model backing related-article similarity search (§20).
 *
 * Its default width is 1536, which is what `article_analyses.embedding` is
 * declared as — confirmed in the provider's capability table in
 * `node_modules/@ai-sdk/openai/docs/03-openai.mdx`. Changing the model means
 * changing the column type and re-embedding every article.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Must match `article_analyses.embedding`'s declared `vector(1536)`. */
export const EMBEDDING_DIMENSIONS = 1536;

/** Article text is truncated to this many characters before it is embedded. */
export const MAX_EMBEDDING_CHARS = 20_000;
