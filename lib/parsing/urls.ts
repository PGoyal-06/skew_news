import { isIP } from "node:net";
import type { SourceRow } from "@/lib/supabase/types";

export function publicUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    const host = url.hostname.toLowerCase();
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      isIP(host) ||
      host.includes(":") ||
      !host.includes(".") ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
    )
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        /^(?:utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid|CMP|cmpid|output)$/i.test(
          key,
        )
      )
        url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.href;
  } catch {
    return null;
  }
}

export function sourceUrl(
  value: string,
  source: SourceRow,
  base = source.listing_url,
): string | null {
  const normalized = publicUrl(value, base);
  const entry = publicUrl(source.listing_url);
  if (!normalized || !entry) return null;
  const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");
  return host(normalized) === host(entry) ? normalized : null;
}

// Page-type vocabulary is maintained in AGENTS.md §9; this is its executable filter.
const NON_ARTICLE =
  /\/(?:sections?|category|categories|topics?|tags?|authors?|search|shows?|programs?|podcasts?|live|live-news|liveblog|games?|puzzles?|crosswords?|products?|reviews?|shopping|deals|thefilter(?:-us)?|about|contact|help|support|careers|corporate|newsletters?|subscribe|subscription|account|privacy|terms)(?:\/|$)/i;

export function articleUrl(
  value: string,
  source: SourceRow,
  base?: string,
): string | null {
  const normalized = sourceUrl(value, source, base);
  if (!normalized) return null;
  const url = new URL(normalized);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).replace(/\/$/, "");
  } catch {
    return null;
  }
  if (
    NON_ARTICLE.test(path) ||
    /(?:^|[-/])(?:reviews?|shopping|crossword|live-updates|live-blog|podcast)(?:[-/]|$)/i.test(
      path,
    ) ||
    path === new URL(source.listing_url).pathname.replace(/\/$/, "")
  )
    return null;
  const patterns: Record<string, RegExp> = {
    bbc: /^\/news\/(?:articles\/[a-z0-9]{10,}|[a-z][a-z0-9-]*-\d{7,})$/i,
    reuters:
      /^\/(?:[a-z0-9-]+\/)+[a-z0-9]+(?:-[a-z0-9]+){3,}-\d{4}-\d{2}-\d{2}$/i,
    npr: /^\/(?:\d{4}\/\d{2}\/\d{2}\/(?:\d+|[a-z0-9]+-[a-z0-9-]+))\/[a-z0-9]+(?:-[a-z0-9]+){2,}$/i,
    fox: /^\/(?:politics|us|world|media|science|health|tech|faith-religion)\/[a-z0-9]+(?:-[a-z0-9]+){3,}$/i,
    guardian:
      /^\/[a-z0-9-]+\/\d{4}\/[a-z]{3}\/\d{2}\/[a-z0-9]+(?:-[a-z0-9]+){2,}$/i,
  };
  return patterns[source.parser_strategy ?? ""]?.test(path) ? normalized : null;
}
