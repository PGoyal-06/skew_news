import "server-only";

import { getServiceClient } from "@/lib/supabase/service";
import type { LogInsert, LogRow } from "@/lib/supabase/types";

const LOG_COLUMNS =
  "id, created_at, level, event, message, context, source_id, article_id";

/**
 * Persist one pipeline log entry (AGENTS §9 run logging).
 *
 * Never throws: losing a log line must not abort a scrape or analysis run, so a
 * failure is reported to the server console and swallowed.
 */
export async function writeLog(entry: LogInsert): Promise<void> {
  try {
    const { error } = await getServiceClient().from("logs").insert(entry);

    if (error) {
      console.error(`[logs] failed to write "${entry.event}": ${error.message}`);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[logs] failed to write "${entry.event}": ${message}`);
  }
}

export async function getRecentLogs({
  limit,
}: {
  limit: number;
}): Promise<LogRow[]> {
  const { data, error } = await getServiceClient()
    .from("logs")
    .select(LOG_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load logs: ${error.message}`);
  }

  return data ?? [];
}
