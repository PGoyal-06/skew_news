import "server-only";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { ANALYSIS_RUN_TIMEOUT_MS } from "@/lib/ai/config";
import { analyzeArticle, type AnalysisOutput } from "@/lib/ai/analysis";
import { embedArticle } from "@/lib/ai/embedding";
import {
  insertAnalysis,
  updateAnalysisEmbedding,
} from "@/lib/supabase/queries/analyses";
import {
  getArticlesPendingAnalysis,
  markArticleAnalyzed,
  type PendingArticle,
} from "@/lib/supabase/queries/articles";
import { writeLog } from "@/lib/supabase/queries/logs";
import { analysisBatchSize } from "@/lib/supabase/limits";
import type { ArticleAnalysisInsert, Json } from "@/lib/supabase/types";

/**
 * AI analysis orchestration (AGENTS §19).
 *
 * Mirrors `lib/pipeline/scrape.ts`: a run ID, a logger that writes to both the
 * console and the `logs` table, injectable dependencies, and a typed summary.
 */

export const analyzeInput = z
  .object({
    articleIds: z.array(z.uuid()).min(1).max(500).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export type AnalyzeOptions = z.infer<typeof analyzeInput>;

export type ArticleOutcome = {
  articleId: string;
  title: string;
  status: "analyzed" | "failed";
  /** `full` ran the analysis and the embedding; `embedding` backfilled a vector (§20). */
  mode: "full" | "embedding";
  reason?: string;
};

export type AnalysisSummary = {
  runId: string;
  status: "completed" | "partial" | "failed";
  pendingFound: number;
  analyzed: number;
  /** Articles that had an embedding written this run (§20). */
  embedded: number;
  /** Of those, the ones that only needed a vector — no analysis was re-run. */
  embeddingBackfilled: number;
  skipped: number;
  failed: number;
  batches: number;
  durationMs: number;
  failureReasons: Record<string, number>;
  articles: ArticleOutcome[];
};

type Dependencies = {
  pending: typeof getArticlesPendingAnalysis;
  analyze: typeof analyzeArticle;
  embed: typeof embedArticle;
  save: typeof insertAnalysis;
  saveEmbedding: typeof updateAnalysisEmbedding;
  markAnalyzed: typeof markArticleAnalyzed;
  log: typeof writeLog;
};

const defaultDependencies: Dependencies = {
  pending: getArticlesPendingAnalysis,
  analyze: analyzeArticle,
  embed: embedArticle,
  save: insertAnalysis,
  saveEmbedding: updateAnalysisEmbedding,
  markAnalyzed: markArticleAnalyzed,
  log: writeLog,
};

function logger(runId: string, deps: Dependencies) {
  return async (
    event: string,
    context: Json,
    articleId?: string,
    level: "info" | "warn" | "error" = "info",
  ) => {
    console[level](`[analysis:${runId}] ${event}`, context);
    try {
      await deps.log({
        level,
        event: `analysis.${event}`,
        context: { runId, details: context },
        article_id: articleId,
      });
    } catch {
      console.error("[analysis] log persistence failed");
    }
  };
}

/** `bias_score` is derived, never model-provided (AGENTS §19). */
function biasScore(output: AnalysisOutput): number {
  return (output.rightPercentage - output.leftPercentage) / 100;
}

function toAnalysisRow(
  articleId: string,
  output: AnalysisOutput,
  model: string,
): ArticleAnalysisInsert {
  return {
    article_id: articleId,
    summary: output.summary,
    sentiment_score: output.sentimentScore,
    sentiment_label: output.sentimentLabel,
    bias_score: biasScore(output),
    bias_label: output.politicalFramingLabel,
    left_percentage: output.leftPercentage,
    center_percentage: output.centerPercentage,
    right_percentage: output.rightPercentage,
    confidence: output.confidence,
    framing_notes: output.framingNotes,
    loaded_terms: output.loadedTerms,
    disclaimer: output.disclaimer,
    model,
  };
}

/**
 * Embed one article and store the vector on its analysis row (§20).
 *
 * Returns a failure reason instead of throwing, so an embedding problem is
 * counted like any other per-article failure.
 */
async function embedAndSave(
  article: PendingArticle,
  deps: Dependencies,
): Promise<string | null> {
  const result = await deps.embed({
    title: article.title,
    text: article.raw_text,
  });

  if (!result.ok) {
    return "embedding_failed";
  }

  try {
    await deps.saveEmbedding(article.id, result.embedding);
    return null;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[analysis] embedding save failed for ${article.id}: ${message}`);
    return "embedding_save_failed";
  }
}

/**
 * Backfill an article that already has an analysis row but no vector (§20).
 *
 * The analysis model is not called again — only the embedding is generated.
 */
async function backfillEmbedding(
  article: PendingArticle,
  deps: Dependencies,
): Promise<ArticleOutcome> {
  const base = {
    articleId: article.id,
    title: article.title,
    mode: "embedding" as const,
  };

  const reason = await embedAndSave(article, deps);

  if (reason) {
    return { ...base, status: "failed", reason };
  }

  try {
    await deps.markAnalyzed(article.id);
    return { ...base, status: "analyzed" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[analysis] save failed for ${article.id}: ${message}`);
    return { ...base, status: "failed", reason: "save_failed" };
  }
}

/**
 * Analyze one article end to end, embedding it in the same pass (§19, §20).
 *
 * `analyzed_at` is set only after both the analysis row and the embedding are
 * saved (§19.6, §20), so either failure leaves the article pending for the next
 * run. The two model calls are independent, so they run concurrently.
 */
async function analyzeOne(
  article: PendingArticle,
  deps: Dependencies,
): Promise<ArticleOutcome> {
  const base = {
    articleId: article.id,
    title: article.title,
    mode: "full" as const,
  };

  const [result, embedding] = await Promise.all([
    deps.analyze({
      title: article.title,
      sourceName: article.sourceName,
      text: article.raw_text,
    }),
    deps.embed({ title: article.title, text: article.raw_text }),
  ]);

  if (!result.ok) {
    return { ...base, status: "failed", reason: result.reason };
  }

  if (!embedding.ok) {
    // Nothing is saved: a half-written row would look analyzed to §19.1 while
    // still missing its vector, and the next run would rewrite it anyway.
    return { ...base, status: "failed", reason: "embedding_failed" };
  }

  try {
    await deps.save(toAnalysisRow(article.id, result.output, result.model));
    await deps.saveEmbedding(article.id, embedding.embedding);
    await deps.markAnalyzed(article.id);
    return { ...base, status: "analyzed" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[analysis] save failed for ${article.id}: ${message}`);
    return { ...base, status: "failed", reason: "save_failed" };
  }
}

/** Full analysis for new articles; embedding-only backfill for the rest (§20). */
function processArticle(
  article: PendingArticle,
  deps: Dependencies,
): Promise<ArticleOutcome> {
  return article.needsAnalysis
    ? analyzeOne(article, deps)
    : backfillEmbedding(article, deps);
}

/**
 * Analyze every pending article, in batches.
 *
 * Batching exists only to avoid timeouts (§19): the run continues until no
 * pending articles remain, unless the caller passed `limit` or `articleIds`.
 * One article's failure is counted, never thrown, so it cannot abort the run.
 */
export async function runAnalysis(
  options: AnalyzeOptions,
  deps: Dependencies = defaultDependencies,
): Promise<AnalysisSummary> {
  const started = Date.now();
  const deadline = started + ANALYSIS_RUN_TIMEOUT_MS;
  const runId = randomUUID();
  const log = logger(runId, deps);
  const batchSize = analysisBatchSize();

  const summary: AnalysisSummary = {
    runId,
    status: "completed",
    pendingFound: 0,
    analyzed: 0,
    embedded: 0,
    embeddingBackfilled: 0,
    skipped: 0,
    failed: 0,
    batches: 0,
    durationMs: 0,
    failureReasons: {},
    articles: [],
  };

  let pending: PendingArticle[];
  try {
    pending = await deps.pending({
      limit: options.limit,
      ids: options.articleIds,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[analysis] failed to load pending articles: ${message}`);
    summary.status = "failed";
    summary.durationMs = Date.now() - started;
    await log(
      "failed",
      { ...summary, error: "pending_lookup_failed" },
      undefined,
      "error",
    );
    return summary;
  }

  summary.pendingFound = pending.length;
  // Requested IDs that were already analyzed (or do not exist) are not work.
  summary.skipped = options.articleIds
    ? options.articleIds.length - pending.length
    : 0;

  const backfillOnly = pending.filter(
    (article) => !article.needsAnalysis,
  ).length;

  await log("started", {
    pendingFound: summary.pendingFound,
    needingAnalysis: summary.pendingFound - backfillOnly,
    needingEmbeddingOnly: backfillOnly,
    skipped: summary.skipped,
    batchSize,
    requestedIds: options.articleIds?.length ?? null,
    limit: options.limit ?? null,
  });

  let timedOut = false;

  for (let start = 0; start < pending.length; start += batchSize) {
    if (Date.now() >= deadline) {
      timedOut = true;
      await log(
        "run_time_budget_exhausted",
        {
          analyzed: summary.analyzed,
          embedded: summary.embedded,
          remaining: pending.length - start,
        },
        undefined,
        "warn",
      );
      break;
    }

    const batch = pending.slice(start, start + batchSize);
    summary.batches++;
    await log("batch_started", {
      batch: summary.batches,
      size: batch.length,
      articleIds: batch.map((article) => article.id),
    });

    const outcomes = await Promise.all(
      batch.map((article) => processArticle(article, deps)),
    );

    let batchAnalyzed = 0;
    let batchEmbedded = 0;
    let batchBackfilled = 0;
    let batchFailed = 0;

    for (const outcome of outcomes) {
      summary.articles.push(outcome);

      if (outcome.status === "analyzed") {
        batchEmbedded++;
        summary.embedded++;

        if (outcome.mode === "embedding") {
          batchBackfilled++;
          summary.embeddingBackfilled++;
          await log(
            "article_embedding_backfilled",
            { articleId: outcome.articleId, title: outcome.title },
            outcome.articleId,
          );
        } else {
          batchAnalyzed++;
          summary.analyzed++;
          await log(
            "article_analyzed",
            { articleId: outcome.articleId, title: outcome.title },
            outcome.articleId,
          );
        }
      } else {
        batchFailed++;
        summary.failed++;
        const reason = outcome.reason ?? "unknown";
        summary.failureReasons[reason] =
          (summary.failureReasons[reason] ?? 0) + 1;
        await log(
          "article_failed",
          { articleId: outcome.articleId, mode: outcome.mode, reason },
          outcome.articleId,
          "error",
        );
      }
    }

    await log("batch_completed", {
      batch: summary.batches,
      analyzed: batchAnalyzed,
      embedded: batchEmbedded,
      embeddingBackfilled: batchBackfilled,
      failed: batchFailed,
      skipped: 0,
    });
  }

  summary.status = summary.failed
    ? summary.embedded || timedOut
      ? "partial"
      : "failed"
    : timedOut
      ? "partial"
      : "completed";
  summary.durationMs = Date.now() - started;

  await log(summary.status === "failed" ? "failed" : "completed", summary);

  return summary;
}
