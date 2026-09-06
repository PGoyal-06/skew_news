import { load, type CheerioAPI } from "cheerio";
import type { ArticleInsert, SourceRow } from "@/lib/supabase/types";
import { articleUrl, publicUrl } from "./urls";
import { HIDDEN } from "./homepage";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): string =>
  typeof value === "string" ? value : "";
const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function structuredArticle($: CheerioAPI): RecordValue | undefined {
  const articles: RecordValue[] = [];
  const walk = (value: unknown, depth = 0): void => {
    if (depth > 12) return;
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }
    if (!record(value)) return;
    const types = Array.isArray(value["@type"])
      ? value["@type"]
      : [value["@type"]];
    if (
      types.some(
        (type) =>
          typeof type === "string" &&
          /^(?:NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle)$/.test(
            type,
          ),
      )
    )
      articles.push(value);
    if (value["@graph"]) walk(value["@graph"], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      walk(JSON.parse($(element).text()));
    } catch {
      /* Malformed metadata has DOM fallbacks. */
    }
  });
  return articles.length === 1 ? articles[0] : undefined;
}

function imageValue(value: unknown): string {
  if (Array.isArray(value)) return imageValue(value[0]);
  if (record(value)) return string(value.url) || string(value.contentUrl);
  return string(value);
}

const BODY_SELECTORS: Record<string, string[]> = {
  bbc: [
    '[data-component="text-block"]',
    '[data-testid="text-block"]',
    'article [data-component="text-block"]',
  ],
  reuters: [
    '[data-testid^="paragraph-"]',
    '[data-testid="paragraph"]',
    '[class*="article-body"]',
    "article",
  ],
  npr: ["#storytext", ".storytext"],
  fox: [".article-body"],
  guardian: [
    "#maincontent .article-body-commercial-selector",
    ".article-body-commercial-selector",
    '[data-gu-name="body"]',
    ".content__article-body",
  ],
};
const BOILERPLATE =
  /(?:subscribe to|sign up for|click here|all rights reserved|read more:|related (?:articles|stories)|advertisement|sponsored by|javascript (?:is disabled|error)|unexpected token|function\s*\(|window\.|document\.|@media|\.\w+\s*\{)/i;
const REMOVE = `script, style, noscript, nav, footer, aside, figure, figcaption, button, form, iframe, h1, h2, h3, ${HIDDEN}, [class*="newsletter"], [class*="subscribe"], [class*="subscription"], [class*="related"], [class*="most-viewed"], [class*="most-read"], [class*="share"], [class*="social"], [class*="caption"], [class*="byline"], [class*="author-bio"], [class*="advert"], [class*="ad-slot"], [class*="sponsor"], [data-component="advertisement"], [data-testid="Ad"]`;

function bodyParagraphs(
  $: CheerioAPI,
  source: SourceRow,
  metadata: RecordValue | undefined,
): string[] {
  $(REMOVE).remove();
  for (const selector of BODY_SELECTORS[source.parser_strategy ?? ""] ?? []) {
    const roots = $(selector);
    if (!roots.length) continue;
    const paragraphs: string[] = [];
    roots.each((_, root) => {
      const node = $(root);
      const children = node.find("p");
      const blocks = children.length
        ? children
        : node.is('p, [data-testid^="paragraph-"], [data-testid="paragraph"]')
          ? node
          : children;
      if (!blocks.length) {
        const text = clean(node.text());
        if (text.length >= 900 && !node.find("a").length) paragraphs.push(text);
      } else
        blocks.each((_, p) => {
          const el = $(p);
          const text = clean(el.text());
          const linked = el
            .find("a")
            .toArray()
            .reduce((sum, a) => sum + clean($(a).text()).length, 0);
          if (linked < text.length * 0.5) paragraphs.push(text);
        });
    });
    const meaningful = filterParagraphs(paragraphs);
    if (meaningful.length) return meaningful;
  }
  // Only an article-specific JSON-LD body, never the entire page text.
  const raw = string(metadata?.articleBody);
  return raw ? filterParagraphs(load(raw).text().split(/\n+/)) : [];
}

function filterParagraphs(values: string[]): string[] {
  return [...new Set(values.map(clean))].filter(
    (text) =>
      text.length >= 70 &&
      text.split(/\s+/).length >= 12 &&
      !BOILERPLATE.test(text),
  );
}

export type ParsedArticle =
  | { ok: true; article: ArticleInsert }
  | { ok: false; reason: string };

export function parseArticle(
  html: string,
  source: SourceRow,
  originalUrl: string,
  finalUrl = originalUrl,
): ParsedArticle {
  const reject = (reason: string): ParsedArticle => ({ ok: false, reason });
  if (!articleUrl(originalUrl, source) || !articleUrl(finalUrl, source))
    return reject("invalid_article_url");
  const $ = load(html);
  const metadata = structuredArticle($);
  const meta = (name: string) =>
    $(`meta[property="${name}"], meta[name="${name}"]`)
      .first()
      .attr("content") ?? "";
  const title = clean(
    meta("og:title") || string(metadata?.headline) || $("h1").first().text(),
  );
  if (
    title.length < 25 ||
    title.split(/\s+/).length < 5 ||
    /^(?:home|latest news|breaking news|news|world news|politics|live|podcasts?|shows?|about us)(?:\s*[-|:]|$)/i.test(
      title,
    )
  )
    return reject("generic_title");
  const declaredCanonical = $('link[rel="canonical"]').attr("href");
  if (declaredCanonical !== undefined && !declaredCanonical.trim())
    return reject("invalid_canonical_url");
  const canonical = articleUrl(declaredCanonical ?? finalUrl, source, finalUrl);
  if (!canonical) return reject("invalid_canonical_url");
  const image = publicUrl(
    meta("og:image") || imageValue(metadata?.image) || meta("twitter:image"),
    finalUrl,
  );
  // An empty image value resolves to the page itself; require metadata explicitly.
  if (
    !(
      meta("og:image") ||
      imageValue(metadata?.image) ||
      meta("twitter:image")
    ) ||
    !image
  )
    return reject("missing_image");
  const date =
    string(metadata?.datePublished) ||
    meta("article:published_time") ||
    meta("datePublished") ||
    meta("date") ||
    $('time[itemprop="datePublished"]').attr("datetime") ||
    "";
  const timestamp = Date.parse(date);
  if (
    !date ||
    !Number.isFinite(timestamp) ||
    timestamp > Date.now() + 86_400_000
  )
    return reject("missing_or_invalid_published_date");
  const paragraphs = bodyParagraphs($, source, metadata);
  const raw = paragraphs.join("\n\n");
  if (paragraphs.length < 3 && raw.length < 900)
    return reject("insufficient_article_body");
  // A title/body overlap helps reject unrelated headline collections and incorrect body containers.
  const titleWords = title.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  if (!titleWords.some((word) => raw.toLowerCase().includes(word)))
    return reject("unrelated_article_body");
  const text =
    paragraphs.length === 1
      ? raw.replace(/([.!?])\s+(?=[A-Z])/g, "$1\n\n")
      : raw;
  return {
    ok: true,
    article: {
      source_id: source.id,
      url: originalUrl,
      canonical_url: canonical,
      title,
      image_url: image,
      published_at: new Date(timestamp).toISOString(),
      raw_text: text,
      scraped_at: new Date().toISOString(),
      analyzed_at: null,
    },
  };
}
