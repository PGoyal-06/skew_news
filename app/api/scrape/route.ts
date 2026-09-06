import { isAdminRequest } from "@/lib/security/admin";
import {
  InvalidSourceSelection,
  runScrape,
  scrapeInput,
} from "@/lib/pipeline/scrape";

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
  const parsed = scrapeInput.safeParse(input);
  if (!parsed.success)
    return Response.json(
      {
        error: "Invalid scrape options",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  try {
    const summary = await runScrape(parsed.data);
    return Response.json(summary, {
      status: summary.status === "failed" ? 500 : 200,
    });
  } catch (cause) {
    if (cause instanceof InvalidSourceSelection)
      return Response.json({ error: cause.message }, { status: 400 });
    console.error("[scrape] unexpected pipeline failure");
    return Response.json({ error: "Scraping failed" }, { status: 500 });
  }
}
