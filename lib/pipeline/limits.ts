export const SCRAPE_LIMITS = {
  defaultArticlesPerSource: 5,
  maxArticlesPerSource: 20,
  candidatesPerSource: 200,
  attemptsPerArticle: 10,
  runTimeoutMs: 270_000,
  requestTimeoutMs: 180_000,
  maxResponseBytes: 15_000_000,
} as const;

/** Oxylabs Scheduler + Vercel Cron limits (AGENTS §18). */
export const SCHEDULER_LIMITS = {
  /**
   * Oxylabs scrapes each source homepage once a day at 06:00 UTC.
   *
   * Daily, not hourly, because Vercel Hobby crons cannot run more than once a
   * day — an hourly `vercel.json` entry fails at deploy time. Scraping more
   * often than the pipeline can drain would just bill for jobs nobody
   * processes. On Vercel Pro, set this to `0 * * * *` and `vercel.json` to
   * `15 * * * *` for the hourly cadence of AGENTS §18.
   */
  cronExpression: "0 6 * * *",
  /**
   * Oxylabs requires an end_time and exposes no delete endpoint, so schedules
   * are created far-future and retired with PUT /schedules/{id}/state.
   */
  endTime: "2035-01-01 00:00:00",
  /** Most recent runs inspected per schedule when looking for finished jobs. */
  runsPerSchedule: 3,
  /**
   * Unprocessed jobs drained per schedule per invocation. A daily schedule
   * produces one job per day, so 2 lets a single missed run catch up without
   * risking the 300s function budget.
   */
  jobsPerSchedule: 2,
  /** Wall-clock budget for one scheduled-results run, inside maxDuration=300. */
  runTimeoutMs: 240_000,
  /** Per-request timeout for Scheduler / Push-Pull API calls. */
  requestTimeoutMs: 30_000,
} as const;
