import { isAdminRequest } from "@/lib/security/admin";
import { processScheduledResults } from "@/lib/pipeline/scheduler";

/**
 * `POST /api/oxylabs/scheduled-results/process` — on-demand processing of
 * completed Oxylabs scheduled jobs (AGENTS §14, §15, §18).
 *
 * The automatic path is `GET /api/cron/pipeline`; this route exists so the same
 * work can be triggered manually before Vercel Cron is configured.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAdminRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await processScheduledResults();
    return Response.json(summary, {
      status: summary.status === "failed" ? 500 : 200,
    });
  } catch {
    console.error("[scheduled-results] unexpected pipeline failure");
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
