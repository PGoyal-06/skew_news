import { isCronRequest } from "@/lib/security/cron";
import { processScheduledResults } from "@/lib/pipeline/scheduler";
import { runAnalysis } from "@/lib/pipeline/analyze";

/**
 * `GET /api/cron/pipeline` — the automatic hourly pipeline (AGENTS §18).
 *
 * Vercel Cron fires this at 06:15 UTC, 15 minutes after the Oxylabs schedules
 * run at 06:00. Step one turns finished scheduled jobs into articles; step two
 * analyzes everything still pending. Step two runs even when step one fails —
 * there may be pre-existing unanalyzed articles (§18.6).
 *
 * Daily rather than hourly because Vercel Hobby crons cannot run more than once
 * a day; see `SCHEDULER_LIMITS.cronExpression` for the Pro settings.
 *
 * Hobby cron timing is only accurate to the hour (±59 min), so the 15-minute
 * gap is a floor, not a guarantee — any job Oxylabs has not finished is simply
 * left unprocessed and picked up on the next run.
 *
 * GET is the one exception to §14's POST rule: Vercel Cron only sends GET.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  console.info("[cron] pipeline started");

  let process_: unknown;
  let processFailed = false;
  try {
    const summary = await processScheduledResults();
    process_ = summary;
    processFailed = summary.status === "failed";
    console.info("[cron] step 1 — scheduled results", summary);
  } catch {
    processFailed = true;
    process_ = { status: "failed", error: "processing_failed" };
    console.error("[cron] step 1 — scheduled results failed");
  }

  let analysis: unknown;
  let analysisFailed = false;
  try {
    const summary = await runAnalysis({});
    analysis = summary;
    analysisFailed = summary.status === "failed";
    console.info("[cron] step 2 — analysis", summary);
  } catch {
    analysisFailed = true;
    analysis = { status: "failed", error: "analysis_failed" };
    console.error("[cron] step 2 — analysis failed");
  }

  const status =
    processFailed && analysisFailed
      ? "failed"
      : processFailed || analysisFailed
        ? "partial"
        : "completed";
  console.info(`[cron] pipeline ${status}`);

  return Response.json(
    { status, process: process_, analysis },
    { status: status === "failed" ? 500 : 200 },
  );
}
