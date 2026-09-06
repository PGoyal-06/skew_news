import { isAdminRequest } from "@/lib/security/admin";
import { syncSchedules } from "@/lib/pipeline/scheduler";
import { getSchedules } from "@/lib/supabase/queries/schedules";

/**
 * `POST /api/oxylabs/schedules` — create one Oxylabs schedule per active source
 * and sweep orphans (AGENTS §14, §15, §18).
 * `GET` — read the stored schedule rows.
 *
 * Thin handler: auth and shape only; orchestration lives in
 * `lib/pipeline/scheduler.ts`.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAdminRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await syncSchedules();
    return Response.json(summary, {
      status: summary.status === "failed" ? 500 : 200,
    });
  } catch {
    // Provider and database detail stays server-side (§21).
    console.error("[schedule-sync] unexpected pipeline failure");
    return Response.json({ error: "Schedule sync failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isAdminRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ schedules: await getSchedules() });
  } catch {
    return Response.json(
      { error: "Unable to load schedules" },
      { status: 500 },
    );
  }
}
