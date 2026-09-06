import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fetchHtml, ScrapeError, type HtmlPage } from "@/lib/oxylabs/client";
import { extractCandidates } from "@/lib/parsing/homepage";
import { parseArticle } from "@/lib/parsing/article";
import {
  findExistingUrls,
  insertArticles,
} from "@/lib/supabase/queries/articles";
import { getActiveSources } from "@/lib/supabase/queries/sources";
import { writeLog } from "@/lib/supabase/queries/logs";
import type { Json, SourceRow } from "@/lib/supabase/types";
import { SCRAPE_LIMITS } from "./limits";

export const scrapeInput = z
  .object({
    sourceIds: z.array(z.uuid()).min(1).max(100).optional(),
    articlesPerSource: z
      .number()
      .int()
      .min(1)
      .max(SCRAPE_LIMITS.maxArticlesPerSource)
      .default(SCRAPE_LIMITS.defaultArticlesPerSource),
  })
  .strict();
export class InvalidSourceSelection extends Error {}
export type ScrapeOptions = z.infer<typeof scrapeInput>;
export type Counts = {
  candidatesFound: number;
  candidatesRejected: number;
  duplicatesSkipped: number;
  detailPagesScraped: number;
  detailAttempts: number;
  articlesInserted: number;
  articlesRejected: number;
  articlesFailed: number;
  rejectionReasons: Record<string, number>;
};
export type SourceOutcome = Counts & {
  sourceId: string;
  name: string;
  status: "completed" | "partial" | "failed";
  error?: string;
  candidatesTruncated: boolean;
  exhausted: boolean;
};
export type ScrapeSummary = Counts & {
  runId: string;
  status: "completed" | "partial" | "failed";
  sourcesChecked: number;
  durationMs: number;
  sources: SourceOutcome[];
};
export const emptyCounts = (): Counts => ({
  candidatesFound: 0,
  candidatesRejected: 0,
  duplicatesSkipped: 0,
  detailPagesScraped: 0,
  detailAttempts: 0,
  articlesInserted: 0,
  articlesRejected: 0,
  articlesFailed: 0,
  rejectionReasons: {},
});
const reason = (counts: Counts, value: string) => {
  counts.rejectionReasons[value] = (counts.rejectionReasons[value] ?? 0) + 1;
};
const safeError = (cause: unknown) =>
  cause instanceof ScrapeError ? cause.code : "database_or_pipeline_error";

export type Dependencies = {
  fetch: typeof fetchHtml;
  existing: typeof findExistingUrls;
  insert: typeof insertArticles;
  sources: typeof getActiveSources;
  log: typeof writeLog;
};
export const defaultDependencies: Dependencies = {
  fetch: fetchHtml,
  existing: findExistingUrls,
  insert: insertArticles,
  sources: getActiveSources,
  log: writeLog,
};
/**
 * Run logging (AGENTS §9): every event goes to the server console and the
 * `logs` table. `channel` names the pipeline step — "scrape" for manual runs,
 * "scheduled-results" for scheduler processing (§18).
 */
export function logger(
  runId: string,
  deps: Dependencies,
  channel = "scrape",
) {
  return async (
    event: string,
    context: Json,
    sourceId?: string,
    level: "info" | "warn" | "error" = "info",
  ) => {
    console[level](`[${channel}:${runId}] ${event}`, context);
    try {
      await deps.log({
        level,
        event: `${channel}.${event}`,
        context: { runId, details: context },
        source_id: sourceId,
      });
    } catch {
      console.error(`[${channel}] log persistence failed`);
    }
  };
}

/** The console + `logs` table writer that pipeline steps share. */
export type PipelineLogger = ReturnType<typeof logger>;

/** A zeroed per-source result, ready for `processSourceHomepage` to fill in. */
export function newSourceOutcome(source: SourceRow): SourceOutcome {
  return {
    ...emptyCounts(),
    sourceId: source.id,
    name: source.name,
    status: "completed",
    candidatesTruncated: false,
    exhausted: false,
  };
}

