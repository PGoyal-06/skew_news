import "server-only";
import { z } from "zod";
import { SCRAPE_LIMITS } from "@/lib/pipeline/limits";
import { sourceUrl } from "@/lib/parsing/urls";
import type { SourceRow } from "@/lib/supabase/types";

export class ScrapeError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export type HtmlPage = { html: string; url: string };

/**
 * Oxylabs `id`, `job_id`, `schedule_id`, and `run_id` values are 64-bit
 * integers past `Number.MAX_SAFE_INTEGER`; `JSON.parse` silently corrupts their
 * last digits (AGENTS §18). Quote them in the raw response text *before*
 * parsing so the exact digit sequence survives as a string.
 */
export function quoteBigIntIds(raw: string): string {
  return raw.replace(
    /("(?:id|job_id|schedule_id|run_id)"\s*:\s*)(\d+)/g,
    '$1"$2"',
  );
}
const resultSchema = z.object({
  results: z
    .array(
      z.object({
        content: z.string(),
        status_code: z.number(),
        url: z.string(),
      }),
    )
    .min(1),
});

/**
 * Read a response body as text under `SCRAPE_LIMITS.maxResponseBytes`.
 * Shared with the Scheduler client (`lib/oxylabs/scheduler.ts`).
 */
export async function responseText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new ScrapeError("empty_provider_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SCRAPE_LIMITS.maxResponseBytes)
        throw new ScrapeError("provider_response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchHtml(
  source: SourceRow,
  target: string,
  deadline = Date.now() + SCRAPE_LIMITS.requestTimeoutMs * 2,
): Promise<HtmlPage> {
  const url = sourceUrl(target, source);
  if (!url) throw new ScrapeError("unsafe_source_url");
  const username = process.env.OXY_WSA_USERNAME;
  const password = process.env.OXY_WSA_PASSWORD;
  if (!username || !password)
    throw new ScrapeError("missing_oxylabs_configuration");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new ScrapeError("run_time_budget_exhausted");
      const response = await fetch("https://realtime.oxylabs.io/v1/queries", {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        },
        body: JSON.stringify({
          source: "universal",
          url,
          context: [{ key: "follow_redirects", value: false }],
        }),
        signal: AbortSignal.timeout(
          Math.min(SCRAPE_LIMITS.requestTimeoutMs, remaining),
        ),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw new ScrapeError(`oxylabs_http_${response.status}`);
      }
      const raw = quoteBigIntIds(await responseText(response));
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new ScrapeError("invalid_provider_json");
      }
      const parsed = resultSchema.safeParse(value);
      if (!parsed.success) throw new ScrapeError("invalid_provider_response");
      const result = parsed.data.results[0];
      if (result.status_code !== 200) {
        if (
          attempt === 0 &&
          (result.status_code === 429 || result.status_code >= 500)
        )
          continue;
        throw new ScrapeError(`target_http_${result.status_code}`);
      }
      if (!result.content.trim())
        throw new ScrapeError("empty_provider_content");
      const finalUrl = sourceUrl(result.url, source);
      if (!finalUrl) throw new ScrapeError("unsafe_result_url");
      if (!/<(?:html|article|main|body|head)\b/i.test(result.content))
        throw new ScrapeError("non_html_result");
      return { html: result.content, url: finalUrl };
    } catch (cause) {
      if (cause instanceof ScrapeError) throw cause;
      if (attempt === 1) throw new ScrapeError("oxylabs_network_or_timeout");
    }
  }
  throw new ScrapeError("oxylabs_unavailable");
}
