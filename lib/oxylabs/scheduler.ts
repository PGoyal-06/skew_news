import "server-only";
import { z } from "zod";
import {
  quoteBigIntIds,
  responseText,
  ScrapeError,
  type HtmlPage,
} from "@/lib/oxylabs/client";
import { SCHEDULER_LIMITS } from "@/lib/pipeline/limits";
import { sourceUrl } from "@/lib/parsing/urls";
import type { SourceRow } from "@/lib/supabase/types";

/**
 * Oxylabs Scheduler + Push-Pull client (AGENTS §18).
 *
 * Endpoint paths and field names come from the live docs
 * (https://developers.oxylabs.io/products/web-scraper-api/features/scheduler),
 * not from memory.
 *
 * Every ID crosses this boundary as a `string`. Responses are read as raw text
 * and passed through `quoteBigIntIds` before `JSON.parse`, because Oxylabs
 * schedule and job IDs are 64-bit integers that `JSON.parse` would corrupt.
 */

const BASE = "https://data.oxylabs.io/v1";

/** A 64-bit ID that survived `quoteBigIntIds` as an exact digit string. */
const bigIntId = z.string().regex(/^\d+$/);

const scheduleSchema = z.object({ schedule_id: bigIntId });
const scheduleListSchema = z.object({
  schedules: z.array(z.union([bigIntId, z.object({ id: bigIntId })])),
});
const runsSchema = z.object({
  runs: z
    .array(
      z.object({
        run_id: z.string().optional(),
        jobs: z
          .array(
            z.object({
              id: bigIntId,
              result_status: z.string().nullish(),
              created_at: z.string().nullish(),
              result_created_at: z.string().nullish(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
const jobResultsSchema = z.object({
  results: z
    .array(
      z.object({
        content: z.string(),
        url: z.string().nullish(),
        status_code: z.number().nullish(),
      }),
    )
    .min(1),
});

export type ScheduleJob = {
  jobId: string;
  resultStatus: string | null;
  runAt: string | null;
};

function authHeader(): string {
  const username = process.env.OXY_WSA_USERNAME;
  const password = process.env.OXY_WSA_PASSWORD;
  if (!username || !password)
    throw new ScrapeError("missing_oxylabs_configuration");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/** One Scheduler API call: raw text in, validated JSON out. */
async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown } = { method: "GET" },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init.method,
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(SCHEDULER_LIMITS.requestTimeoutMs),
    });
  } catch (cause) {
    if (cause instanceof ScrapeError) throw cause;
    throw new ScrapeError("oxylabs_network_or_timeout");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ScrapeError(`oxylabs_http_${response.status}`);
  }
  const raw = quoteBigIntIds(await responseText(response));
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ScrapeError("invalid_provider_json");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ScrapeError("invalid_provider_response");
  return parsed.data;
}

/** `POST /v1/schedules` — one homepage item, hourly. Returns the exact ID. */
export async function createSchedule(url: string): Promise<string> {
  const created = await call("/schedules", scheduleSchema, {
    method: "POST",
    body: {
      cron: SCHEDULER_LIMITS.cronExpression,
      end_time: SCHEDULER_LIMITS.endTime,
      items: [
        {
          source: "universal",
          url,
          context: [{ key: "follow_redirects", value: false }],
        },
      ],
    },
  });
  return created.schedule_id;
}

/** `GET /v1/schedules` — every schedule ID Oxylabs currently holds. */
export async function listScheduleIds(): Promise<string[]> {
  const listed = await call("/schedules", scheduleListSchema);
  return listed.schedules.map((entry) =>
    typeof entry === "string" ? entry : entry.id,
  );
}

/**
 * `GET /v1/schedules/{id}/runs` — jobs with a per-job `result_status`.
 * `/jobs` is deliberately not used: it carries no status (§18).
 */
export async function getScheduleJobs(
  scheduleId: string,
  runs = SCHEDULER_LIMITS.runsPerSchedule,
): Promise<ScheduleJob[]> {
  const listed = await call(`/schedules/${scheduleId}/runs`, runsSchema);
  return listed.runs.slice(-runs).flatMap((run) =>
    run.jobs.map((job) => ({
      jobId: job.id,
      resultStatus: job.result_status ?? null,
      runAt: job.result_created_at ?? job.created_at ?? null,
    })),
  );
}

/** `PUT /v1/schedules/{id}/state` — the only way to retire a schedule. */
export async function setScheduleState(
  scheduleId: string,
  active: boolean,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/schedules/${scheduleId}/state`, {
      method: "PUT",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({ active }),
      signal: AbortSignal.timeout(SCHEDULER_LIMITS.requestTimeoutMs),
    });
  } catch (cause) {
    if (cause instanceof ScrapeError) throw cause;
    throw new ScrapeError("oxylabs_network_or_timeout");
  }
  await response.body?.cancel();
  // 202 with an empty body on success — nothing to parse.
  if (!response.ok) throw new ScrapeError(`oxylabs_http_${response.status}`);
}

/**
 * `GET /v1/queries/{job_id}/results` — the homepage HTML a scheduled job
 * captured, shaped like a live `fetchHtml` result so it drops straight into
 * `processSourceHomepage`.
 */
export async function getJobHomepage(
  jobId: string,
  source: SourceRow,
): Promise<HtmlPage> {
  const fetched = await call(`/queries/${jobId}/results`, jobResultsSchema);
  const result = fetched.results[0];
  if (result.status_code != null && result.status_code !== 200)
    throw new ScrapeError(`target_http_${result.status_code}`);
  if (!result.content.trim()) throw new ScrapeError("empty_provider_content");
  if (!/<(?:html|article|main|body|head)\b/i.test(result.content))
    throw new ScrapeError("non_html_result");
  const url = sourceUrl(result.url ?? source.listing_url, source);
  if (!url) throw new ScrapeError("unsafe_result_url");
  return { html: result.content, url };
}