/** Shared homepage-to-insert path for manual scraping and scheduled results. */
export async function processSourceHomepage(
  source: SourceRow,
  page: HtmlPage,
  limit: number,
  result: SourceOutcome,
  log: PipelineLogger,
  deps: Dependencies = defaultDependencies,
  deadline = Date.now() + SCRAPE_LIMITS.runTimeoutMs,
): Promise<void> {
  const extracted = extractCandidates(page.html, source, page.url);
  result.candidatesFound = extracted.found;
  result.candidatesRejected = extracted.rejected;
  result.duplicatesSkipped = extracted.duplicates;
  result.rejectionReasons = extracted.reasons;
  result.candidatesTruncated = extracted.truncated;
  await log(
    "candidates_found",
    {
      found: extracted.found,
      rejected: extracted.rejected,
      duplicates: extracted.duplicates,
      truncated: extracted.truncated,
    },
    source.id,
  );
  if (extracted.rejected)
    await log("candidates_rejected", extracted.reasons, source.id);
  const existing = await deps.existing(extracted.candidates);
  for (const url of extracted.candidates) {
    if (Date.now() >= deadline) {
      result.error = "run_time_budget_exhausted";
      break;
    }
    if (
      result.articlesInserted >= limit ||
      result.detailAttempts >= limit * SCRAPE_LIMITS.attemptsPerArticle
    )
      break;
    if (existing.has(url)) {
      result.duplicatesSkipped++;
      await log("duplicate_skipped", { url }, source.id);
      continue;
    }
    result.detailAttempts++;
    try {
      const detail = await deps.fetch(source, url, deadline);
      result.detailPagesScraped++;
      await log("detail_scraped", { url }, source.id);
      const parsed = parseArticle(detail.html, source, url, detail.url);
      if (!parsed.ok) {
        result.articlesRejected++;
        reason(result, parsed.reason);
        await log(
          "article_rejected",
          { url, reason: parsed.reason },
          source.id,
        );
        continue;
      }
      const aliases = [url, parsed.article.canonical_url!];
      const stored = await deps.existing(aliases);
      if (aliases.some((alias) => existing.has(alias) || stored.has(alias))) {
        result.duplicatesSkipped++;
        aliases.forEach((alias) => existing.add(alias));
        await log(
          "duplicate_skipped",
          { url, canonical: parsed.article.canonical_url },
          source.id,
        );
        continue;
      }
      const inserted = await deps.insert([parsed.article]);
      aliases.forEach((alias) => existing.add(alias));
      if (!inserted.length) {
        result.duplicatesSkipped++;
        await log("duplicate_skipped", { url, concurrent: true }, source.id);
      } else {
        result.articlesInserted += inserted.length;
        await log(
          "article_inserted",
          { url, articleId: inserted[0].id },
          source.id,
        );
      }
    } catch (cause) {
      result.articlesFailed++;
      await log(
        "article_failed",
        { url, error: safeError(cause) },
        source.id,
        "error",
      );
    }
  }
  result.exhausted = result.articlesInserted < limit;
  if (result.exhausted)
    await log(
      "source_exhausted",
      {
        detailAttempts: result.detailAttempts,
        inserted: result.articlesInserted,
        requested: limit,
      },
      source.id,
    );
  result.status =
    result.error || result.articlesFailed
      ? result.detailPagesScraped
        ? "partial"
        : "failed"
      : "completed";
}

export async function runScrape(
  options: ScrapeOptions,
  deps: Dependencies = defaultDependencies,
): Promise<ScrapeSummary> {
  const started = Date.now();
  const deadline = started + SCRAPE_LIMITS.runTimeoutMs;
  const runId = randomUUID();
  const log = logger(runId, deps);
  const summary: ScrapeSummary = {
    ...emptyCounts(),
    runId,
    status: "completed",
    sourcesChecked: 0,
    durationMs: 0,
    sources: [],
  };
  let active: SourceRow[];
  try {
    active = await deps.sources();
  } catch (cause) {
    summary.status = "failed";
    summary.durationMs = Date.now() - started;
    await log(
      "failed",
      { ...summary, error: safeError(cause) },
      undefined,
      "error",
    );
    return summary;
  }
  if (
    options.sourceIds?.some((id) => !active.some((source) => source.id === id))
  )
    throw new InvalidSourceSelection("Unknown or inactive source ID");
  const selected = options.sourceIds
    ? active.filter((source) => options.sourceIds!.includes(source.id))
    : active;
  await log("started", {
    sources: selected.map((source) => source.name),
    articlesPerSource: options.articlesPerSource,
  });
  for (const source of selected) {
    summary.sourcesChecked++;
    const result = newSourceOutcome(source);
    summary.sources.push(result);
    await log("source_started", { name: source.name }, source.id);
    try {
      if (Date.now() >= deadline)
        throw new ScrapeError("run_time_budget_exhausted");
      if (
        !["bbc", "fox", "npr", "reuters", "guardian"].includes(
          source.parser_strategy ?? "",
        )
      )
        throw new ScrapeError("unsupported_parser_strategy");
      const page = await deps.fetch(source, source.listing_url, deadline);
      await log("homepage_fetched", { name: source.name }, source.id);
      await processSourceHomepage(
        source,
        page,
        options.articlesPerSource,
        result,
        log,
        deps,
        deadline,
      );
    } catch (cause) {
      result.status = "failed";
      result.error = safeError(cause);
      await log("source_failed", { error: result.error }, source.id, "error");
    }
    await log("source_completed", result, source.id);
    for (const key of [
      "candidatesFound",
      "candidatesRejected",
      "duplicatesSkipped",
      "detailPagesScraped",
      "detailAttempts",
      "articlesInserted",
      "articlesRejected",
      "articlesFailed",
    ] as const)
      summary[key] += result[key];
    for (const [key, value] of Object.entries(result.rejectionReasons))
      summary.rejectionReasons[key] =
        (summary.rejectionReasons[key] ?? 0) + value;
  }
  const failures = summary.sources.filter(
    (source) => source.status !== "completed",
  );
  summary.status = failures.length
    ? summary.sources.every((source) => source.status === "failed")
      ? "failed"
      : "partial"
    : "completed";
  summary.durationMs = Date.now() - started;
  await log(summary.status === "failed" ? "failed" : "completed", summary);
  return summary;
}
