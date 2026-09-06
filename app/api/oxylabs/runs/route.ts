import { z } from "zod";
import { isAdminRequest } from "@/lib/security/admin";
import { getRecentScheduleRuns } from "@/lib/supabase/queries/schedules";

/** `GET /api/oxylabs/runs` — recorded scheduled jobs, newest first (§14, §18). */

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .safeParse(new URL(request.url).searchParams.get("limit") ?? 50);
  if (!limit.success)
    return Response.json(
      { error: "limit must be an integer from 1 to 100" },
      { status: 400 },
    );
  try {
    return Response.json({
      runs: await getRecentScheduleRuns({ limit: limit.data }),
    });
  } catch {
    return Response.json({ error: "Unable to load runs" }, { status: 500 });
  }
}
