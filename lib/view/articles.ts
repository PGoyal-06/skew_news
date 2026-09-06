/**
 * Database rows → presentation views.
 *
 * Components import their types from here, never from `lib/supabase`, so the UI
 * stays free of database shapes. Every field below is read from, or derived
 * from, stored data — the UI displays stored data only (AGENTS §5).
 */
import type { ArticleWithRelations } from "@/lib/supabase/queries/articles";
import type {
  BiasLabel,
  RelatedArticleRow,
  SentimentLabel,
} from "@/lib/supabase/types";

export type { BiasLabel, SentimentLabel };

export type BiasTone = "left" | "center" | "right";

/** AI-estimated framing percentages — sum to 100, enforced by a CHECK (§19). */
export type BiasBreakdown = Record<BiasTone, number>;

export type ArticleCardView = {
  id: string;
  title: string;
  sourceName: string;
  imageUrl: string;
  imageAlt: string;
  publishedLabel: string;
  bias: BiasBreakdown;
  biasLabel: BiasLabel;
};

export type ArticleDetailView = ArticleCardView & {
  /** The article's URL at the publisher — the one source behind this record. */
  originalUrl: string;
  paragraphs: string[];
  readTimeLabel: string;
  /** `article_analyses.summary`, split into lines when it has several. */
  summaryLines: string[];
  summaryGeneratedLabel: string;
  summaryReadTimeLabel: string;
  sentimentLabel: SentimentLabel;
  /** 0–1 (§19). */
  confidence: number;
  framingNotes: string | null;
  loadedTerms: string[];
  disclaimer: string;
};

/**
 * A related-story row on the details page, ranked by cosine similarity to the
 * current article (AGENTS §20).
 */
export type RelatedStoryView = {
  id: string;
  title: string;
  sourceName: string;
  imageUrl: string;
  imageAlt: string;
  publishedLabel: string;
  readTimeLabel: string;
};

const DEFAULT_DISCLAIMER = "AI summaries can make mistakes.";

const WORDS_PER_MINUTE = 200;

const dominantTone = (bias: BiasBreakdown): BiasTone => {
  if (bias.left >= bias.center && bias.left >= bias.right) return "left";
  if (bias.right >= bias.center) return "right";
  return "center";
};

/** The headline framing figure: a tone, its label, and its percentage. */
export const biasHeadline = (
  bias: BiasBreakdown,
  label: BiasLabel,
): { label: string; percent: number; tone: BiasTone } => {
  const tone: BiasTone =
    label === "mixed" || label === "unclear" ? dominantTone(bias) : label;
  const text = tone.charAt(0).toUpperCase() + tone.slice(1);
  return { label: text, percent: bias[tone], tone };
};

/** Relative under a day ("2h ago"), absolute beyond it. */
export function formatPublished(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const elapsedMs = now.getTime() - date.getTime();
  const hours = Math.floor(elapsedMs / 3_600_000);

  if (elapsedMs < 0 || hours >= 24) {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  if (hours >= 1) {
    return `${hours}h ago`;
  }

  const minutes = Math.floor(elapsedMs / 60_000);
  return minutes >= 1 ? `${minutes}m ago` : "Just now";
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  return words.length;
}

export function readTimeLabel(text: string): string {
  return `${Math.max(1, Math.round(countWords(text) / WORDS_PER_MINUTE))} min read`;
}

/** Split cleaned `raw_text` into paragraphs, preferring blank-line breaks. */
export function splitParagraphs(text: string): string[] {
  const byBlankLine = text
    .split(/\n\s*\n/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (byBlankLine.length > 1) {
    return byBlankLine;
  }

  return text
    .split(/\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function biasOf(article: ArticleWithRelations): BiasBreakdown {
  return {
    left: article.analysis.left_percentage,
    center: article.analysis.center_percentage,
    right: article.analysis.right_percentage,
  };
}

export function toCardView(
  article: ArticleWithRelations,
  now?: Date,
): ArticleCardView {
  return {
    id: article.id,
    title: article.title,
    sourceName: article.source.name,
    imageUrl: article.image_url,
    // No alt text is stored, so the title is the closest true description.
    imageAlt: article.title,
    publishedLabel: formatPublished(article.published_at, now),
    bias: biasOf(article),
    biasLabel: article.analysis.bias_label,
  };
}

export function toDetailView(
  article: ArticleWithRelations,
  now?: Date,
): ArticleDetailView {
  const { analysis } = article;
  const summaryLines = splitParagraphs(analysis.summary);

  return {
    ...toCardView(article, now),
    originalUrl: article.canonical_url ?? article.url,
    paragraphs: splitParagraphs(article.raw_text),
    readTimeLabel: readTimeLabel(article.raw_text),
    summaryLines,
    summaryGeneratedLabel: `Generated ${formatPublished(analysis.created_at, now)}`,
    summaryReadTimeLabel: readTimeLabel(analysis.summary),
    sentimentLabel: analysis.sentiment_label,
    confidence: analysis.confidence,
    framingNotes: analysis.framing_notes,
    loadedTerms: analysis.loaded_terms,
    disclaimer: analysis.disclaimer ?? DEFAULT_DISCLAIMER,
  };
}

/** Maps a `match_related_articles` row (AGENTS §20) to its presentation view. */
export function toRelatedView(
  row: RelatedArticleRow,
  now?: Date,
): RelatedStoryView {
  return {
    id: row.article_id,
    title: row.title,
    sourceName: row.source_name,
    imageUrl: row.image_url,
    // No alt text is stored, so the title is the closest true description.
    imageAlt: row.title,
    publishedLabel: formatPublished(row.published_at, now),
    readTimeLabel: readTimeLabel(row.raw_text),
  };
}
