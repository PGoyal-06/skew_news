import "server-only";

import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

import {
  ANALYSIS_ATTEMPTS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  MAX_EMBEDDING_CHARS,
} from "@/lib/ai/config";

/**
 * Article embeddings for pgvector similarity search (AGENTS §20).
 *
 * `server-only` for the same reason as `lib/ai/analysis.ts`: `OPENAI_API_KEY`
 * must never reach browser code, and no model call may originate there (§21).
 */

export type EmbeddingInput = {
  title: string;
  text: string;
};

export type EmbeddingResult =
  | { ok: true; embedding: number[]; model: string }
  | { ok: false; reason: string };

/** The title carries the story's subject; the body carries its substance. */
function embeddingValue({ title, text }: EmbeddingInput): string {
  return `${title}\n\n${text}`.slice(0, MAX_EMBEDDING_CHARS);
}

/**
 * Embed one article, retrying once on failure — the same attempt budget as
 * analysis (§19).
 *
 * Never throws: a failure is returned as a typed result so one article cannot
 * abort a run. A vector of unexpected width is treated as a failure rather than
 * written, because the column's `vector(1536)` would reject it anyway.
 */
export async function embedArticle(
  input: EmbeddingInput,
): Promise<EmbeddingResult> {
  for (let attempt = 1; attempt <= ANALYSIS_ATTEMPTS; attempt++) {
    try {
      const { embedding } = await embed({
        model: openai.embedding(EMBEDDING_MODEL),
        value: embeddingValue(input),
      });

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`,
        );
      }

      return { ok: true, embedding, model: EMBEDDING_MODEL };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.warn(
        `[embedding] attempt ${attempt}/${ANALYSIS_ATTEMPTS} failed: ${message}`,
      );
    }
  }

  return { ok: false, reason: "embedding_call_failed" };
}
