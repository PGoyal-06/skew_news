import "server-only";

import { getServiceClient } from "@/lib/supabase/service";
import { toVectorLiteral } from "@/lib/supabase/vector";
import type {
  AnalysisWithoutEmbedding,
  ArticleAnalysisInsert,
} from "@/lib/supabase/types";

/** No `embedding`: the vector is written and compared, never read back (§20). */
const ANALYSIS_COLUMNS =
  "id, article_id, summary, sentiment_score, sentiment_label, bias_score, bias_label, left_percentage, center_percentage, right_percentage, confidence, framing_notes, loaded_terms, disclaimer, model, created_at";

/**
 * Save one article's analysis (AGENTS §19).
 *
 * Upserts on `article_id` — one analysis per article — so a re-run replaces the
 * previous result rather than failing on the unique constraint. Only call this
 * with output that already passed validation; `markArticleAnalyzed` runs after.
 */
export async function insertAnalysis(
  row: ArticleAnalysisInsert,
): Promise<AnalysisWithoutEmbedding> {
  const { data, error } = await getServiceClient()
    .from("article_analyses")
    .upsert(row, { onConflict: "article_id" })
    .select(ANALYSIS_COLUMNS)
    .single();

  if (error) {
    throw new Error(
      `Failed to save analysis for article ${row.article_id}: ${error.message}`,
    );
  }

  return data;
}

/**
 * Save an article's embedding onto its existing analysis row (AGENTS §20).
 *
 * Separate from `insertAnalysis` so the embedding backfill path can write a
 * vector without touching — or regenerating — the analysis itself.
 */
export async function updateAnalysisEmbedding(
  articleId: string,
  embedding: number[],
): Promise<void> {
  const { error } = await getServiceClient()
    .from("article_analyses")
    .update({ embedding: toVectorLiteral(embedding) })
    .eq("article_id", articleId);

  if (error) {
    throw new Error(
      `Failed to save embedding for article ${articleId}: ${error.message}`,
    );
  }
}

export async function getAnalysisByArticleId(
  articleId: string,
): Promise<AnalysisWithoutEmbedding | null> {
  const { data, error } = await getServiceClient()
    .from("article_analyses")
    .select(ANALYSIS_COLUMNS)
    .eq("article_id", articleId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load analysis for article ${articleId}: ${error.message}`,
    );
  }

  return data;
}
