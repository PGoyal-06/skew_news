import "server-only";

/**
 * Environment accessors for the Supabase layer (AGENTS §21).
 *
 * Server-only: `serviceRoleKey()` must never be reachable from browser code.
 */

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function serviceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}
