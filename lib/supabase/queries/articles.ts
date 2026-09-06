import "server-only";

import {
  RELATED_ARTICLE_LIMIT,
  URL_EXISTENCE_CHUNK_SIZE,
} from "@/lib/supabase/limits";
import { getServiceClient } from "@/lib/supabase/service";
import type {
  AnalysisWithoutEmbedding,
  ArticleInsert,
  ArticleRow,
  RelatedArticleRow,
  SourceRow,
} from "@/lib/supabase/types";
import { parseVectorLiteral, toVectorLiteral } from "@/lib/supabase/vector";

/** An article with its source and (when analyzed) its analysis. */
export type ArticleWithRelations = ArticleRow & {
  source: Pick<SourceRow, "id" | "name" | "listing_url" | "logo_url">;
  analysis: AnalysisWithoutEmbedding;
};

const ARTICLE_COLUMNS =
  "id, source_id, url, canonical_url, title, image_url, published_at, raw_text, scraped_at, analyzed_at, created_at";

const SOURCE_EMBED = "sources!inner(id, name, listing_url, logo_url)";

/** No `embedding`: 1536 floats per row, and nothing in the UI reads it (§20). */
const ANALYSIS_EMBED =
  "article_analyses!inner(id, article_id, summary, sentiment_score, sentiment_label, bias_score, bias_label, left_percentage, center_percentage, right_percentage, confidence, framing_notes, loaded_terms, disclaimer, model, created_at)";

const FULL_SELECT = `${ARTICLE_COLUMNS}, ${SOURCE_EMBED}, ${ANALYSIS_EMBED}`;

/**
 * PostgREST returns a to-one embed as an object, but as an array when it cannot
 * prove the relationship is unique. Normalize both shapes.
 */
function toOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

/** The article's own columns, without any embedded relations. */
function pickArticle(row: ArticleRow): ArticleRow {
  return {
    id: row.id,
    source_id: row.source_id,
    url: row.url,
    canonical_url: row.canonical_url,
    title: row.title,
    image_url: row.image_url,
    published_at: row.published_at,
    raw_text: row.raw_text,
    scraped_at: row.scraped_at,
    analyzed_at: row.analyzed_at,
    created_at: row.created_at,
  };
}

type JoinedRow = ArticleRow & {
  sources:
    | ArticleWithRelations["source"]
    | ArticleWithRelations["source"][]
    | null;
  article_analyses:
    | AnalysisWithoutEmbedding
    | AnalysisWithoutEmbedding[]
    | null;
};

/** Drops rows whose inner joins came back empty, so callers get complete records. */
function toArticleWithRelations(row: JoinedRow): ArticleWithRelations | null {
  const source = toOne(row.sources);
  const analysis = toOne(row.article_analyses);

  if (!source || !analysis) {
    return null;
  }

  return { ...pickArticle(row), source, analysis };
}

type PageOptions = { limit: number; offset?: number };

/**
 * Analyzed articles for the home feed, newest first. Articles without an
 * analysis row are excluded by the inner join — they have nothing to show.
 */
export async function getAnalyzedArticles({
  limit,
  offset = 0,
}: PageOptions): Promise<ArticleWithRelations[]> {
  const { data, error } = await getServiceClient()
    .from("articles")
    .select(FULL_SELECT)
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1)
    .returns<JoinedRow[]>();

  if (error) {
    throw new Error(`Failed to load analyzed articles: ${error.message}`);
  }

  return (data ?? [])
    .map(toArticleWithRelations)
    .filter((row): row is ArticleWithRelations => row !== null);
}

