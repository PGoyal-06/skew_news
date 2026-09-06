import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serviceRoleKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

/**
 * The service-role Supabase client — the application's only database accessor.
 *
 * Auth is Clerk, not Supabase Auth (AGENTS §6), so no request carries a
 * Supabase user JWT and no browser client exists. Every table has RLS enabled
 * with no policies and no grants to `anon` / `authenticated`; the service role
 * bypasses RLS.
 *
 * NEVER import this module (or anything under `lib/supabase/queries/`) from a
 * client component. The `server-only` import above turns that mistake into a
 * build error rather than a leaked key (AGENTS §21).
 */

export type ServiceClient = SupabaseClient<Database>;

let client: ServiceClient | null = null;

export function getServiceClient(): ServiceClient {
  if (!client) {
    client = createClient<Database>(supabaseUrl(), serviceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}
