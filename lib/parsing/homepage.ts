import { load } from "cheerio";
import type { SourceRow } from "@/lib/supabase/types";
import { SCRAPE_LIMITS } from "@/lib/pipeline/limits";
import { articleUrl } from "./urls";

export const HIDDEN =
  '[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"]';
const STORY_LINKS: Record<string, string> = {
  bbc: '[data-testid$="card"] a[href], a[data-testid="internal-link"]:has(h2), a[data-testid="internal-link"]:has(h3), [data-testid="card-headline"] a, article h2 a, article h3 a',
  reuters:
    'a[data-testid="TitleLink"]:has([data-testid="TitleHeading"]), [data-testid="Heading"] a, a[data-testid="Heading"], [data-testid="MediaStoryCard"] h3 a, [data-testid="TextStoryCard"] h3 a, article h2 a, article h3 a',
  npr: ".story-text a:has(h3.title), .story-text a:has(h2.title), article h2.title a, article h3.title a, .story-wrap .title a, .story-text .title a",
  fox: "article .title a, article h2 a, article h3 a, .collection .title a",
  guardian:
    'a[data-link-name="article"], .fc-item__title a, article h2 a, article h3 a, a:has(h3)',
};

export function extractCandidates(
  html: string,
  source: SourceRow,
  pageUrl = source.listing_url,
) {
  const selector = STORY_LINKS[source.parser_strategy ?? ""];
  if (!selector) throw new Error("Unsupported parser strategy");
  const $ = load(html);
  $(`nav, footer, [role="navigation"], ${HIDDEN}`).remove();
  const candidates: string[] = [];
  const reasons: Record<string, number> = {};
  const seen = new Set<string>();
  let found = 0,
    rejected = 0,
    duplicates = 0;
  const links = $(selector);
  links.slice(0, SCRAPE_LIMITS.candidatesPerSource).each((_, element) => {
    found++;
    const node = $(element);
    const url = articleUrl(node.attr("href") ?? "", source, pageUrl);
    if (!url || node.text().trim().length < 15) {
      rejected++;
      reasons["not_article_card_or_url"] =
        (reasons["not_article_card_or_url"] ?? 0) + 1;
    } else if (seen.has(url)) {
      duplicates++;
    } else {
      seen.add(url);
      candidates.push(url);
    }
  });
  return {
    candidates,
    found,
    rejected,
    duplicates,
    reasons,
    truncated: links.length > SCRAPE_LIMITS.candidatesPerSource,
  };
}
