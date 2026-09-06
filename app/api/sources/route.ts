import { getActiveSources } from "@/lib/supabase/queries/sources";
export const runtime = "nodejs";
export async function GET() {
  try {
    const sources = await getActiveSources();
    return Response.json({
      sources: sources.map(({ id, name, listing_url, parser_strategy }) => ({
        id,
        name,
        listing_url,
        parser_strategy,
      })),
    });
  } catch {
    return Response.json({ error: "Unable to load sources" }, { status: 500 });
  }
}
