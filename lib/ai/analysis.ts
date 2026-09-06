import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  ANALYSIS_ATTEMPTS,
  ANALYSIS_MODEL,
  MAX_ARTICLE_CHARS,
} from "@/lib/ai/config";

/**
 * The only module that talks to the model (AGENTS §5).
 *
 * `server-only`: `OPENAI_API_KEY` must never reach browser code, and no model
 * call may originate there (§21).
 *
 * AI SDK v7 note — `generateObject` is deprecated in the installed version
 * (`node_modules/ai/dist/index.d.ts`: "Use `generateText` with an `output`
 * setting instead"). Structured output is `generateText` + `Output.object()`.
 */

/**
 * Exactly the fields the model produces. `biasScore` is absent on purpose: it
 * is derived from the percentages by the caller (§19), never asked for.
 */
const analysisFields = z.object({
  summary: z.string().min(1),
  sentimentScore: z.number().min(-1).max(1),
  sentimentLabel: z.enum(["positive", "neutral", "negative"]),
  politicalFramingLabel: z.enum([
    "left",
    "center",
    "right",
    "mixed",
    "unclear",
  ]),
  leftPercentage: z.number().int().min(0).max(100),
  centerPercentage: z.number().int().min(0).max(100),
  rightPercentage: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  framingNotes: z.string(),
  loadedTerms: z.array(z.string()),
  disclaimer: z.string(),
});

/**
 * The full contract, including the §19 rule that the three percentages sum to
 * exactly 100.
 *
 * The refinement lives here rather than on the schema handed to the model:
 * a cross-field constraint cannot be expressed in JSON Schema, so the provider
 * would silently drop it. Checking it after generation turns a bad sum into a
 * validation failure — one retry, then a counted failure with nothing saved.
 * Normalizing silently would hide model drift and the database CHECK would
 * reject the row anyway.
 */
export const analysisOutput = analysisFields.refine(
  (value) =>
    value.leftPercentage + value.centerPercentage + value.rightPercentage ===
    100,
  { message: "left, center and right percentages must sum to 100" },
);

export type AnalysisOutput = z.infer<typeof analysisOutput>;

export type AnalysisInput = {
  title: string;
  sourceName: string;
  text: string;
};

export type AnalysisResult =
  | { ok: true; output: AnalysisOutput; model: string }
  | { ok: false; reason: string };

const SYSTEM_PROMPT = `You analyze a single news article and report reader-facing framing insights.

Summary:
- Write a short, neutral summary of what the article reports. Describe the article; do not editorialize, praise, or criticize.

Political framing (an AI estimate, never stated as objective truth):
- Judge framing from the article text alone: word choice, which claims are asserted versus attributed, whose voices are quoted, and what context is included or omitted.
- Never infer framing from the publisher's name, reputation, or your prior beliefs about the outlet. A source name is given only to identify the article.
- leftPercentage, centerPercentage and rightPercentage are integers from 0 to 100 and MUST sum to exactly 100.
- politicalFramingLabel is one of: left, center, right, mixed, unclear.
- The label matches the strongest percentage, unless confidence is low or the percentages are close together — then use mixed.
- When the text gives weak evidence of any framing, use unclear and keep confidence low.
- confidence is 0 to 1 and reflects how strongly the article text supports your estimate.

Other fields:
- sentimentScore is -1 to 1 and describes the tone of the article's own language; sentimentLabel must agree with its sign.
- framingNotes: one or two sentences on the concrete textual evidence behind the estimate.
- loadedTerms: emotionally or politically loaded words and phrases quoted from the article. Return an empty array when there are none; never invent terms that are not in the text.
- disclaimer: one short sentence reminding the reader this analysis is AI-estimated and can be wrong.`;

function userPrompt({ title, sourceName, text }: AnalysisInput): string {
  return [
    `Source: ${sourceName}`,
    `Title: ${title}`,
    "",
    "Article text:",
    text.slice(0, MAX_ARTICLE_CHARS),
  ].join("\n");
}

/** Model and database errors never reach the client, so keep reasons coarse. */
function failureReason(cause: unknown): string {
  if (cause instanceof z.ZodError) {
    return "invalid_output_shape";
  }

  const name = cause instanceof Error ? cause.name : "";

  if (name === "NoObjectGeneratedError" || name === "NoOutputGeneratedError") {
    return "no_output_generated";
  }

  return "model_call_failed";
}

/**
 * Analyze one article, retrying once on a failed or invalid response (§19).
 *
 * Never throws: a second failure is returned as a typed failure result so one
 * article cannot abort a run.
 */
export async function analyzeArticle(
  input: AnalysisInput,
): Promise<AnalysisResult> {
  let reason = "model_call_failed";

  for (let attempt = 1; attempt <= ANALYSIS_ATTEMPTS; attempt++) {
    try {
      const result = await generateText({
        model: openai(ANALYSIS_MODEL),
        system: SYSTEM_PROMPT,
        prompt: userPrompt(input),
        output: Output.object({ schema: analysisFields }),
      });

      // `result.output` throws when the model produced no usable output.
      return {
        ok: true,
        output: analysisOutput.parse(result.output),
        model: ANALYSIS_MODEL,
      };
    } catch (cause) {
      reason = failureReason(cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      console.warn(
        `[analysis] attempt ${attempt}/${ANALYSIS_ATTEMPTS} failed (${reason}): ${message}`,
      );
    }
  }

  return { ok: false, reason };
}
