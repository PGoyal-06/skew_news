import "server-only";
import { randomUUID } from "node:crypto";

import { ScrapeError } from "@/lib/oxylabs/client";
import {
  createSchedule,
  getJobHomepage,
  getScheduleJobs,
  listScheduleIds,
  setScheduleState,
} from "@/lib/oxylabs/scheduler";
import {
  getActiveSchedules,
  getSchedules,
  getUnprocessedJobIds,
  insertSchedule,
  markJobProcessed,
  recordScheduleRuns,
  setScheduleActive,
} from "@/lib/supabase/queries/schedules";
import { getActiveSources } from "@/lib/supabase/queries/sources";
import type { SourceRow } from "@/lib/supabase/types";
import { SCHEDULER_LIMITS, SCRAPE_LIMITS } from "./limits";
import {
  defaultDependencies,
  emptyCounts,
  logger,
  newSourceOutcome,
  processSourceHomepage,
  type Counts,
  type Dependencies,
  type SourceOutcome,
} from "./scrape";

/**
 * Oxylabs Scheduler orchestration (AGENTS §18).
 *
 * Two entry points:
 *   - `syncSchedules()` — one Oxylabs schedule per active source, plus orphan
 *     deactivation.
 *   - `processScheduledResults()` — turns finished scheduled homepage jobs into
 *     articles by running the *same* scrape-to-insert path as manual scraping
 *     (`processSourceHomepage`); nothing about validation, cleanup, dedupe, or
 *     run logging is duplicated here.
 */

const safeError = (cause: unknown) =>
  cause instanceof ScrapeError ? cause.code : "database_or_pipeline_error";

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type ScheduleOutcome = {
  sourceId: string;
  name: string;
  status: "created" | "existing" | "failed";
  scheduleId?: string;
  error?: string;
};

export type SyncSummary = {
  runId: string;
  status: "completed" | "partial" | "failed";
  sourcesChecked: number;
  created: number;
  existing: number;
  deactivated: number;
  orphansDeactivated: number;
  failed: number;
  durationMs: number;
  schedules: ScheduleOutcome[];
};

/**
 * Create the missing hourly schedules, retire the ones whose source is no
 * longer active, then sweep orphans left on Oxylabs (§18).
 */
