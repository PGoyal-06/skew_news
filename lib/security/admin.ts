import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function isAdminRequest(request: Request): boolean {
  const expected = process.env.BIASLY_ADMIN_SECRET;
  const supplied = request.headers.get("x-biasly-admin-secret");
  if (!expected?.trim() || !supplied) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(expected), hash(supplied));
}
