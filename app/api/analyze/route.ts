import { isAdminRequest } from "@/lib/security/admin";
import { analyzeInput, runAnalysis } from "@/lib/pipeline/analyze";

/**
 * `POST /api/analyze` — AI analysis (AGENTS §14, §15, §19).
 *
 * Thin handler: auth, input parsing, and shape only. All orchestration lives in
 * `lib/pipeline/analyze.ts`.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAdminRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 16_384)
      return Response.json(
        { error: "Request body too large" },
        { status: 400 },
      );
    input = body.trim() ? JSON.parse(body) : {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = analyzeInput.safeParse(input);
  if (!parsed.success)
    return Response.json(
      {
        error: "Invalid analysis options",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  try {
    const summary = await runAnalysis(parsed.data);
    return Response.json(summary, {
      status: summary.status === "failed" ? 500 : 200,
    });
  } catch {
    // Model and database error text stays server-side (§21).
    console.error("[analysis] unexpected pipeline failure");
    return Response.json({ error: "Analysis failed" }, { status: 500 });
  }
}
