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
  /** Oxylabs runs each source homepage at the top of every hour. */
  cronExpression: "0 * * * *",
  /**
   * Oxylabs requires an end_time and exposes no delete endpoint, so schedules
   * are created far-future and retired with PUT /schedules/{id}/state.
   */
  endTime: "2035-01-01 00:00:00",
  /** Most recent runs inspected per schedule when looking for finished jobs. */
  runsPerSchedule: 3,
  /** Unprocessed jobs processed per schedule per invocation (time budget). */
  jobsPerSchedule: 2,
  /** Wall-clock budget for one scheduled-results run, inside maxDuration=300. */
  runTimeoutMs: 240_000,
  /** Per-request timeout for Scheduler / Push-Pull API calls. */
  requestTimeoutMs: 30_000,
} as const;
