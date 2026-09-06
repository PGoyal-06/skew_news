/**
 * pgvector literal conversion (AGENTS §20).
 *
 * PostgREST has no JSON representation for `vector`: it renders a column as its
 * Postgres literal (`"[0.1,-0.2,…]"`) and accepts the same form on write. Both
 * conversions live here so the string form never leaks into pipeline or UI code.
 */

import { EMBEDDING_DIMENSIONS } from "@/lib/ai/config";

/** `[0.1, -0.2]` → `"[0.1,-0.2]"`, the literal Postgres parses as a vector. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Parse a stored vector literal back into numbers.
 *
 * Returns `null` for anything that is not a vector of the expected width, so a
 * malformed value degrades to "no embedding" instead of a broken similarity
 * query.
 */
export function parseVectorLiteral(literal: string | null): number[] | null {
  if (!literal) {
    return null;
  }

  const inner = literal.trim().replace(/^\[/u, "").replace(/\]$/u, "");
  const values = inner.split(",").map(Number);

  if (values.length !== EMBEDDING_DIMENSIONS || values.some(Number.isNaN)) {
    return null;
  }

  return values;
}