export async function syncSchedules(): Promise<SyncSummary> {
  const started = Date.now();
  const runId = randomUUID();
  const log = logger(runId, defaultDependencies, "schedule-sync");
  const summary: SyncSummary = {
    runId,
    status: "completed",
    sourcesChecked: 0,
    created: 0,
    existing: 0,
    deactivated: 0,
    orphansDeactivated: 0,
    failed: 0,
    durationMs: 0,
    schedules: [],
  };

  let sources: SourceRow[];
  let stored: Awaited<ReturnType<typeof getSchedules>>;
  try {
    [sources, stored] = await Promise.all([getActiveSources(), getSchedules()]);
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

  summary.sourcesChecked = sources.length;
  await log("started", { sources: sources.map((source) => source.name) });

  for (const source of sources) {
    const existing = stored.find(
      (schedule) => schedule.source_id === source.id && schedule.is_active,
    );
    if (existing) {
      summary.existing++;
      summary.schedules.push({
        sourceId: source.id,
        name: source.name,
        status: "existing",
        scheduleId: existing.schedule_id,
      });
      continue;
    }
    try {
      const scheduleId = await createSchedule(source.listing_url);
      await insertSchedule({
        source_id: source.id,
        schedule_id: scheduleId,
        cron_expression: SCHEDULER_LIMITS.cronExpression,
      });
      summary.created++;
      summary.schedules.push({
        sourceId: source.id,
        name: source.name,
        status: "created",
        scheduleId,
      });
      await log("schedule_created", { scheduleId }, source.id);
    } catch (cause) {
      summary.failed++;
      const error = safeError(cause);
      summary.schedules.push({
        sourceId: source.id,
        name: source.name,
        status: "failed",
        error,
      });
      await log("schedule_failed", { error }, source.id, "error");
    }
  }

  // Sources that went inactive keep their Oxylabs schedule running (and
  // billing) until it is deactivated here.
  const activeSourceIds = new Set(sources.map((source) => source.id));
  for (const schedule of stored) {
    if (!schedule.is_active || activeSourceIds.has(schedule.source_id))
      continue;
    try {
      await setScheduleState(schedule.schedule_id, false);
      await setScheduleActive(schedule.schedule_id, false);
      summary.deactivated++;
      await log("schedule_deactivated", {
        scheduleId: schedule.schedule_id,
        reason: "source_inactive",
      });
    } catch (cause) {
      summary.failed++;
      await log(
        "schedule_deactivate_failed",
        { scheduleId: schedule.schedule_id, error: safeError(cause) },
        undefined,
        "error",
      );
    }
  }

  // Orphan sweep (§18): anything live on Oxylabs that this database does not
  // track as active is stopped.
  try {
    const [remote, current] = await Promise.all([
      listScheduleIds(),
      getSchedules(),
    ]);
    const known = new Set(
      current
        .filter((schedule) => schedule.is_active)
        .map((schedule) => schedule.schedule_id),
    );
    for (const scheduleId of remote) {
      if (known.has(scheduleId)) continue;
      try {
        await setScheduleState(scheduleId, false);
        summary.orphansDeactivated++;
        await log("orphan_deactivated", { scheduleId });
      } catch (cause) {
        summary.failed++;
        await log(
          "orphan_deactivate_failed",
          { scheduleId, error: safeError(cause) },
          undefined,
          "error",
        );
      }
    }
  } catch (cause) {
    summary.failed++;
    await log(
      "orphan_sweep_failed",
      { error: safeError(cause) },
      undefined,
      "error",
    );
  }

  summary.status = !summary.failed
    ? "completed"
    : summary.created || summary.existing
      ? "partial"
      : "failed";
  summary.durationMs = Date.now() - started;
  await log(summary.status === "failed" ? "failed" : "completed", summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Scheduled result processing
// ---------------------------------------------------------------------------

export type ProcessSummary = Counts & {
  runId: string;
  status: "completed" | "partial" | "failed";
  sourcesChecked: number;
  jobsFound: number;
  jobsProcessed: number;
  jobsSkipped: number;
  jobsFailed: number;
  durationMs: number;
  sources: SourceOutcome[];
};

/**
 * Turn finished scheduled homepage jobs into articles.
 *
 * Same pipeline as manual scraping; the only difference is where the homepage
 * HTML comes from — a completed Oxylabs job instead of a live fetch (§18).
 */
export async function processScheduledResults(
  deps: Dependencies = defaultDependencies,
): Promise<ProcessSummary> {
  const started = Date.now();
  const deadline = started + SCHEDULER_LIMITS.runTimeoutMs;
  const runId = randomUUID();
  const log = logger(runId, deps, "scheduled-results");
  const summary: ProcessSummary = {
    ...emptyCounts(),
    runId,
    status: "completed",
    sourcesChecked: 0,
    jobsFound: 0,
    jobsProcessed: 0,
    jobsSkipped: 0,
    jobsFailed: 0,
    durationMs: 0,
    sources: [],
  };

  let schedules: Awaited<ReturnType<typeof getActiveSchedules>>;
  let sources: SourceRow[];
  try {
    [schedules, sources] = await Promise.all([
      getActiveSchedules(),
      deps.sources(),
    ]);
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

  await log("started", { schedules: schedules.length });

  const accumulate = (result: SourceOutcome) => {
    summary.sources.push(result);
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
  };

  for (const schedule of schedules) {
    const source = sources.find((row) => row.id === schedule.source_id);
    if (!source) {
      summary.jobsSkipped++;
      await log("source_inactive", { scheduleId: schedule.schedule_id });
      continue;
    }
    summary.sourcesChecked++;
    await log("source_started", { name: source.name }, source.id);

    let pending: string[];
    try {
      if (Date.now() >= deadline)
        throw new ScrapeError("run_time_budget_exhausted");

      const jobs = await getScheduleJobs(schedule.schedule_id);
      summary.jobsFound += jobs.length;
      await recordScheduleRuns(
        jobs.map((job) => ({
          schedule_id: schedule.schedule_id,
          job_id: job.jobId,
          result_status: job.resultStatus,
          run_at: job.runAt,
        })),
      );
      const done = jobs.filter((job) => job.resultStatus === "done").length;
      summary.jobsSkipped += jobs.length - done;
      await log(
        "jobs_recorded",
        { found: jobs.length, done, skipped: jobs.length - done },
        source.id,
      );

      pending = await getUnprocessedJobIds(
        schedule.schedule_id,
        SCHEDULER_LIMITS.jobsPerSchedule,
      );
    } catch (cause) {
      const result = newSourceOutcome(source);
      result.status = "failed";
      result.error = safeError(cause);
      accumulate(result);
      await log("source_failed", { error: result.error }, source.id, "error");
      continue;
    }

    if (!pending.length)
      await log(
        "no_unprocessed_jobs",
        { scheduleId: schedule.schedule_id },
        source.id,
      );

    // One outcome per job: `processSourceHomepage` fills a fresh result, so
    // jobs must not share one.
    for (const jobId of pending) {
      if (Date.now() >= deadline) break;
      const result = newSourceOutcome(source);
      try {
        const page = await getJobHomepage(jobId, source);
        await log("homepage_fetched", { jobId, name: source.name }, source.id);
        // Scheduled homepage HTML is never saved as an article: it only ever
        // feeds candidate extraction here (§18).
        await processSourceHomepage(
          source,
          page,
          SCRAPE_LIMITS.defaultArticlesPerSource,
          result,
          log,
          deps,
          deadline,
        );
        await markJobProcessed(jobId);
        summary.jobsProcessed++;
      } catch (cause) {
        summary.jobsFailed++;
        result.error = safeError(cause);
        result.status = result.detailPagesScraped ? "partial" : "failed";
        await log("job_failed", { jobId, error: result.error }, source.id, "error");
      }
      accumulate(result);
      await log("job_completed", result, source.id);
    }
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
