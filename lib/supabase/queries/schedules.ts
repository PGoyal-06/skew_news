import "server-only";

import { getServiceClient } from "@/lib/supabase/service";
import type {
  OxylabsScheduleRow,
  OxylabsScheduleRunRow,
} from "@/lib/supabase/types";

/**
 * Oxylabs Scheduler persistence (AGENTS §18).
 *
 * `schedule_id` and `job_id` are TEXT everywhere: they are 64-bit Oxylabs IDs
 * that must never become JavaScript numbers.
 */

const SCHEDULE_COLUMNS =
  "id, source_id, schedule_id, cron_expression, is_active, created_at, updated_at";

const RUN_COLUMNS =
  "id, schedule_id, job_id, result_status, run_at, processed_at, created_at";

export async function getSchedules(): Promise<OxylabsScheduleRow[]> {
  const { data, error } = await getServiceClient()
    .from("oxylabs_schedules")
    .select(SCHEDULE_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load schedules: ${error.message}`);

  return data ?? [];
}

export async function getActiveSchedules(): Promise<OxylabsScheduleRow[]> {
  return (await getSchedules()).filter((schedule) => schedule.is_active);
}

export async function insertSchedule(entry: {
  source_id: string;
  schedule_id: string;
  cron_expression: string;
}): Promise<OxylabsScheduleRow> {
  const { data, error } = await getServiceClient()
    .from("oxylabs_schedules")
    .upsert({ ...entry, is_active: true }, { onConflict: "source_id" })
    .select(SCHEDULE_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to save schedule: ${error.message}`);

  return data;
}

export async function setScheduleActive(
  scheduleId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await getServiceClient()
    .from("oxylabs_schedules")
    .update({ is_active: isActive })
    .eq("schedule_id", scheduleId);

  if (error)
    throw new Error(`Failed to update schedule ${scheduleId}: ${error.message}`);
}

/**
 * Record the jobs a run reported. Existing rows keep their `processed_at`, so
 * a job is never re-processed; only the status is refreshed.
 */
export async function recordScheduleRuns(
  entries: {
    schedule_id: string;
    job_id: string;
    result_status: string | null;
    run_at: string | null;
  }[],
): Promise<void> {
  if (entries.length === 0) return;

  const { error } = await getServiceClient()
    .from("oxylabs_schedule_runs")
    .upsert(entries, { onConflict: "job_id", ignoreDuplicates: false });

  if (error)
    throw new Error(`Failed to record schedule runs: ${error.message}`);
}

/** Jobs recorded for a schedule that have not been processed yet. */
export async function getUnprocessedJobIds(
  scheduleId: string,
  limit: number,
): Promise<string[]> {
  const { data, error } = await getServiceClient()
    .from("oxylabs_schedule_runs")
    .select("job_id")
    .eq("schedule_id", scheduleId)
    .eq("result_status", "done")
    .is("processed_at", null)
    .order("run_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error)
    throw new Error(`Failed to load unprocessed jobs: ${error.message}`);

  return (data ?? []).map((row) => row.job_id);
}

export async function markJobProcessed(jobId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from("oxylabs_schedule_runs")
    .update({ processed_at: new Date().toISOString() })
    .eq("job_id", jobId);

  if (error)
    throw new Error(`Failed to mark job ${jobId} processed: ${error.message}`);
}

export async function getRecentScheduleRuns({
  limit,
}: {
  limit: number;
}): Promise<OxylabsScheduleRunRow[]> {
  const { data, error } = await getServiceClient()
    .from("oxylabs_schedule_runs")
    .select(RUN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load schedule runs: ${error.message}`);

  return data ?? [];
}
