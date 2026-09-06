import "server-only";

import { getServiceClient } from "@/lib/supabase/service";
import type { SourceRow } from "@/lib/supabase/types";

const SOURCE_COLUMNS =
  "id, name, listing_url, parser_strategy, logo_url, is_active, created_at, updated_at";

/**
 * Active scrape targets (AGENTS §8): only these are scraped or scheduled.
 * Source URLs always come from this table — never hardcoded (§7).
 */
export async function getActiveSources(): Promise<SourceRow[]> {
  const { data, error } = await getServiceClient()
    .from("sources")
    .select(SOURCE_COLUMNS)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active sources: ${error.message}`);
  }

  return data ?? [];
}

export async function getSourceById(id: string): Promise<SourceRow | null> {
  const { data, error } = await getServiceClient()
    .from("sources")
    .select(SOURCE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load source ${id}: ${error.message}`);
  }

  return data;
}

export async function getSourcesByIds(ids: string[]): Promise<SourceRow[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await getServiceClient()
    .from("sources")
    .select(SOURCE_COLUMNS)
    .in("id", [...new Set(ids)])
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load sources: ${error.message}`);
  }

  return data ?? [];
}