/** A single analyzed article, or `null` when it is missing or not yet analyzed. */
export async function getArticleById(
  id: string,
): Promise<ArticleWithRelations | null> {
  const { data, error } = await getServiceClient()
    .from("articles")
    .select(FULL_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<JoinedRow | null>();

  if (error) {
    throw new Error(`Failed to load article ${id}: ${error.message}`);
  }

  return data ? toArticleWithRelations(data) : null;
}

/**
 * A pending article plus the source name the analysis prompt identifies it by.
 *
 * `needsAnalysis` separates the two kinds of pending work (§20): a brand new
 * article needs the full analysis, while an article whose analysis row exists
 * but has no vector needs only an embedding backfill.
 */
export type PendingArticle = ArticleRow & {
  sourceName: string;
  needsAnalysis: boolean;
};

type PendingRow = ArticleRow & {
  sources: { name: string } | { name: string }[] | null;
};

/** Article IDs that already have an analysis row, and which of those lack a vector. */
async function analysisState(): Promise<{
  analyzed: Set<string>;
  missingEmbedding: Set<string>;
}> {
  const client = getServiceClient();

  // Two id-only queries rather than a joined filter: filtering an embedded
  // table with `.eq('article_analyses.…')` generates broken PostgREST SQL
  // (§21), and selecting `embedding` here would drag a 1536-float vector across
  // the wire for every analyzed article just to test it for NULL.
  const [all, pending] = await Promise.all([
    client.from("article_analyses").select("article_id"),
    client.from("article_analyses").select("article_id").is("embedding", null),
  ]);

  if (all.error || pending.error) {
    const message = (all.error ?? pending.error)?.message ?? "unknown error";
    throw new Error(`Failed to load analysis state: ${message}`);
  }

  return {
    analyzed: new Set((all.data ?? []).map((row) => row.article_id)),
    missingEmbedding: new Set(
      (pending.data ?? []).map((row) => row.article_id),
    ),
  };
}

/**
 * Articles still awaiting work — the **pending-analysis check** of AGENTS §19.1,
 * extended for embeddings by §20.
 *
 * An article is pending when it has no `article_analyses` row (full analysis) or
 * when that row has `embedding IS NULL` (embedding backfill only). Detection
 * never trusts `analyzed_at`, which lies when an analysis row was deleted after
 * the fact. `ids` is applied in JS so the pending condition and the id condition
 * are evaluated together.
 *
 * With no `limit`, every pending article is returned: analysis defaults to all
 * pending articles and must not be capped to a fixed batch (§19).
 */
export async function getArticlesPendingAnalysis({
  limit,
  ids,
}: {
  limit?: number;
  ids?: string[];
} = {}): Promise<PendingArticle[]> {
  const [{ data, error }, state] = await Promise.all([
    getServiceClient()
      .from("articles")
      .select(`${ARTICLE_COLUMNS}, sources(name)`)
      .order("scraped_at", { ascending: true })
      .returns<PendingRow[]>(),
    analysisState(),
  ]);

  if (error) {
    throw new Error(`Failed to load pending articles: ${error.message}`);
  }

  const wanted = ids ? new Set(ids) : null;

  const pending = (data ?? []).filter((row) => {
    if (wanted && !wanted.has(row.id)) {
      return false;
    }

    return (
      !state.analyzed.has(row.id) || state.missingEmbedding.has(row.id)
    );
  });

  return (limit === undefined ? pending : pending.slice(0, limit)).map(
    (row) => ({
      ...pickArticle(row),
      sourceName: toOne(row.sources)?.name ?? "Unknown source",
      needsAnalysis: !state.analyzed.has(row.id),
    }),
  );
}

/**
 * One article's stored embedding, or `null` when it has none (AGENTS §20).
 *
 * Read on its own rather than as part of `getArticleById`, so the article and
 * feed queries never carry the vector.
 */
export async function getArticleEmbedding(
  articleId: string,
): Promise<number[] | null> {
  const { data, error } = await getServiceClient()
    .from("article_analyses")
    .select("embedding")
    .eq("article_id", articleId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load embedding for article ${articleId}: ${error.message}`,
    );
  }

  return parseVectorLiteral(data?.embedding ?? null);
}

/**
 * The most similar analyzed articles to this one, by cosine distance (§20).
 *
 * Ordering happens in Postgres: `order by embedding <=> $1` has no PostgREST
 * equivalent, so this calls the `match_related_articles` function defined in
 * `supabase/schema.sql`. That function excludes the current article and any
 * article that is unanalyzed or unembedded.
 */
export async function getRelatedArticles(
  articleId: string,
  embedding: number[],
  limit: number = RELATED_ARTICLE_LIMIT,
): Promise<RelatedArticleRow[]> {
  const { data, error } = await getServiceClient().rpc(
    "match_related_articles",
    {
      p_article_id: articleId,
      p_embedding: toVectorLiteral(embedding),
      p_match_count: limit,
    },
  );

  if (error) {
    throw new Error(
      `Failed to load related articles for ${articleId}: ${error.message}`,
    );
  }

  return data ?? [];
}

/**
 * Which of these URLs are already stored, checked against both `url` and
 * `canonical_url`.
 *
 * Queried in chunks of `URL_EXISTENCE_CHUNK_SIZE` — the **URL existence check**
 * of AGENTS §9 never passes more than 15 URLs to a single `.in()`.
 */
export async function findExistingUrls(urls: string[]): Promise<Set<string>> {
  const unique = [...new Set(urls)];
  const existing = new Set<string>();
  const client = getServiceClient();

  for (let i = 0; i < unique.length; i += URL_EXISTENCE_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + URL_EXISTENCE_CHUNK_SIZE);
    for (const column of ["url", "canonical_url"] as const) {
      const { data, error } = await client
        .from("articles")
        .select("url, canonical_url")
        .in(column, chunk);
      if (error)
        throw new Error(`Failed to check existing URLs: ${error.message}`);
      for (const row of data ?? []) {
        existing.add(row.url);
        if (row.canonical_url) existing.add(row.canonical_url);
      }
    }
  }

  return existing;
}

/**
 * Append-only insert (AGENTS §10): a URL already stored is skipped, never
 * replaced. Returns only the rows actually inserted.
 */
export async function insertArticles(
  rows: ArticleInsert[],
): Promise<ArticleRow[]> {
  if (rows.length === 0) {
    return [];
  }

  const inserted: ArticleRow[] = [];
  for (const row of rows) {
    const { data, error } = await getServiceClient()
      .from("articles")
      .insert(row)
      .select(ARTICLE_COLUMNS)
      .single();
    if (error) {
      // Only known URL constraints are duplicates, not unrelated unique failures.
      if (
        error.code === "23505" &&
        /articles_(?:url_key|canonical_url_key)/.test(error.message)
      )
        continue;
      throw new Error(`Failed to insert articles: ${error.message}`);
    }
    inserted.push(data);
  }
  return inserted;
}

/** Set `analyzed_at` — only after a valid analysis row is saved (AGENTS §19.6). */
export async function markArticleAnalyzed(
  id: string,
  analyzedAt: Date = new Date(),
): Promise<void> {
  const { error } = await getServiceClient()
    .from("articles")
    .update({ analyzed_at: analyzedAt.toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to mark article ${id} analyzed: ${error.message}`);
  }
}
