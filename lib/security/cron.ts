import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * `GET /api/cron/pipeline` guard (AGENTS §18).
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` and injects
 * `CRON_SECRET` itself — it is never added to `.env.local`, and
 * `BIASLY_ADMIN_SECRET` is deliberately not accepted here.
 *
 * Outside production the check is skipped so the route can be tested manually.
 */
export function isCronRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected?.trim() || !supplied) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(expected), hash(supplied));
}
